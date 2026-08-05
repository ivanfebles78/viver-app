from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
import os

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    # fallback SOLO para local (docker)
    DATABASE_URL = "postgresql+psycopg://vivero:vivero123@db:5432/vivero"

# Railway (y otros proveedores) entregan la URL como "postgres://...". SQLAlchemy
# 2.0 solo entiende "postgresql://". Normalizamos el esquema para evitar el
# clásico "Can't load plugin: sqlalchemy.dialects:postgres".
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql://" + DATABASE_URL[len("postgres://"):]

engine = create_engine(
    DATABASE_URL,
    # pool_pre_ping: verifica conexión antes de cada uso (descarta zombies).
    pool_pre_ping=True,
    # pool_recycle: recicla conexiones cada hora para evitar conexiones envejecidas
    # que el firewall o el propio Postgres puedan haber cerrado en silencio
    # (Railway suele cortar conexiones idle tras un rato).
    pool_recycle=3600,
    # Límites razonables del pool: si se agota, las nuevas requests fallan rápido
    # (en lugar de quedarse esperando indefinidamente y colgar el proceso).
    pool_size=5,
    max_overflow=10,
    pool_timeout=10,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

