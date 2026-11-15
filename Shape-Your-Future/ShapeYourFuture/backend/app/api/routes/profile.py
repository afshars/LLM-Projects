"""
User profile: display name, bio (a short "motivational" blurb), avatar
(one of a handful of built-in presets, or a small user-uploaded image),
and password change. Everything here operates on the *current* user only
(via get_current_user) - there is no route that reads or edits anyone
else's profile.
"""
import base64
import binascii
import re

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, field_validator
from sqlmodel import Session

from app.api.deps import get_current_user
from app.core.rate_limit import limiter
from app.core.security import hash_password, validate_password_strength, verify_password
from app.db.database import get_db
from app.db.models import User

router = APIRouter(prefix="/profile", tags=["profile"])

# Keep this in sync with the preset list in the frontend
# (frontend/src/components/ProfilePanel.jsx / avatarPresets).
ALLOWED_AVATAR_PRESETS = {
    "fox", "cat", "owl", "bear", "panda", "robot", "astronaut", "star",
}

# Uploaded avatars are stored as a data: URI directly on the user row (no
# object storage in this project), so we cap the RAW image bytes - not the
# base64 text - to keep rows small. 300 KB is plenty for a small square
# avatar; the frontend also downsizes the image client-side before upload.
MAX_AVATAR_BYTES = 300 * 1024
_DATA_URI_RE = re.compile(r"^data:image/(png|jpeg|jpg|webp|gif);base64,(?P<data>.+)$")


class ProfileOut(BaseModel):
    username: str
    display_name: str
    bio: str | None
    avatar_kind: str
    avatar_value: str


def _to_out(user: User) -> ProfileOut:
    return ProfileOut(
        username=user.username,
        display_name=user.display_name or user.username,
        bio=user.bio,
        avatar_kind=user.avatar_kind,
        avatar_value=user.avatar_value,
    )


class UpdateProfileRequest(BaseModel):
    display_name: str | None = None
    bio: str | None = None

    @field_validator("display_name")
    @classmethod
    def name_len(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            return None
        if len(v) > 50:
            raise ValueError("نام نمایشی باید حداکثر ۵۰ کاراکتر باشد")
        return v

    @field_validator("bio")
    @classmethod
    def bio_len(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            return None
        if len(v) > 240:
            raise ValueError("بیو/جمله‌ی انگیزشی باید حداکثر ۲۴۰ کاراکتر باشد")
        return v


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return validate_password_strength(v)


class SetAvatarRequest(BaseModel):
    kind: str  # "preset" | "custom"
    value: str

    @field_validator("kind")
    @classmethod
    def kind_valid(cls, v: str) -> str:
        if v not in ("preset", "custom"):
            raise ValueError("نوع آواتار نامعتبر است")
        return v


@router.get("/me", response_model=ProfileOut)
def get_profile(user: User = Depends(get_current_user)):
    return _to_out(user)


@router.put("/me", response_model=ProfileOut)
def update_profile(
    body: UpdateProfileRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user.display_name = body.display_name
    user.bio = body.bio
    db.add(user)
    db.commit()
    db.refresh(user)
    return _to_out(user)


@router.put("/me/password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
def change_password(
    request: Request,
    body: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="رمز عبور فعلی نادرست است")
    user.hashed_password = hash_password(body.new_password)
    db.add(user)
    db.commit()


@router.put("/me/avatar", response_model=ProfileOut)
def set_avatar(
    body: SetAvatarRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.kind == "preset":
        if body.value not in ALLOWED_AVATAR_PRESETS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="آواتار انتخاب‌شده معتبر نیست")
        user.avatar_kind = "preset"
        user.avatar_value = body.value
    else:
        match = _DATA_URI_RE.match(body.value)
        if not match:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="فرمت تصویر پشتیبانی نمی‌شود (فقط PNG، JPEG، WEBP یا GIF)",
            )
        try:
            raw = base64.b64decode(match.group("data"), validate=True)
        except (binascii.Error, ValueError):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="فایل تصویر نامعتبر است")
        if len(raw) > MAX_AVATAR_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"حجم تصویر نباید بیشتر از {MAX_AVATAR_BYTES // 1024} کیلوبایت باشد",
            )
        user.avatar_kind = "custom"
        user.avatar_value = body.value

    db.add(user)
    db.commit()
    db.refresh(user)
    return _to_out(user)
