"""Widget A — Productos más demandados."""

from analytics import top_productos_demandados
from tenant import set_session_cliente
from factories import crear_item, crear_pedido, crear_producto, linea


def test_ordena_por_unidades_demandadas(db):
    set_session_cliente(db, 1)
    poco = crear_producto(db, "Lavandula")
    mucho = crear_producto(db, "Phoenix canariensis")
    linea(db, poco, 5)
    linea(db, mucho, 40)
    db.commit()

    resultado = top_productos_demandados(db)

    assert [i["nombre"] for i in resultado["items"]] == [
        "Phoenix canariensis",
        "Lavandula",
    ]
    assert resultado["items"][0]["unidades"] == 40


def test_suma_cantidades_de_varios_pedidos(db):
    set_session_cliente(db, 1)
    producto = crear_producto(db, "Dracaena draco")
    linea(db, producto, 10)
    linea(db, producto, 7)
    linea(db, producto, 3)
    db.commit()

    resultado = top_productos_demandados(db)

    assert resultado["items"][0]["unidades"] == 20
    # Tres pedidos distintos, no tres líneas del mismo.
    assert resultado["items"][0]["pedidos"] == 3


def test_cuenta_pedidos_distintos_no_lineas(db):
    set_session_cliente(db, 1)
    producto = crear_producto(db, "Olea europaea")
    pedido = crear_pedido(db)
    crear_item(db, pedido, producto, 4)
    crear_item(db, pedido, producto, 6)
    db.commit()

    resultado = top_productos_demandados(db)

    assert resultado["items"][0]["unidades"] == 10
    assert resultado["items"][0]["pedidos"] == 1


def test_porcentaje_es_cuota_sobre_la_demanda_total(db):
    set_session_cliente(db, 1)
    a = crear_producto(db, "A")
    b = crear_producto(db, "B")
    linea(db, a, 75)
    linea(db, b, 25)
    db.commit()

    resultado = top_productos_demandados(db)

    assert resultado["total_unidades"] == 100
    assert resultado["items"][0]["porcentaje"] == 75.0
    assert resultado["items"][1]["porcentaje"] == 25.0


def test_excluye_pedidos_cancelados_y_caducados(db):
    set_session_cliente(db, 1)
    producto = crear_producto(db, "Ficus")
    linea(db, producto, 10)
    linea(db, producto, 999, estado="CANCELADO")
    linea(db, producto, 888, estado="CADUCADO")
    db.commit()

    resultado = top_productos_demandados(db)

    assert resultado["items"][0]["unidades"] == 10


def test_excluye_lineas_denegadas(db):
    set_session_cliente(db, 1)
    producto = crear_producto(db, "Ficus")
    pedido = crear_pedido(db, estado="APROBADO_PARCIAL")
    crear_item(db, pedido, producto, 12, estado_item="APROBADO")
    crear_item(db, pedido, producto, 500, estado_item="DENEGADO")
    db.commit()

    resultado = top_productos_demandados(db)

    assert resultado["items"][0]["unidades"] == 12


def test_incluye_lineas_en_reserva_y_servidas(db):
    set_session_cliente(db, 1)
    producto = crear_producto(db, "Ficus")
    pedido = crear_pedido(db, estado="APROBADO_PARCIAL")
    crear_item(db, pedido, producto, 3, estado_item="RESERVA")
    crear_item(db, pedido, producto, 4, estado_item="APROBADO")
    crear_item(db, pedido, producto, 5, estado_item="SERVIDO")
    db.commit()

    assert top_productos_demandados(db)["items"][0]["unidades"] == 12


def test_excluye_pedidos_de_reposicion(db):
    """Reposición es abastecimiento del vivero, no demanda del exterior."""
    set_session_cliente(db, 1)
    producto = crear_producto(db, "Ficus")
    linea(db, producto, 8)
    linea(db, producto, 400, tipo="reposicion")
    db.commit()

    assert top_productos_demandados(db)["items"][0]["unidades"] == 8


def test_empate_se_resuelve_de_forma_determinista(db):
    set_session_cliente(db, 1)
    segundo = crear_producto(db, "Zzz", producto_id=90)
    primero = crear_producto(db, "Aaa", producto_id=10)
    linea(db, segundo, 20)
    linea(db, primero, 20)
    db.commit()

    ids = [i["producto_id"] for i in top_productos_demandados(db)["items"]]

    assert ids == [10, 90]
    # El orden no depende del orden de inserción.
    assert ids == [i["producto_id"] for i in top_productos_demandados(db)["items"]]


def test_sin_datos_devuelve_estado_vacio(db):
    set_session_cliente(db, 1)

    resultado = top_productos_demandados(db)

    assert resultado["items"] == []
    assert resultado["total_unidades"] == 0
    assert resultado["productos_distintos"] == 0


def test_respeta_el_limite_del_top(db):
    set_session_cliente(db, 1)
    for n in range(8):
        linea(db, crear_producto(db, f"P{n}"), n + 1)
    db.commit()

    assert len(top_productos_demandados(db, limite=5)["items"]) == 5
    # El total sigue siendo el de TODOS los productos, no solo el top 5.
    assert top_productos_demandados(db, limite=5)["total_unidades"] == 36


def test_no_mezcla_datos_de_otro_ayuntamiento(db):
    ajeno = crear_producto(db, "Producto ajeno", cliente_id=2, producto_id=777)
    linea(db, ajeno, 5000, cliente_id=2)
    propio = crear_producto(db, "Producto propio", cliente_id=1)
    linea(db, propio, 3, cliente_id=1)
    db.commit()

    set_session_cliente(db, 1)
    resultado = top_productos_demandados(db)

    assert [i["nombre"] for i in resultado["items"]] == ["Producto propio"]
    assert resultado["total_unidades"] == 3
