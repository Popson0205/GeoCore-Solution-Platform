from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "GeoCore"
    app_env: str = "development"
    app_debug: bool = True
    app_version: str = "1.0.0"
    cors_origins: str = "http://localhost:5173,http://localhost:8000"
    secret_key: str = "change-this-secret"
    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/geocore"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


settings = Settings()
