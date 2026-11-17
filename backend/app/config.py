from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "local"
    backend_origin: str = "http://localhost:8000"
    public_web_origin: str = "http://localhost:5173"
    database_url: str = "sqlite:///./ten_minutes.db"
    auto_create_schema: bool = True
    session_cookie_name: str = "ten_minutes_session"
    session_cookie_secure: bool = False
    session_ttl_days: int = Field(default=14, ge=1, le=90)
    oauth_state_ttl_seconds: int = Field(default=600, ge=60, le=1800)

    kakao_client_id: Optional[str] = None
    kakao_client_secret: Optional[str] = None
    naver_client_id: Optional[str] = None
    naver_client_secret: Optional[str] = None

    openai_api_key: Optional[str] = None
    openai_realtime_model: str = "gpt-realtime"
    typecast_api_key: Optional[str] = None
    typecast_voice_id: Optional[str] = None
    typecast_model: str = "ssfm-v21"

    default_card_count: int = Field(default=3, ge=1, le=10)
    max_question_length: int = Field(default=300, ge=1, le=1000)
    max_tts_text_length: int = Field(default=500, ge=1, le=5000)


@lru_cache
def get_settings() -> Settings:
    return Settings()
