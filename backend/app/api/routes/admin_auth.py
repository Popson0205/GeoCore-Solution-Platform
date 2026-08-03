"""Login for the Admin Portal deployment specifically (see main_admin.py)
-- deliberately NOT the same router as the main platform's auth.py.

Two differences from a regular login:
1. No /register at all. Nobody should ever be invited to "create an
   account" on an internal tool's domain -- is_platform_admin is granted
   directly in the database for known team members only, so there's no
   self-service path to needing one here.
2. /login itself rejects a valid, correctly-authenticated user if their
   account isn't a platform admin -- not just after the fact via a
   frontend redirect or a 404 on the first API call they try. A regular
   GeoCore customer typing their real email/password into the admin
   login screen gets the exact same "Incorrect email or password" a
   wrong password would produce, not a successful login into a UI that
   then tells them they can't see anything.

This is defense in depth, not the only defense -- every route in
routes/admin.py still independently checks is_platform_admin via
require_platform_admin regardless of how a token was issued (a token
from the main platform's regular login is technically the same JWT
format and would still be correctly rejected by any admin route if
presented there). This just stops the login screen itself from ever
succeeding for the wrong kind of account.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.core.database import get_db
from backend.app.core.rate_limit import check_login_rate_limit, get_client_ip, record_login_attempt
from backend.app.core.security import create_access_token, verify_password
from backend.app.models.user import User
from backend.app.schemas.auth import Token, UserOut

router = APIRouter()


@router.post("/login", response_model=Token)
def admin_login(
    request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
):
    ip_address = get_client_ip(request)
    check_login_rate_limit(db, form_data.username, ip_address)

    user = db.query(User).filter(User.email == form_data.username).first()
    # A right password on a real, non-admin account still isn't a
    # success here -- this endpoint's whole job is "prove you're a
    # platform admin," not just "prove you're a valid GeoCore user."
    success = bool(user and verify_password(form_data.password, user.hashed_password) and user.is_platform_admin)
    record_login_attempt(db, form_data.username, ip_address, success)

    if not success:
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    token = create_access_token(subject=str(user.id))
    return Token(access_token=token)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user
