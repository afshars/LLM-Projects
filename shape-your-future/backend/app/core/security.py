"""
Auth primitives - password hashing + JWT - built entirely on Python's
standard library (hashlib, hmac, secrets, base64, json). No bcrypt, no
python-jose. Two deliberate reasons:

  1. Fewer C-extension dependencies (bcrypt, cryptography) means fewer
     places a Docker build can fail on an unfamiliar platform - which
     matters for a from-scratch HF Spaces deploy.
  2. It keeps the entire auth path auditable in ~100 lines instead of
     trusting a third-party implementation for something this security-
     critical.

Password hashing: hashlib.scrypt (memory-hard, stdlib since Python 3.6).
Parameters are stored IN the hash string, so they can be tuned later
without invalidating existing users' passwords.

Tokens: a minimal, correct HS256 JWT (header.payload.signature, base64url,
HMAC-SHA256). Only what this app needs - a "sub" claim and an "exp" claim -
nothing more, so there's no larger JWT feature surface to get wrong.
"""
import base64
import string
import binascii
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone

from app.core.config import settings

ALGORITHM = "HS256"

# scrypt cost parameters - N=2**14 is a reasonable interactive-login cost
# (~16MB memory, a few ms), well above a bare hash, without being so slow
# it hurts UX. Tune upward later if this ever needs to resist a serious
# offline attack budget; the params travel with each hash so that's safe.
_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_DKLEN = 32


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=_SCRYPT_DKLEN
    )
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt.hex()}${derived.hex()}"


def validate_password_strength(password: str) -> str:
    """Shared password policy for both registration and password-change.

    Requires 8+ chars, an uppercase letter, a lowercase letter, a digit,
    and at least ONE special character (any ASCII punctuation symbol -
    no longer specifically "@" or "."). Raises ValueError with a Persian message on the
    first failing rule so pydantic field_validators can call this
    directly.
    """
    if len(password) < 8:
        raise ValueError("رمز عبور باید حداقل ۸ کاراکتر باشد")
    if not any(c.islower() and c.isascii() for c in password):
        raise ValueError("رمز عبور باید شامل حرف کوچک انگلیسی باشد")
    if not any(c.isupper() and c.isascii() for c in password):
        raise ValueError("رمز عبور باید شامل حرف بزرگ انگلیسی باشد")
    if not any(c.isdigit() for c in password):
        raise ValueError("رمز عبور باید شامل عدد باشد")
    if not any(c in string.punctuation for c in password):
        raise ValueError("رمز عبور باید شامل حداقل یک نماد خاص (مثل @ . ! # _) باشد")
    return password


def verify_password(plain: str, hashed: str) -> bool:
    try:
        scheme, n, r, p, salt_hex, hash_hex = hashed.split("$")
        if scheme != "scrypt":
            return False
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
        derived = hashlib.scrypt(
            plain.encode("utf-8"), salt=salt, n=int(n), r=int(r), p=int(p), dklen=len(expected)
        )
        return hmac.compare_digest(derived, expected)
    except (ValueError, binascii.Error):
        # malformed hash (or a legacy format) - never raise on untrusted
        # input, just treat as "does not match"
        return False


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(s: str) -> bytes:
    padding = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + padding)


def create_access_token(subject: str, expires_minutes: int | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=expires_minutes or settings.access_token_expire_minutes
    )
    header = {"alg": ALGORITHM, "typ": "JWT"}
    payload = {"sub": subject, "exp": int(expire.timestamp())}

    signing_input = (
        _b64url_encode(json.dumps(header, separators=(",", ":")).encode())
        + "."
        + _b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
    )
    signature = hmac.new(settings.secret_key.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    return f"{signing_input}.{_b64url_encode(signature)}"


def decode_access_token(token: str) -> str | None:
    try:
        header_b64, payload_b64, sig_b64 = token.split(".")
        signing_input = f"{header_b64}.{payload_b64}"
        expected_sig = hmac.new(
            settings.secret_key.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256
        ).digest()
        actual_sig = _b64url_decode(sig_b64)

        if not hmac.compare_digest(expected_sig, actual_sig):
            return None

        payload = json.loads(_b64url_decode(payload_b64))
        if payload.get("exp", 0) < datetime.now(timezone.utc).timestamp():
            return None  # expired

        return payload.get("sub")
    except (ValueError, KeyError, binascii.Error, json.JSONDecodeError):
        return None
