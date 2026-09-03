"""
Criterios de desempate de los dos rankings.

Se prueban las funciones de orden directamente y no a través de la base de
datos: SQLite agrupa devolviendo las filas ya ordenadas por la clave de
agrupación, así que un test vía BD daría verde aunque el desempate no
existiera. Postgres, con hash aggregate, devuelve los grupos en orden
arbitrario y es justo ahí donde el desempate importa.
"""

from types import SimpleNamespace

from analytics import orden_destino, orden_producto


def fila_producto(producto_id, unidades, pedidos=1):
    return SimpleNamespace(producto_id=producto_id, unidades=unidades, pedidos=pedidos)


def destino(barrio, envios, unidades=0.0):
    return {"barrio": barrio, "envios": envios, "unidades": unidades}


# --------------------------------------------------------------------------
# Productos
# --------------------------------------------------------------------------

def test_productos_ordenan_por_unidades_descendente():
    filas = [fila_producto(1, 5), fila_producto(2, 50), fila_producto(3, 20)]

    assert [f.producto_id for f in sorted(filas, key=orden_producto)] == [2, 3, 1]


def test_empate_en_unidades_se_rompe_por_pedidos_distintos():
    filas = [
        fila_producto(1, 30, pedidos=2),
        fila_producto(2, 30, pedidos=9),
    ]

    assert [f.producto_id for f in sorted(filas, key=orden_producto)] == [2, 1]


def test_empate_total_se_rompe_por_id_ascendente_sea_cual_sea_el_orden_recibido():
    """El orden de llegada desde la base de datos no debe alterar el ranking."""
    esperado = [7, 11, 42]

    for entrada in (
        [fila_producto(42, 30), fila_producto(7, 30), fila_producto(11, 30)],
        [fila_producto(11, 30), fila_producto(42, 30), fila_producto(7, 30)],
        [fila_producto(7, 30), fila_producto(11, 30), fila_producto(42, 30)],
    ):
        assert [f.producto_id for f in sorted(entrada, key=orden_producto)] == esperado


# --------------------------------------------------------------------------
# Destinos
# --------------------------------------------------------------------------

def test_destinos_ordenan_por_envios_descendente():
    filas = [destino("Ofra", 2), destino("Añaza", 9)]

    assert [d["barrio"] for d in sorted(filas, key=orden_destino)] == ["Añaza", "Ofra"]


def test_empate_en_envios_se_rompe_por_unidades():
    filas = [destino("Ofra", 3, 10.0), destino("Añaza", 3, 90.0)]

    assert [d["barrio"] for d in sorted(filas, key=orden_destino)] == ["Añaza", "Ofra"]


def test_empate_total_se_rompe_alfabeticamente_ignorando_mayusculas():
    filas = [destino("zurita", 3, 5.0), destino("Añaza", 3, 5.0), destino("Ofra", 3, 5.0)]

    assert [d["barrio"] for d in sorted(filas, key=orden_destino)] == [
        "Añaza",
        "Ofra",
        "zurita",
    ]
