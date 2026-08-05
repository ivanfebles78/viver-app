"""pedido_items.estado_item — per-item approval state

Adds a per-item state column (`estado_item`) to `pedido_items` so the
manager can approve / deny individual lines instead of the whole order.

  - RESERVA  → item still pending decision (default for new items).
  - APROBADO → manager approved this item.
  - DENEGADO → manager denied this item.

The pedido's global `estado` is now DERIVED from its items:
  - Any item still RESERVA  → pedido stays RESERVA.
  - All items decided + ≥1 APROBADO → pedido = APROBADO.
  - All items DENEGADO     → pedido = DENEGADO.

Backfill: existing items inherit the parent pedido's state so the
upgrade is non-destructive.

Revision ID: b8c4f9a2e106
Revises: 671644fc3faf
Create Date: 2026-06-10
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b8c4f9a2e106'
down_revision: Union[str, Sequence[str], None] = '671644fc3faf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add `estado_item` and backfill from parent pedido state."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("pedido_items")}

    # Defensive: skip if column already added manually.
    if "estado_item" not in cols:
        op.add_column(
            "pedido_items",
            sa.Column(
                "estado_item",
                sa.String(length=20),
                nullable=False,
                server_default="RESERVA",
            ),
        )
        op.create_index(
            "ix_pedido_items_estado_item",
            "pedido_items",
            ["estado_item"],
            unique=False,
        )

    # Backfill: each existing item inherits its parent pedido's state.
    # APROBADO / SERVIDO pedidos → all items APROBADO.
    # DENEGADO pedidos          → all items DENEGADO.
    # Anything else (RESERVA / unknown) → leave as RESERVA (the default).
    op.execute("""
        UPDATE pedido_items pi
        SET estado_item = 'APROBADO'
        FROM pedidos p
        WHERE pi.pedido_id = p.id
          AND UPPER(COALESCE(p.estado, '')) IN ('APROBADO', 'SERVIDO')
          AND pi.estado_item = 'RESERVA';
    """)

    op.execute("""
        UPDATE pedido_items pi
        SET estado_item = 'DENEGADO'
        FROM pedidos p
        WHERE pi.pedido_id = p.id
          AND UPPER(COALESCE(p.estado, '')) = 'DENEGADO'
          AND pi.estado_item = 'RESERVA';
    """)


def downgrade() -> None:
    """Remove `estado_item` and its index."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("pedido_items")}

    if "estado_item" in cols:
        # Drop index first if it exists.
        existing_indexes = {idx["name"] for idx in inspector.get_indexes("pedido_items")}
        if "ix_pedido_items_estado_item" in existing_indexes:
            op.drop_index("ix_pedido_items_estado_item", table_name="pedido_items")
        op.drop_column("pedido_items", "estado_item")
