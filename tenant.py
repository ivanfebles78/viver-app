"""
Aislamiento multi-tenant (multi-ayuntamiento) a nivel de ORM.

viver-app sirve a varios ayuntamientos ("clientes"). Cada usuario pertenece a
un cliente y solo puede ver los datos de SU ayuntamiento. En lugar de añadir un
`.filter(Model.cliente_id == X)` a mano en cada una de las ~200 consultas del
backend (frágil y fácil de olvidar → fuga de datos entre ayuntamientos), se
aplica el filtro de forma AUTOMÁTICA mediante eventos de SQLAlchemy.

Cómo funciona
-------------
- El `cliente_id` activo de la petición se guarda en `session.info["cliente_id"]`.
  Se usa la propia Session (y no un ContextVar) porque FastAPI ejecuta las
  dependencias síncronas y el endpoint en hilos distintos del threadpool, donde
  un ContextVar NO se propaga; la Session, en cambio, es el mismo objeto por
  referencia y los listeners la reciben directamente.
- `do_orm_execute`: antes de ejecutar cualquier SELECT ORM, se le añade un
  `with_loader_criteria(Model, Model.cliente_id == cid)` por cada modelo con
  tenant. Filtra también joins, cargas de relaciones y lazy-loads.
- `before_flush`: a cada objeto nuevo (INSERT) de un modelo con tenant se le
  estampa el `cliente_id` activo si no lo trae.

Cuándo NO filtra (a propósito)
------------------------------
- Si `session.info["cliente_id"]` es None (p.ej. peticiones pre-login como el
  propio login, la validación de tokens de cuenta, o el arranque/seed) no se
  aplica ningún filtro. El super-admin global (rol "admin" sin ayuntamiento
  seleccionado) también opera con None y ve todos los ayuntamientos.
- Con `.execution_options(skip_tenant=True)` se puede saltar el filtro de forma
  explícita (p.ej. copia de seguridad global).

OJO: los `bulk` (`query.delete()` / `query.update()`) y el SQL crudo NO pasan
por `do_orm_execute`; esos hay que acotarlos a mano en main.py.
"""

from sqlalchemy import event
from sqlalchemy.orm import Session, with_loader_criteria

from models import (
    Usuario,
    Producto,
    CaducidadConfig,
    Lote,
    InventarioLote,
    Pedido,
    PedidoItem,
    Movimiento,
    ZonaPolygon,
    MovimientoLoteDetalle,
)

# Modelos que llevan cliente_id y deben aislarse por ayuntamiento.
# `Cliente` NO está aquí: es el registro raíz de ayuntamientos y su acceso se
# controla explícitamente en los endpoints (cada usuario ve solo el suyo, el
# admin global ve todos).
TENANT_MODELS = [
    Usuario,
    Producto,
    CaducidadConfig,
    Lote,
    InventarioLote,
    Pedido,
    PedidoItem,
    Movimiento,
    ZonaPolygon,
    MovimientoLoteDetalle,
]
_TENANT_TUPLE = tuple(TENANT_MODELS)

INFO_KEY = "cliente_id"


def set_session_cliente(db: Session, cliente_id) -> None:
    """Fija el ayuntamiento activo para todas las consultas de esta Session."""
    db.info[INFO_KEY] = cliente_id


def get_session_cliente(db: Session):
    return db.info.get(INFO_KEY)


@event.listens_for(Session, "do_orm_execute")
def _apply_tenant_filter(state) -> None:
    # Solo SELECTs ORM. Los bulk delete/update no son "select" y se ignoran aquí
    # (se acotan a mano en main.py).
    if not state.is_select:
        return
    if state.execution_options.get("skip_tenant"):
        return

    cid = state.session.info.get(INFO_KEY)
    if cid is None:
        # Sin ayuntamiento activo (pre-login, arranque o admin global) → sin filtro.
        return

    for model in TENANT_MODELS:
        state.statement = state.statement.options(
            with_loader_criteria(
                model,
                model.cliente_id == cid,
                include_aliases=True,
            )
        )


@event.listens_for(Session, "before_flush")
def _stamp_tenant(session, flush_context, instances) -> None:
    cid = session.info.get(INFO_KEY)
    if cid is None:
        return
    for obj in session.new:
        if isinstance(obj, _TENANT_TUPLE) and getattr(obj, "cliente_id", None) is None:
            obj.cliente_id = cid
