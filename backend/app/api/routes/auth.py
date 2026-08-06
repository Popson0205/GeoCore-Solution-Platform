from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.core.database import get_db
from backend.app.core.rate_limit import check_login_rate_limit, get_client_ip, record_login_attempt
from backend.app.core.roles import OWNER
from backend.app.core.security import create_access_token, hash_password, verify_password
from backend.app.core.slugify import unique_org_slug
from backend.app.models.organisation import Organisation, OrganisationMember
from backend.app.models.user import User
from backend.app.schemas.auth import Token, UserCreate, UserOut

router = APIRouter()


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    """Every account gets exactly one organisation immediately, not just
    a bare login — account_type decides its shape:
    - "organization": named from payload.organisation_name (required —
      see UserCreate's validator), plan="organization".
    - "personal": auto-named single-seat workspace, plan="personal".

    Either way the new org starts unlicensed, same as one created
    directly via POST /organisations already could — it just can't
    create anything (see deps_project.require_active_license) until a
    real license is applied from Organization Settings, or an
    additional org is activated via a license key from the org picker.
    This just means that first org — the one nearly every account
    actually needs — no longer requires a second, separate step to
    bring into existence.
    """
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.flush()

    if payload.account_type == "organization":
        org_name = payload.organisation_name.strip()
        plan = "organization"
    else:
        display_name = (payload.full_name or payload.email.split("@")[0]).split()[0]
        org_name = f"{display_name}'s Workspace"
        plan = "personal"

    org = Organisation(name=org_name, slug=unique_org_slug(db, org_name), plan=plan)
    db.add(org)
    db.flush()
    db.add(OrganisationMember(organisation_id=org.id, user_id=user.id, role=OWNER))

    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    ip_address = get_client_ip(request)
    # Checked BEFORE the password is verified — the point of rate
    # limiting is to stop a brute-force attempt from getting to try more
    # passwords at all, not just to log that it happened.
    check_login_rate_limit(db, form_data.username, ip_address)

    user = db.query(User).filter(User.email == form_data.username).first()
    success = bool(user and verify_password(form_data.password, user.hashed_password))
    record_login_attempt(db, form_data.username, ip_address, success)

    if not success:
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    token = create_access_token(subject=str(user.id))
    return Token(access_token=token)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user
