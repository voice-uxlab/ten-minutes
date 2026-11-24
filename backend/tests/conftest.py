import hashlib
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).parents[1]))

from app.config import get_settings
from app.database import get_db
from app.db_base import Base
from app.main import app
from app.models import ServiceSession, User
from app.seed_cards import seed_tarot_cards


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    session = session_factory()
    seed_tarot_cards(session)

    def override_db():
        try:
            yield session
        finally:
            pass

    app.dependency_overrides[get_db] = override_db
    yield session
    app.dependency_overrides.clear()
    session.close()
    Base.metadata.drop_all(engine)


@pytest.fixture
def authenticated_client(db_session):
    user = User(addressing_mode="DEFAULT", consent_version="2026-11")
    db_session.add(user)
    db_session.flush()
    raw_token = "test-session-token"
    db_session.add(
        ServiceSession(
            user_id=user.id,
            token_hash=hashlib.sha256(raw_token.encode()).hexdigest(),
            expires_at=datetime.now(timezone.utc) + timedelta(days=1),
        )
    )
    db_session.commit()
    with TestClient(app) as client:
        client.cookies.set(get_settings().session_cookie_name, raw_token)
        yield client, user
