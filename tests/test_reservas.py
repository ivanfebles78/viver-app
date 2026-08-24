"""
EL CONTRATO DE RESERVA DE STOCK.

Hasta ahora el backend no tenía ni una prueba. La regla que decide cuántas
unidades de un producto están comprometidas —y por tanto cuántas se pueden
pedir— vivía sólo en el código y en un comentario, sin nada que impidiera
cambiarla sin querer.

Lo que se fija aquí es exactamente qué estados RESERVAN y cuáles LIBERAN, y se
comprueba contra PostgreSQL de verdad: la regla es una consulta con filtros
sobre estados, fechas y cantidades, y un doble del ORM no probaría nada.

    Reservado = suma de (cantidad − cantidad_servida)
                de las líneas NO denegadas
                de pedidos de SALIDA
                en estado RESERVA | APROBADO | APROBADO_PARCIAL
                que no hayan caducado por fecha.

    Disponible = lo que de verdad se puede servir, que NO es siempre
                 stock − reservado: el semillero no se sirve, un árbol sólo
                 cuenta en M35, y las entradas con fecha futura están
                 madurando. Ver `test_disponible_*`.
"""

import os
from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import models
from models import Base, Cliente, InventarioLote, Pedido, PedidoItem, Producto

URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://vivero:vivero123@localhost:5432/vivero_pruebas",
)


@pytest.fixture(scope="session")
def motor():
    e = create_engine(URL)
    Base.metadata.create_all(bind=e)
    return e


@pytest.fixture()
def db(motor):
    """Una sesión limpia por prueba: las reservas se calculan sobre TODO."""
    Sesion = sessionmaker(bind=motor)
    s = Sesion()
    for tabla in (PedidoItem, Pedido, InventarioLote, Producto):
        s.query(tabla).delete()
    s.query(Cliente).delete()
    s.add(Cliente(id=1, nombre="Pruebas", slug="pruebas", activo=True))
    s.commit()
    yield s
    s.rollback()
    s.close()


# ── Ayudas ────────────────────────────────────────────────────────────────


def producto(db, *, categoria="Planta", subcategoria="Mata", nombre="Test planta"):
    p = Producto(
        cliente_id=1,
        nombre_cientifico=nombre,
        nombre_natural=nombre,
        categoria=categoria,
        subcategoria=subcategoria,
        stock_minimo=0,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def existencias(db, p, cantidad, tamano="M12", disponible_desde=None):
    db.add(
        InventarioLote(
            cliente_id=1,
            uuid_lote=f"lote-{p.id}-{tamano}-{cantidad}",
            producto_id=p.id,
            zona="Zona A",
            tamano=tamano,
            cantidad_disponible=cantidad,
            fecha_disponibilidad=disponible_desde,
        )
    )
    db.commit()


def pedido(db, p, *, estado, cantidad, servida=0, estado_item="RESERVA",
           tipo="salida", tamano="M12", caduca=None):
    ped = Pedido(cliente_id=1, estado=estado, tipo=tipo, fecha_caducidad=caduca)
    db.add(ped)
    db.commit()
    db.refresh(ped)
    db.add(
        PedidoItem(
            cliente_id=1,
            pedido_id=ped.id,
            producto_id=p.id,
            tamano=tamano,
            cantidad=cantidad,
            cantidad_servida=servida,
            estado_item=estado_item,
        )
    )
    db.commit()
    return ped


def reservado(db, p, tamano="M12"):
    from main import _reservado_producto_tamano

    return _reservado_producto_tamano(db, p.id, tamano)


# ══ 1. Qué estados reservan ══════════════════════════════════════════════


@pytest.mark.parametrize(
    "estado,estado_item,esperado",
    [
        ("RESERVA", "RESERVA", 10),           # pedido pedido y sin decidir
        ("APROBADO", "APROBADO", 10),         # aprobado y pendiente de recoger
        ("APROBADO_PARCIAL", "APROBADO", 10),  # parte aprobada del mismo pedido
        ("APROBADO_PARCIAL", "RESERVA", 10),   # parte aún sin decidir
    ],
)
def test_estados_que_reservan(db, estado, estado_item, esperado):
    p = producto(db)
    existencias(db, p, 100)
    pedido(db, p, estado=estado, cantidad=10, estado_item=estado_item)
    assert reservado(db, p) == esperado


@pytest.mark.parametrize(
    "estado,estado_item",
    [
        ("DENEGADO", "DENEGADO"),   # decidido que no
        ("CANCELADO", "APROBADO"),  # el pedido ya no existe para el vivero
        ("SERVIDO", "APROBADO"),    # recogido: ya salió del stock físico
        ("CADUCADO", "APROBADO"),   # nadie lo recogió a tiempo
    ],
)
def test_estados_que_liberan(db, estado, estado_item):
    p = producto(db)
    existencias(db, p, 100)
    pedido(db, p, estado=estado, cantidad=10, estado_item=estado_item)
    assert reservado(db, p) == 0


def test_una_linea_denegada_no_reserva_aunque_el_pedido_siga_vivo(db):
    """Aprobación parcial: se piden 10, se aprueban 6 y se deniegan 4."""
    p = producto(db)
    existencias(db, p, 100)
    ped = pedido(db, p, estado="APROBADO_PARCIAL", cantidad=6, estado_item="APROBADO")
    db.add(
        PedidoItem(
            cliente_id=1, pedido_id=ped.id, producto_id=p.id, tamano="M12",
            cantidad=4, cantidad_servida=0, estado_item="DENEGADO",
        )
    )
    db.commit()
    # Sólo las 6 aprobadas siguen comprometidas. Las 4 denegadas se liberaron.
    assert reservado(db, p) == 6


def test_pedido_de_entrada_no_reserva(db):
    """Una entrada trae género, no lo compromete."""
    p = producto(db)
    existencias(db, p, 100)
    pedido(db, p, estado="RESERVA", cantidad=10, tipo="entrada")
    assert reservado(db, p) == 0


def test_pedido_caducado_por_fecha_libera(db):
    p = producto(db)
    existencias(db, p, 100)
    pedido(db, p, estado="APROBADO", cantidad=10,
           estado_item="APROBADO", caduca=date.today() - timedelta(days=1))
    assert reservado(db, p) == 0


def test_pedido_que_caduca_hoy_todavia_reserva(db):
    """El día de la caducidad aún cuenta: el filtro es `>= hoy`."""
    p = producto(db)
    existencias(db, p, 100)
    pedido(db, p, estado="APROBADO", cantidad=10,
           estado_item="APROBADO", caduca=date.today())
    assert reservado(db, p) == 10


# ══ 2. Servir consume la reserva, no la duplica ══════════════════════════


def test_servir_parcialmente_reduce_la_reserva(db):
    """
    Se piden 10 y se recogen 4: quedan 6 comprometidas.

    Lo que NO puede pasar es descontar dos veces —una al reservar y otra al
    servir—: el movimiento ya baja el stock físico, así que la reserva sólo
    debe cubrir lo que aún está por recoger.
    """
    p = producto(db)
    existencias(db, p, 100)
    pedido(db, p, estado="APROBADO", cantidad=10, servida=4, estado_item="APROBADO")
    assert reservado(db, p) == 6


def test_servir_del_todo_libera_la_reserva(db):
    p = producto(db)
    existencias(db, p, 100)
    pedido(db, p, estado="APROBADO", cantidad=10, servida=10, estado_item="APROBADO")
    assert reservado(db, p) == 0


def test_servir_de_mas_no_genera_reserva_negativa(db):
    p = producto(db)
    existencias(db, p, 100)
    pedido(db, p, estado="APROBADO", cantidad=10, servida=12, estado_item="APROBADO")
    assert reservado(db, p) == 0


# ══ 3. Varias reservas y varios tamaños ══════════════════════════════════


def test_varias_reservas_se_suman(db):
    p = producto(db)
    existencias(db, p, 100)
    pedido(db, p, estado="RESERVA", cantidad=10)
    pedido(db, p, estado="APROBADO", cantidad=5, estado_item="APROBADO")
    pedido(db, p, estado="APROBADO_PARCIAL", cantidad=6, estado_item="APROBADO")
    assert reservado(db, p) == 21


def test_la_reserva_es_por_tamano(db):
    """Reservar M20 no compromete las existencias de M12."""
    p = producto(db)
    existencias(db, p, 50, tamano="M12")
    existencias(db, p, 50, tamano="M20")
    pedido(db, p, estado="RESERVA", cantidad=10, tamano="M20")
    assert reservado(db, p, "M20") == 10
    assert reservado(db, p, "M12") == 0


def test_m30_y_m35_son_el_mismo_tamano(db):
    """`_norm_tam` unifica M30 con M35; si no, la reserva se escaparía."""
    p = producto(db)
    existencias(db, p, 50, tamano="M35")
    pedido(db, p, estado="RESERVA", cantidad=10, tamano="M30")
    assert reservado(db, p, "M35") == 10


# ══ 4. Disponible: lo que de verdad se puede servir ══════════════════════


def _productos_para(usuario_rol="admin"):
    """Llama al endpoint de listado con un usuario de ese rol."""
    from main import get_productos

    class _U:
        rol = usuario_rol

    return get_productos, _U()


def test_disponible_es_stock_menos_reservado_en_el_caso_normal(db):
    get_productos, u = _productos_para()
    p = producto(db)
    existencias(db, p, 100)
    pedido(db, p, estado="RESERVA", cantidad=25)

    fila = next(x for x in get_productos(db=db, user=u) if x["id"] == p.id)
    assert fila["stock"] == 100
    assert fila["reservado"] == 25
    assert fila["disponible"] == 75


def test_el_semillero_cuenta_como_stock_pero_no_como_disponible(db):
    """
    Está en el vivero, pero no se puede pedir. La resta no sale, y es correcto:
    por eso la tabla explica el desajuste en vez de esconderlo.
    """
    get_productos, u = _productos_para()
    p = producto(db, subcategoria="Arbusto")
    existencias(db, p, 40, tamano="M20")
    existencias(db, p, 60, tamano="Semillero")

    fila = next(x for x in get_productos(db=db, user=u) if x["id"] == p.id)
    assert fila["stock"] == 100
    assert fila["reservado"] == 0
    assert fila["disponible"] == 40


def test_un_arbol_en_maceta_pequena_no_esta_disponible(db):
    get_productos, u = _productos_para()
    p = producto(db, subcategoria="Arbol")
    existencias(db, p, 8, tamano="M20")

    fila = next(x for x in get_productos(db=db, user=u) if x["id"] == p.id)
    assert fila["stock"] == 8
    assert fila["disponible"] == 0


def test_las_existencias_SIN_TAMANO_si_estan_disponibles(db):
    """
    REGRESIÓN. Un saco de sustrato no tiene maceta, así que su inventario se
    registra sin tamaño — y el `if tam:` lo dejaba fuera de `stock_by_size`,
    que es de donde sale `disponible`. Resultado: 500 en stock y 0 disponibles.
    """
    get_productos, u = _productos_para()
    p = producto(db, categoria="Material", subcategoria="Sustrato", nombre="Sustrato")
    existencias(db, p, 500, tamano="")

    fila = next(x for x in get_productos(db=db, user=u) if x["id"] == p.id)
    assert fila["stock"] == 500
    assert fila["disponible"] == 500


def test_disponible_nunca_es_negativo(db):
    get_productos, u = _productos_para()
    p = producto(db)
    existencias(db, p, 10)
    pedido(db, p, estado="RESERVA", cantidad=10)
    pedido(db, p, estado="RESERVA", cantidad=10)

    fila = next(x for x in get_productos(db=db, user=u) if x["id"] == p.id)
    assert fila["disponible"] >= 0


def test_stock_sin_reservas_esta_entero_disponible(db):
    get_productos, u = _productos_para()
    p = producto(db)
    existencias(db, p, 100)

    fila = next(x for x in get_productos(db=db, user=u) if x["id"] == p.id)
    assert fila["stock"] == fila["disponible"] == 100
    assert fila["reservado"] == 0


# ══ 5. El listado no hace N+1 ════════════════════════════════════════════


def test_el_listado_no_consulta_una_vez_por_producto(db):
    """
    PRESUPUESTO DE CONSULTAS del listado.

    La columna Reservado es justo donde suele aparecer un N+1: una consulta de
    reservas por cada fila. Con 500 productos serían medio millar de viajes a
    la base de datos por pintar una tabla.

    Medido: **5 sentencias para 30 productos**, y el número no crece con las
    filas. El listado ya estaba resuelto con consultas agregadas y esta fase no
    lo ha empeorado.

    Lo que esta prueba es y lo que NO es:

      · ES un techo. Si alguien mete una consulta dentro del bucle de productos,
        el número sube con el número de filas y esto protesta.
      · NO es un detector fino de carga perezosa. Se intentó que distinguiera
        `selectinload` de la carga por defecto en `_reservas_por_producto_tamano`
        y no lo consigue de forma estable: el resultado depende de qué haya en
        el mapa de identidad y de qué pruebas hayan corrido antes. Se deja dicho
        aquí en vez de fingir una garantía que no da.
    """
    from sqlalchemy import event
    from sqlalchemy.orm import sessionmaker

    get_productos, u = _productos_para()
    for i in range(30):
        p = producto(db, nombre=f"Planta {i}")
        existencias(db, p, 10)
        pedido(db, p, estado="RESERVA", cantidad=2)
    db.commit()

    consultas = []

    def contar(conn, cursor, sentencia, parametros, contexto, muchos):
        consultas.append(sentencia)

    # MOTOR PROPIO, no sólo sesión nueva.
    #
    # Compartiendo el motor con el resto de la suite, esta medición daba 5 tanto
    # con la carga anticipada como sin ella: algo del estado acumulado por las
    # pruebas anteriores evitaba las cargas perezosas y la regresión pasaba
    # desapercibida. En aislamiento, en cambio, se veía perfectamente: 34 contra
    # 5. Una prueba que sólo detecta el defecto según el orden en que corra no
    # sirve, así que se aísla del todo.
    motor_propio = create_engine(URL)
    otra = sessionmaker(bind=motor_propio)()
    event.listen(otra.get_bind(), "before_cursor_execute", contar)
    try:
        filas = get_productos(db=otra, user=u)
    finally:
        event.remove(otra.get_bind(), "before_cursor_execute", contar)
        otra.close()
        motor_propio.dispose()

    assert len(filas) == 30
    assert len(consultas) <= 10, (
        f"{len(consultas)} consultas para 30 productos: el listado ha dejado de "
        "usar consultas agregadas"
    )


def test_la_consulta_de_reservas_carga_las_lineas_por_adelantado():
    """
    GUARDARRAÍL DE LA CORRECCIÓN DEL N+1.

    La prueba de presupuesto de arriba mide de verdad —34 consultas contra 5—
    **cuando se ejecuta sola**. Dentro de la suite completa el número se queda
    en 5 con corrección y sin ella: algo del estado que acumulan las pruebas
    anteriores evita las cargas perezosas. No conseguí determinar qué, y una
    prueba que sólo detecta el defecto según el orden en que corra no protege
    nada en integración continua.

    Así que la protección real es ésta: comprobar en el CÓDIGO que la consulta
    de reservas sigue trayendo las líneas por adelantado. Es menos elegante que
    medir, pero falla siempre que alguien quite la línea, que es justo lo que
    se quiere evitar.
    """
    import re
    from pathlib import Path

    fuente = Path(__file__).resolve().parent.parent.joinpath("main.py").read_text(encoding="utf-8")
    sin_comentarios = re.sub(r"^\s*#.*$", "", fuente, flags=re.MULTILINE)

    inicio = sin_comentarios.index("def _reservas_por_producto_tamano")
    fin = sin_comentarios.index("def _reservado_producto_tamano")
    consulta = sin_comentarios[inicio:fin]

    assert "selectinload(Pedido.items)" in consulta, (
        "La consulta de reservas ha dejado de cargar las líneas por adelantado: "
        "vuelve a haber un SELECT por cada pedido vivo al listar productos."
    )
