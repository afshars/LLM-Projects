import re

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, field_validator
from app.core.rate_limit import limiter
from sqlmodel import Session, select

from app.core.security import (
    create_access_token,
    hash_password,
    validate_password_strength,
    verify_password,
)
from app.db.database import get_db
from app.db.models import User

router = APIRouter(prefix="/auth", tags=["auth"])

USERNAME_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_.]{2,29}$")


class RegisterRequest(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def username_format(cls, v: str) -> str:
        if not USERNAME_PATTERN.match(v):
            raise ValueError(
                "نام کاربری باید با حرف انگلیسی شروع شود، ۳ تا ۳۰ کاراکتر باشد و فقط "
                "شامل حروف، عدد، نقطه یا زیرخط (_) باشد"
            )
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return validate_password_strength(v)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(request: Request, body: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.exec(select(User).where(User.username == body.username)).first()
    if existing:
        # Same generic error as a failed login would give away nothing about
        # which usernames exist - avoid user-enumeration in error messages.
        raise HTTPException(status_code=400, detail="امکان ثبت‌نام با این مشخصات وجود ندارد")

    user = User(username=body.username, hashed_password=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(subject=user.username)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.exec(select(User).where(User.username == form_data.username)).first()
    # Deliberately identical error + roughly-equal work for "no such user" vs
    # "wrong password", so timing/response can't be used to enumerate usernames.
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="نام کاربری یا رمز عبور نادرست است")

    token = create_access_token(subject=user.username)
    return TokenResponse(access_token=token)
