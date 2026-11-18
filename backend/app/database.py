from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
database_url = settings.database_url
if database_url.startswith("postgres://"):
    database_url = "postgresql+psycopg://" + database_url.removeprefix("postgres://")
elif database_url.startswith("postgresql://"):
    database_url = "postgresql+psycopg://" + database_url.removeprefix("postgresql://")
if not database_url.startswith("postgresql+psycopg://"):
    raise ValueError("DATABASE_URL must use PostgreSQL with the psycopg driver.")
engine = create_engine(
    database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=5,
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def transaction() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        with db.begin():
            yield db
    finally:
        db.close()
