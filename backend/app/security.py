import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import AuthSession, Property, User

hasher = PasswordHasher()
settings = get_settings()
secret = settings.server_secret or secrets.token_urlsafe(48)
SESSION_COOKIE = "varshiq_session"
CSRF_COOKIE = "varshiq_csrf"


def utc(value):
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def password_matches(password, hashed):
    try:
        return hasher.verify(hashed, password)
    except (VerificationError, InvalidHashError):
        return False


def csrf_token():
    nonce = secrets.token_urlsafe(32)
    signature = hmac.new(secret.encode(), nonce.encode(), hashlib.sha256).hexdigest()
    return f"{nonce}.{signature}"


def valid_csrf(token):
    parts = token.rsplit(".", 1)
    if len(parts) != 2:
        return False
    expected = hmac.new(secret.encode(), parts[0].encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(parts[1], expected)


def check_csrf(request: Request):
    cookie = request.cookies.get(CSRF_COOKIE, "")
    header = request.headers.get("x-csrf-token", "")
    origin = request.headers.get("origin")
    if origin and origin not in settings.origins:
        raise HTTPException(403, "Request origin is not authorised")
    if not cookie or not header or not hmac.compare_digest(cookie, header) or not valid_csrf(header):
        raise HTTPException(403, "Session security token expired; refresh the page and retry")


def set_csrf(response: Response, token: str):
    response.set_cookie(
        CSRF_COOKIE,
        token,
        httponly=True,
        secure=settings.app_env == "production",
        samesite="strict",
        max_age=86400,
        path="/",
    )


def optional_user(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == digest(token)))
    if session is None or utc(session.expires_at) <= datetime.now(UTC):
        return None
    return db.get(User, session.user_id)


def require_user(user: User | None = Depends(optional_user)):
    if user is None:
        raise HTTPException(401, "Sign in to access private property information")
    return user


def require_admin(user: User = Depends(require_user)):
    if user.role != "admin":
        raise HTTPException(403, "Administrator access is required")
    return user


def authorised_property(db, property_id, user):
    prop = db.get(Property, property_id)
    if prop is None or (prop.organisation_id != user.organisation_id and user.role != "admin"):
        raise HTTPException(404, "Property not found or access is unavailable")
    return prop


def create_session(db, user, response):
    token = secrets.token_urlsafe(48)
    db.add(
        AuthSession(
            token_hash=digest(token), user_id=user.id, expires_at=datetime.now(UTC) + timedelta(hours=12)
        )
    )
    db.commit()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        secure=settings.app_env == "production",
        samesite="strict",
        max_age=43200,
        path="/",
    )
    csrf = csrf_token()
    set_csrf(response, csrf)
    return csrf
