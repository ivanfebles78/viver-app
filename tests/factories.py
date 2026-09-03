"""
Constructores de datos para las pruebas de analítica.

Los rankings dependen de combinaciones concretas (tipo de pedido, estado del
pedido, estado de la línea, destino en la línea o en la cabecera), y escribir
cada una a mano con el ORM enterraría la intención de cada prueba bajo veinte
líneas de campos irrelevantes.
"""

from datetime import datetime

from models import Pedido, PedidoItem, Producto

CLIENTE_POR_DEFECTO = 1

# Los ids se asignan a mano y de forma creciente para que una prueba pueda
# fijar el id de un producto cuando lo que comprueba ES el desempate por id.
_contador = {"producto": 0, "pedido": 0, "item": 0}


def _siguiente(clave):
    _contador[clave] += 1
    # Un margen alto evita chocar con los ids explícitos de las pruebas.
    return 1000 + _contador[clave]


def reiniciar_contadores():
    for clave in _contador:
        _contador[clave] = 0


def crear_producto(db, nombre, *, cliente_id=CLIENTE_POR_DEFECTO, producto_id=None):
    producto = Producto(
        id=producto_id if producto_id is not None else _siguiente("producto"),
        cliente_id=cliente_id,
        nombre_cientifico=nombre,
        nombre_natural=None,
        categoria="Arbolado",
        subcategoria="Ornamental",
    )
    db.add(producto)
    db.flush()
    return producto


def crear_pedido(
    db,
    *,
    tipo="salida",
    estado="APROBADO",
    created_at=None,
    barrio=None,
    distrito=None,
    cliente_id=CLIENTE_POR_DEFECTO,
    pedido_id=None,
):
    pedido = Pedido(
        id=pedido_id if pedido_id is not None else _siguiente("pedido"),
        cliente_id=cliente_id,
        tipo=tipo,
        estado=estado,
        created_at=created_at if created_at is not None else datetime(2026, 1, 5, 9, 0),
        barrio_destino=barrio,
        distrito_destino=distrito,
    )
    db.add(pedido)
    db.flush()
    return pedido


def crear_item(
    db,
    pedido,
    producto,
    cantidad,
    *,
    estado_item="APROBADO",
    barrio=None,
    distrito=None,
    cliente_id=CLIENTE_POR_DEFECTO,
):
    item = PedidoItem(
        id=_siguiente("item"),
        cliente_id=cliente_id,
        pedido_id=pedido.id,
        producto_id=producto.id,
        cantidad=cantidad,
        cantidad_servida=0,
        estado_item=estado_item,
        barrio_destino=barrio,
        distrito_destino=distrito,
    )
    db.add(item)
    db.flush()
    return item


def linea(db, producto, cantidad, **kwargs):
    """Atajo para el caso común: un pedido con una sola línea."""
    de_pedido = {
        k: kwargs.pop(k)
        for k in ("tipo", "estado", "created_at", "cliente_id", "pedido_id")
        if k in kwargs
    }
    de_pedido.setdefault("barrio", kwargs.pop("pedido_barrio", None))
    de_pedido.setdefault("distrito", kwargs.pop("pedido_distrito", None))

    pedido = crear_pedido(db, **de_pedido)
    crear_item(
        db,
        pedido,
        producto,
        cantidad,
        cliente_id=de_pedido.get("cliente_id", CLIENTE_POR_DEFECTO),
        **kwargs,
    )
    return pedido
