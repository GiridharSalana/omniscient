"""
Auth Router — JWT-based user authentication.
Register, login, and current-user endpoints.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from main import get_db

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Config ──────────────────────────────────────────────────────
SECRET_KEY  = os.getenv("JWT_SECRET_KEY", "omniscient-dev-secret-change-in-prod-please")
ALGORITHM   = "HS256"
EXPIRE_DAYS = 30

oauth2 = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

# ── Schemas ──────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    email:    str = Field(..., min_length=5)
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)

class LoginResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user_id:      int
    username:     str
    email:        str

class UserOut(BaseModel):
    id:         int
    username:   str
    email:      str
    created_at: datetime

# ── Helpers ──────────────────────────────────────────────────────
def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False

def create_token(user_id: int, username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=EXPIRE_DAYS)
    return jwt.encode(
        {"sub": str(user_id), "username": username, "exp": expire},
        SECRET_KEY, algorithm=ALGORITHM,
    )

async def get_current_user(
    token: Optional[str] = Depends(oauth2),
    db: AsyncSession = Depends(get_db),
) -> Optional[dict]:
    """Dependency — returns user dict or None (non-blocking for optional auth)."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub", 0))
    except (JWTError, ValueError):
        return None
    row = await db.execute(
        text("SELECT id, username, email, created_at FROM users WHERE id = :id"),
        {"id": user_id},
    )
    user = row.fetchone()
    return dict(user._mapping) if user else None

async def require_user(
    current_user: Optional[dict] = Depends(get_current_user),
) -> dict:
    """Dependency — raises 401 if not authenticated."""
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return current_user

# ── Endpoints ────────────────────────────────────────────────────
@router.post("/register", response_model=LoginResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Create a new account and return a JWT token immediately."""
    # Check uniqueness
    existing = await db.execute(
        text("SELECT id FROM users WHERE email = :e OR username = :u"),
        {"e": body.email, "u": body.username},
    )
    if existing.fetchone():
        raise HTTPException(status_code=409, detail="Email or username already taken")

    hashed = hash_password(body.password)
    result = await db.execute(
        text("""
            INSERT INTO users (email, username, hashed_pw)
            VALUES (:email, :username, :hashed_pw)
            RETURNING id, username, email, created_at
        """),
        {"email": body.email, "username": body.username, "hashed_pw": hashed},
    )
    row = result.fetchone()
    await db.execute(
        text("""
            INSERT INTO user_preferences (user_id) VALUES (:uid)
            ON CONFLICT (user_id) DO NOTHING
        """),
        {"uid": row.id},
    )
    await db.commit()
    logger.info("New user registered: %s", body.username)
    return LoginResponse(
        access_token=create_token(row.id, row.username),
        user_id=row.id,
        username=row.username,
        email=row.email,
    )

@router.post("/login", response_model=LoginResponse)
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db:   AsyncSession              = Depends(get_db),
):
    """Login with username/email + password, returns JWT."""
    row = await db.execute(
        text("SELECT id, username, email, hashed_pw FROM users WHERE username = :u OR email = :u"),
        {"u": form.username},
    )
    user = row.fetchone()
    if not user or not verify_password(form.password, user.hashed_pw):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return LoginResponse(
        access_token=create_token(user.id, user.username),
        user_id=user.id,
        username=user.username,
        email=user.email,
    )

@router.get("/me", response_model=UserOut)
async def me(current_user: dict = Depends(require_user)):
    """Return the currently authenticated user."""
    return current_user
