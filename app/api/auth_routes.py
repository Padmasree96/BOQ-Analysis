"""
auth_routes.py
Authentication endpoints supporting both:
  1. Supabase Auth (JWT verification) — production
  2. Local auth (email/password with SQLite) — fallback for development

Profile CRUD for engineer_profiles via Supabase or local DB.
"""

import os
from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from typing import Optional

from app.services.supabase_auth import (
    get_user_from_token,
    extract_bearer_token,
    SUPABASE_JWT_SECRET,
)
from app.services.auth_service import (
    init_db,
    register_user,
    login_user,
    get_user_by_email,
    create_token,
    verify_token,
    send_comparison_report_to_user,
)

from loguru import logger

auth_router = APIRouter(prefix="/auth", tags=["auth"])

# Initialise DB on module load
init_db()

# Detect if Supabase is configured
_USE_SUPABASE = bool(SUPABASE_JWT_SECRET and len(SUPABASE_JWT_SECRET) > 20)
if _USE_SUPABASE:
    logger.info("[Auth] Mode: Supabase JWT verification")
else:
    logger.info("[Auth] Mode: Local JWT (set SUPABASE_JWT_SECRET for Supabase)")


# ── Pydantic models ──────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email:       str
    password:    str
    full_name:   str
    company:     str = ""
    phone:       str = ""
    designation: str = ""


class LoginRequest(BaseModel):
    email:    str
    password: str


class ProfileUpdateRequest(BaseModel):
    full_name:   Optional[str] = None
    company:     Optional[str] = None
    phone:       Optional[str] = None
    designation: Optional[str] = None


class AutoReportRequest(BaseModel):
    subject:      str
    report_body:  str
    project_name: str = "Construction Project"


# ── Unified auth helper ──────────────────────────────────────────────────────────

def _get_current_user(authorization: str = "") -> dict:
    """
    Extract and verify token from Authorization header.
    Tries Supabase JWT first, then falls back to local JWT.
    """
    token = extract_bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    # Try Supabase JWT first
    if _USE_SUPABASE:
        supa_user = get_user_from_token(token)
        if supa_user:
            return {
                "id":          supa_user["id"],
                "email":       supa_user["email"],
                "full_name":   supa_user.get("user_metadata", {}).get("full_name", ""),
                "company":     supa_user.get("user_metadata", {}).get("company", ""),
                "role":        supa_user.get("role", "engineer"),
                "auth_source": "supabase",
            }

    # Fallback to local JWT
    email = verify_token(token)
    if not email:
        raise HTTPException(status_code=401, detail="Token expired or invalid. Please log in again.")
    user = get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=401, detail="User not found.")
    user["auth_source"] = "local"
    return user


# ── POST /auth/register (local fallback) ─────────────────────────────────────────

@auth_router.post("/register")
async def register(body: RegisterRequest):
    """
    Create a new engineer account (local DB).
    When using Supabase, signup happens client-side via supabase.auth.signUp().
    This endpoint is a fallback for local-only development.
    """
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    if not body.full_name.strip():
        raise HTTPException(status_code=400, detail="Full name is required.")

    try:
        user  = register_user(body.email, body.password, body.full_name, body.company)
        token = create_token(user["email"])
        return {
            "success": True,
            "token":   token,
            "user": {
                "id":        user["id"],
                "email":     user["email"],
                "full_name": user["full_name"],
                "company":   user["company"],
                "role":      user["role"],
            },
        }
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Registration failed: {e}")


# ── POST /auth/login (local fallback) ────────────────────────────────────────────

@auth_router.post("/login")
async def login(body: LoginRequest):
    """
    Authenticate an existing engineer (local DB).
    When using Supabase, login happens client-side via supabase.auth.signInWithPassword().
    This endpoint is a fallback for local-only development.
    """
    user = login_user(body.email, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect email or password.")

    token = create_token(user["email"])
    return {
        "success": True,
        "token":   token,
        "user": {
            "id":        user["id"],
            "email":     user["email"],
            "full_name": user["full_name"],
            "company":   user["company"],
            "role":      user["role"],
        },
    }


# ── GET /auth/me ──────────────────────────────────────────────────────────────────

@auth_router.get("/me")
async def get_me(authorization: str = Header(default="")):
    """
    Return current user profile from token.
    Works with both Supabase and local JWT tokens.
    """
    user = _get_current_user(authorization)
    return {
        "id":          user.get("id"),
        "email":       user.get("email"),
        "full_name":   user.get("full_name", ""),
        "company":     user.get("company", ""),
        "phone":       user.get("phone", ""),
        "designation": user.get("designation", ""),
        "role":        user.get("role", "engineer"),
        "auth_source": user.get("auth_source", "unknown"),
    }


# ── GET /auth/profile ────────────────────────────────────────────────────────────

@auth_router.get("/profile")
async def get_profile(authorization: str = Header(default="")):
    """Get the engineer profile for the authenticated user."""
    user = _get_current_user(authorization)
    return {
        "id":          user.get("id"),
        "email":       user.get("email"),
        "full_name":   user.get("full_name", ""),
        "company":     user.get("company", ""),
        "phone":       user.get("phone", ""),
        "designation": user.get("designation", ""),
        "role":        user.get("role", "engineer"),
    }


# ── PUT /auth/profile ────────────────────────────────────────────────────────────

@auth_router.put("/profile")
async def update_profile(
    body: ProfileUpdateRequest,
    authorization: str = Header(default=""),
):
    """Update engineer profile fields."""
    user = _get_current_user(authorization)
    # For now, return the updated fields (actual DB update depends on Supabase setup)
    updated = {
        "id":          user.get("id"),
        "email":       user.get("email"),
        "full_name":   body.full_name   or user.get("full_name", ""),
        "company":     body.company     or user.get("company", ""),
        "phone":       body.phone       or user.get("phone", ""),
        "designation": body.designation or user.get("designation", ""),
        "role":        user.get("role", "engineer"),
    }
    return updated


# ── POST /auth/send-comparison-report ─────────────────────────────────────────────

@auth_router.post("/send-comparison-report")
async def send_comparison_report(
    body: AutoReportRequest,
    authorization: str = Header(default=""),
):
    """
    Automatically send the BOQ vs CAD comparison report to the logged-in engineer's email.
    No manual email entry needed — uses the account email directly.
    """
    user = _get_current_user(authorization)

    result = send_comparison_report_to_user(
        engineer_email=user.get("email", ""),
        engineer_name=user.get("full_name", "Engineer"),
        subject=body.subject,
        report_body=body.report_body,
    )

    if result.get("preview_mode"):
        return {
            **result,
            "sent_to":    user.get("email"),
            "message":    "SMTP not configured. Report generated but not sent.",
        }

    return {
        **result,
        "sent_to":    user.get("email"),
        "message":    f"Report automatically sent to {user.get('email')}",
    }
