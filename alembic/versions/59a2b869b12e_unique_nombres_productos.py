"""unique nombres productos

Revision ID: 59a2b869b12e
Revises: 06900ae2791f
Create Date: 2026-03-03 11:49:34.342634
"""

from typing import Sequence, Union
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '59a2b869b12e'
down_revision: Union[str, Sequence[str], None] = '06900ae2791f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Crea índices únicos normalizados (trim + lower)
    para evitar duplicados por:
    - nombre_cientifico
    - nombre_natural

    Ignora valores vacíos.
    """

    # Único por nombre_cientifico normalizado
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_productos_nombre_cientifico_norm
        ON productos (lower(btrim(nombre_cientifico)))
        WHERE nullif(btrim(nombre_cientifico), '') IS NOT NULL;
    """)

    # Único por nombre_natural normalizado
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_productos_nombre_natural_norm
        ON productos (lower(btrim(nombre_natural)))
        WHERE nullif(btrim(nombre_natural), '') IS NOT NULL;
    """)


def downgrade() -> None:
    """
    Elimina los índices únicos.
    """

    op.execute("DROP INDEX IF EXISTS uq_productos_nombre_cientifico_norm;")
    op.execute("DROP INDEX IF EXISTS uq_productos_nombre_natural_norm;")