import pytest
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db_url import normalize_postgres_url
from app.models import TarotCard


@pytest.mark.postgresql
def test_migrated_postgresql_database_is_ready():
    raw_url = get_settings().test_database_url
    if not raw_url:
        pytest.skip("TEST_DATABASE_URL is not configured")

    engine = create_engine(
        normalize_postgres_url(raw_url, "TEST_DATABASE_URL"),
        pool_pre_ping=True,
        connect_args={"prepare_threshold": None},
    )
    try:
        with Session(engine) as db:
            assert db.scalar(text("select current_database()"))
            assert db.scalar(select(func.count()).select_from(TarotCard)) == 78
            star = db.scalar(select(TarotCard).where(TarotCard.id == 17))
            assert star.name_ko == "별"
            assert (star.arcana, star.suit, star.rank) == ("MAJOR", None, "17")
            assert star.code == "major-17-star"
            assert star.image_path == "major/17-star.png"
            ace_of_wands = db.scalar(select(TarotCard).where(TarotCard.id == 22))
            assert (ace_of_wands.arcana, ace_of_wands.suit, ace_of_wands.rank) == (
                "MINOR",
                "WANDS",
                "ACE",
            )
            assert ace_of_wands.code == "wands-ace"
            assert ace_of_wands.image_path == "wands/22-ace.png"
    finally:
        engine.dispose()
