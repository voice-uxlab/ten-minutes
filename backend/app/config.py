from functools import lru_cache
from typing import Literal, Optional

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "local"
    backend_origin: str = "http://localhost:8000"
    public_web_origin: str = "http://localhost:5173"
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/ten_minutes"
    migration_database_url: Optional[str] = None
    test_database_url: Optional[str] = None
    database_pool_size: int = Field(default=1, ge=1, le=10)
    database_max_overflow: int = Field(default=0, ge=0, le=10)
    session_cookie_name: str = "ten_minutes_session"
    session_cookie_secure: bool = False
    session_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    session_ttl_days: int = Field(default=14, ge=1, le=90)
    oauth_state_ttl_seconds: int = Field(default=600, ge=60, le=1800)

    kakao_client_id: Optional[str] = None
    kakao_client_secret: Optional[str] = None

    openai_api_key: Optional[str] = None
    openai_realtime_model: str = "gpt-realtime"
    openai_realtime_prompt_id: str = ""
    openai_realtime_prompt_version: str = ""
    openai_report_model: str = "gpt-4.1-mini"
    typecast_api_key: Optional[str] = None
    typecast_voice_id: Optional[str] = None
    typecast_model: str = "ssfm-v30"
    voice_cleanup_secret: Optional[SecretStr] = None
    voice_connections_per_consultation: int = Field(default=8, ge=1)
    voice_connections_per_account_day: int = Field(default=40, ge=1)
    tts_characters_per_consultation: int = Field(default=12000, ge=1)
    tts_characters_per_account_day: int = Field(default=60000, ge=1)
    tts_parallel_requests: int = Field(default=4, ge=1)


    guest_sessions_per_day: int = Field(default=100, ge=0)
    default_card_count: int = Field(default=3, ge=1, le=10)
    max_question_length: int = Field(default=300, ge=1, le=1000)
    max_tts_text_length: int = Field(default=500, ge=1, le=5000)


@lru_cache
def get_settings() -> Settings:
    return Settings()
