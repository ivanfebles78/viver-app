"""
Gestión de tokens de cuenta: activación inicial, reset de contraseña y unlock.

Reglas de seguridad:
- El token se genera con secrets.token_urlsafe (256 bits de entropía).
- Solo se entrega al usuario el token en claro (en el email).
- En BD se guarda únicamente el SHA-256 del token. No reversible.
- Caduca en 24 horas.
- Un solo uso: al consumirse se marca used_at.
- Comparación con secrets.compare_digest para evitar timing attacks.
- Estos tokens NO sirven para autenticar (login). Solo para fijar contraseña.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Literal, Optional

from sqlalchemy.orm import Session

from models import AccountToken, Usuario


TokenPurpose = Literal["activate", "reset", "unlock"]

TOKEN_LIFETIME_HOURS = 24
TOKEN_BYTES = 32  # secrets.token_urlsafe(32) -> ~43 chars URL-safe (~256 bits)


def _hash_token(token: str) -> str:
    """SHA-256 hex digest del token. Suficiente para tokens efímeros aleatorios."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_token(
    db: Session,
    user: Usuario,
    purpose: TokenPurpose,
    created_by: Optional[str] = None,
) -> str:
    """
    Genera un nuevo token, lo guarda hasheado y devuelve el token en claro
    (este valor SOLO viaja al usuario por email, nunca se persiste).

    Invalida cualquier token previo del mismo propósito para este usuario,
    de forma que solo exista un token activo por (user, purpose).
    """
    # Invalidar tokens previos no consumidos del mismo propósito
    db.query(AccountToken).filter(
        AccountToken.user_id == user.id,
        AccountToken.purpose == purpose,
        AccountToken.used_at.is_(None),
    ).update({"used_at": datetime.utcnow()}, synchronize_session=False)

    raw_token = secrets.token_urlsafe(TOKEN_BYTES)
    token_hash = _hash_token(raw_token)
    expires_at = datetime.utcnow() + timedelta(hours=TOKEN_LIFETIME_HOURS)

    record = AccountToken(
        user_id=user.id,
        token_hash=token_hash,
        purpose=purpose,
        expires_at=expires_at,
        created_by=created_by,
    )
    db.add(record)
    db.flush()  # asegura que el record existe en la transacción
    return raw_token


class TokenValidationError(Exception):
    """Se lanza cuando un token es inválido por cualquier motivo."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def lookup_token(db: Session, raw_token: str) -> AccountToken:
    """
    Localiza un token por su valor en claro. Lanza TokenValidationError si no
    existe, está caducado o ya ha sido usado.
    """
    if not raw_token or len(raw_token) < 20:
        raise TokenValidationError("invalid", "Token inválido o malformado.")

    token_hash = _hash_token(raw_token)

    # Búsqueda por hash. Aunque el hash ya es único, hacemos compare_digest
    # explícito sobre el resultado por robustez.
    record = db.query(AccountToken).filter(AccountToken.token_hash == token_hash).first()
    if record is None:
        raise TokenValidationError("invalid", "Token inválido o malformado.")

    if not secrets.compare_digest(record.token_hash, token_hash):
        raise TokenValidationError("invalid", "Token inválido o malformado.")

    if record.used_at is not None:
        raise TokenValidationError("used", "Este enlace ya ha sido utilizado.")

    if record.expires_at < datetime.utcnow():
        raise TokenValidationError("expired", "Este enlace ha caducado.")

    return record


def consume_token(db: Session, record: AccountToken) -> None:
    """Marca el token como usado. La operación que dispara el consumo es responsable
    del commit posterior."""
    record.used_at = datetime.utcnow()
    db.add(record)
