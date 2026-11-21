def normalize_postgres_url(value: str, setting_name: str = "DATABASE_URL") -> str:
    if value.startswith("postgres://"):
        value = "postgresql+psycopg://" + value.removeprefix("postgres://")
    elif value.startswith("postgresql://"):
        value = "postgresql+psycopg://" + value.removeprefix("postgresql://")
    if not value.startswith("postgresql+psycopg://"):
        raise ValueError(f"{setting_name} must use PostgreSQL with the psycopg driver.")
    return value
