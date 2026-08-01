import logging
import re

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    app_name: str = "GeoCore"
    app_env: str = "development"
    app_debug: bool = True
    app_version: str = "1.0.0"
    cors_origins: str = "http://localhost:5173,http://localhost:8000"
    secret_key: str = "change-this-secret"

    # Preferred: set these instead of DATABASE_URL. Values are assembled into
    # a connection string with proper percent-encoding, so special characters
    # in the password (@, /, #, %, etc.) can never corrupt the host/port.
    db_user: str | None = None
    db_password: str | None = None
    db_host: str | None = None
    db_port: int = 5432
    db_name: str = "postgres"

    # Legacy/override: a full connection string. Only used if the db_* fields
    # above aren't set. If you must use this, percent-encode any special
    # characters in the password yourself (e.g. "@" -> "%40").
    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/geocore"

    # Schema is now owned by Alembic (see alembic.ini / backend/alembic/).
    # `Base.metadata.create_all()` at startup is a dev/testing convenience
    # only — leave this False anywhere migrations should be the source of
    # truth (staging, production) and run `alembic upgrade head` instead.
    auto_create_tables: bool = False

    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    # GeoAI — optional narrative analysis woven into generated reports (see
    # core/geoai.py). Reports work fine with this unset; the "Generate with
    # GeoAI insights" option is just unavailable until a key is configured.
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-sonnet-5"

    # Licensing (see core/licensing.py) — this is the Ed25519 PUBLIC key,
    # safe to bake into every deployment including on-prem/air-gapped
    # ones. It can only verify license keys, never mint new ones; the
    # matching private key stays with the vendor and is never distributed
    # (see scripts/issue_license.py). Deployments ship a default GeoCore
    # key pair for development; production deployments should generate
    # their own via scripts/generate_license_keypair.py and set this to
    # the resulting public key.
    license_public_key: str | None = None
    # The Ed25519 PRIVATE key — deliberately separate from the public key
    # above. This must ONLY ever be set on your team's own Admin Portal
    # instance, NEVER on any customer deployment (cloud or on-prem). The
    # admin license-issuing endpoint (routes/admin.py) hard-requires this
    # to be present and simply doesn't work without it — so even if the
    # Admin Portal's routes exist in a customer's build, they're inert
    # without this secret, which they never have.
    license_private_key: str | None = None
    # "cloud" (multi-tenant, vendor-operated) or "on_prem" (customer-
    # operated, possibly air-gapped). Purely informational/diagnostic
    # today — license payloads carry their own deployment_mode that's
    # checked against this if you want to prevent an on-prem key being
    # used to unlock a cloud instance or vice versa.
    deployment_mode: str = "cloud"

    # Resend (https://resend.com) — used only by the Admin Portal to
    # email a newly-issued license key straight to the customer's address
    # on file. Optional: if unset, license issuance still works, it just
    # doesn't auto-send (see core/email.py).
    resend_api_key: str | None = None
    resend_from_email: str = "licensing@geocore.example"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def sqlalchemy_database_url(self) -> str:
        # Preferred path: build the URL from components. sqlalchemy.engine.URL
        # percent-encodes user/password automatically, so it's impossible for
        # a raw "@", "/", "#", etc. in the password to break host parsing.
        if self.db_user and self.db_password and self.db_host:
            url = URL.create(
                drivername="postgresql+psycopg2",
                username=self.db_user,
                password=self.db_password,
                host=self.db_host,
                port=self.db_port,
                database=self.db_name,
                query={"sslmode": "require"},
            )
            return url.render_as_string(hide_password=False)

        # Fallback path: a raw DATABASE_URL was provided. Defend against the
        # single most common mistake here - an unescaped "@" left inside the
        # password (e.g. "...:MyPass@word@host:5432/..."), which otherwise
        # silently splits into a garbage host like "@host". If we detect
        # more than one "@" before the final host segment, percent-encode
        # all but the last one and warn loudly instead of failing at connect
        # time with a confusing "connection refused" on a mangled hostname.
        raw = self.database_url
        match = re.match(r"^(?P<scheme>[\w+]+://)(?P<rest>.+)$", raw)
        if match:
            rest = match.group("rest")
            at_count = rest.count("@")
            if at_count > 1:
                head, host_part = rest.rsplit("@", 1)
                fixed_head = head.replace("@", "%40")
                raw = f"{match.group('scheme')}{fixed_head}@{host_part}"
                logger.warning(
                    "DATABASE_URL contained an unescaped '@' in the credentials "
                    "portion - auto-encoding it as %%40 so the host doesn't get "
                    "corrupted. Please update the source env var (Railway, .env, "
                    "etc.) to percent-encode special characters in the password "
                    "instead of relying on this fallback."
                )
        return raw


settings = Settings()
