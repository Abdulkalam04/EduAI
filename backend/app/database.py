from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def run_sqlite_migrations(target_engine=engine) -> None:
    if not str(target_engine.url).startswith("sqlite"):
        return
    tables = [
        "chat_sessions",
        "chat_messages",
        "study_documents",
        "viva_sessions",
        "practice_papers",
        "practice_attempts",
        "practice_evaluations",
    ]
    with target_engine.begin() as conn:
        for table in tables:
            table_exists = conn.exec_driver_sql(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=:name",
                {"name": table},
            ).fetchone()
            if not table_exists:
                continue
            cols = [
                row[1]
                for row in conn.exec_driver_sql(f'PRAGMA table_info("{table}")').fetchall()
            ]
            if "user_id" not in cols:
                conn.exec_driver_sql(
                    f'ALTER TABLE "{table}" ADD COLUMN user_id VARCHAR(128) NOT NULL DEFAULT \'local\''
                )
                conn.exec_driver_sql(
                    f'CREATE INDEX IF NOT EXISTS "ix_{table}_user_id" ON "{table}" (user_id)'
                )
            if table == "chat_messages" and "model" not in cols:
                conn.exec_driver_sql(
                    'ALTER TABLE "chat_messages" ADD COLUMN model VARCHAR(256) NULL'
                )


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
