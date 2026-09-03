"""
Widget C — Pedidos por día de la semana.

El grueso de las pruebas ataca la función pura `agregar_pedidos_por_dia`, que
recibe fechas UTC y aplica la zona horaria del negocio. Es donde vive el riesgo
real: el desfase UTC -> Atlantic/Canary y los periodos parciales.
"""

from datetime import datetime

import pytest

from analytics import a_fecha_local, agregar_pedidos_por_dia, pedidos_por_dia_semana
from tenant import set_session_cliente
from factories import crear_producto, linea


def medias(resultado):
    return {d["dia"]: d["media"] for d in resultado["dias"]}


def totales(resultado):
    return {d["dia"]: d["total"] for d in resultado["dias"]}


# --------------------------------------------------------------------------
# Zona horaria — Atlantic/Canary
# --------------------------------------------------------------------------

def test_madrugada_de_verano_cuenta_en_el_dia_local_no_en_utc():
    """
    Julio: Canarias va en WEST (UTC+1). Un pedido del lunes 00:15 local se
    guarda como domingo 23:15 UTC. Debe contarse en LUNES.
    """
    domingo_2315_utc = datetime(2026, 7, 5, 23, 15)

    assert a_fecha_local(domingo_2315_utc).isoformat() == "2026-07-06"
    assert a_fecha_local(domingo_2315_utc).isoweekday() == 1


def test_en_invierno_canarias_va_en_utc():
    """Enero: Canarias en WET (UTC+0). No hay desplazamiento de día."""
    domingo_2315_utc = datetime(2026, 1, 4, 23, 15)

    assert a_fecha_local(domingo_2315_utc).isoformat() == "2026-01-04"
    assert a_fecha_local(domingo_2315_utc).isoweekday() == 7


def test_pedido_de_madrugada_del_lunes_no_se_pierde_en_domingo():
    resultado = agregar_pedidos_por_dia([datetime(2026, 7, 5, 23, 15)])

    assert totales(resultado)["Lunes"] == 1
    assert resultado["pedidos_fin_de_semana"] == 0


def test_viernes_noche_de_verano_pasa_a_sabado_y_sale_del_grafico():
    """Viernes 23:30 UTC en verano son las 00:30 del sábado en Canarias."""
    resultado = agregar_pedidos_por_dia([datetime(2026, 7, 3, 23, 30)])

    assert totales(resultado)["Viernes"] == 0
    assert resultado["pedidos_fin_de_semana"] == 1


def test_acepta_datetime_con_zona_horaria():
    from datetime import timezone

    consciente = datetime(2026, 7, 5, 23, 15, tzinfo=timezone.utc)

    assert a_fecha_local(consciente).isoweekday() == 1


# --------------------------------------------------------------------------
# Fórmula de la media
# --------------------------------------------------------------------------

def test_media_divide_entre_las_ocurrencias_reales_del_dia():
    # Lunes 5 y lunes 12 de enero de 2026: 2 lunes en el periodo, 6 pedidos.
    fechas = [datetime(2026, 1, 5, 9)] * 4 + [datetime(2026, 1, 12, 9)] * 2

    resultado = agregar_pedidos_por_dia(fechas)

    assert totales(resultado)["Lunes"] == 6
    assert resultado["dias"][0]["ocurrencias"] == 2
    assert medias(resultado)["Lunes"] == 3.0


def test_dia_laborable_sin_pedidos_cuenta_como_ocurrencia_con_cero():
    """Un martes vacío dentro del periodo baja la media del martes."""
    fechas = [datetime(2026, 1, 6, 9)] * 4 + [datetime(2026, 1, 14, 9)]

    resultado = agregar_pedidos_por_dia(fechas)

    # Periodo 6-ene (martes) a 14-ene (miércoles): 2 martes, uno de ellos vacío.
    assert resultado["dias"][1]["ocurrencias"] == 2
    assert medias(resultado)["Martes"] == 2.0


def test_semana_parcial_no_cuenta_dias_inexistentes():
    """
    Periodo de un solo día (miércoles): lunes y martes no ocurrieron, así que
    su media es 0 con 0 ocurrencias, no una división inventada.
    """
    resultado = agregar_pedidos_por_dia([datetime(2026, 1, 7, 9)] * 5)

    assert resultado["dias"][0]["ocurrencias"] == 0
    assert resultado["dias"][0]["media"] == 0.0
    assert resultado["dias"][2]["ocurrencias"] == 1
    assert medias(resultado)["Miércoles"] == 5.0


def test_un_solo_dia_de_muestra_no_inventa_media_semanal():
    resultado = agregar_pedidos_por_dia([datetime(2026, 1, 5, 9)] * 3)

    assert resultado["desde"] == "2026-01-05"
    assert resultado["hasta"] == "2026-01-05"
    assert medias(resultado)["Lunes"] == 3.0
    assert resultado["dias"][0]["ocurrencias"] == 1


def test_solo_devuelve_lunes_a_viernes():
    resultado = agregar_pedidos_por_dia([datetime(2026, 1, 5, 9)])

    assert [d["dia"] for d in resultado["dias"]] == [
        "Lunes",
        "Martes",
        "Miércoles",
        "Jueves",
        "Viernes",
    ]


def test_pedidos_de_fin_de_semana_se_reportan_pero_no_entran_en_el_grafico():
    sabado = datetime(2026, 1, 10, 12)
    domingo = datetime(2026, 1, 11, 12)
    lunes = datetime(2026, 1, 5, 12)

    resultado = agregar_pedidos_por_dia([sabado, domingo, lunes])

    assert resultado["pedidos_fin_de_semana"] == 2
    assert resultado["total_pedidos"] == 1


# --------------------------------------------------------------------------
# Día con más / menos pedidos
# --------------------------------------------------------------------------

def test_identifica_el_dia_con_mas_y_con_menos_pedidos():
    fechas = (
        [datetime(2026, 1, 5, 9)] * 2      # lunes
        + [datetime(2026, 1, 6, 9)] * 7    # martes
        + [datetime(2026, 1, 7, 9)] * 1    # miércoles
        + [datetime(2026, 1, 8, 9)] * 3    # jueves
        + [datetime(2026, 1, 9, 9)] * 4    # viernes
    )

    resultado = agregar_pedidos_por_dia(fechas)

    assert resultado["dias_mas_pedidos"] == ["Martes"]
    assert resultado["dias_menos_pedidos"] == ["Miércoles"]


def test_empate_devuelve_todos_los_dias_empatados():
    fechas = (
        [datetime(2026, 1, 5, 9)] * 5      # lunes
        + [datetime(2026, 1, 6, 9)] * 5    # martes
        + [datetime(2026, 1, 7, 9)] * 1    # miércoles
        + [datetime(2026, 1, 8, 9)] * 1    # jueves
        + [datetime(2026, 1, 9, 9)] * 1    # viernes
    )

    resultado = agregar_pedidos_por_dia(fechas)

    assert resultado["dias_mas_pedidos"] == ["Lunes", "Martes"]
    assert resultado["dias_menos_pedidos"] == ["Miércoles", "Jueves", "Viernes"]


def test_si_todos_los_dias_empatan_no_hay_maximo_ni_minimo():
    fechas = [datetime(2026, 1, d, 9) for d in (5, 6, 7, 8, 9)]

    resultado = agregar_pedidos_por_dia(fechas)

    assert resultado["dias_mas_pedidos"] == []
    assert resultado["dias_menos_pedidos"] == []


# --------------------------------------------------------------------------
# Casos límite
# --------------------------------------------------------------------------

def test_sin_pedidos_devuelve_estado_vacio():
    resultado = agregar_pedidos_por_dia([])

    assert resultado["total_pedidos"] == 0
    assert resultado["desde"] is None
    assert resultado["dias_mas_pedidos"] == []
    assert all(d["media"] == 0.0 for d in resultado["dias"])


def test_solo_pedidos_de_fin_de_semana_no_rompe_el_grafico():
    resultado = agregar_pedidos_por_dia([datetime(2026, 1, 10, 12)])

    assert resultado["total_pedidos"] == 0
    assert resultado["pedidos_fin_de_semana"] == 1
    assert resultado["dias_mas_pedidos"] == []


def test_pedidos_sin_fecha_se_reportan_y_no_rompen_el_calculo():
    resultado = agregar_pedidos_por_dia([datetime(2026, 1, 5, 9), None, None])

    assert resultado["pedidos_sin_fecha"] == 2
    assert resultado["total_pedidos"] == 1


def test_todos_los_pedidos_sin_fecha():
    resultado = agregar_pedidos_por_dia([None, None])

    assert resultado["pedidos_sin_fecha"] == 2
    assert resultado["total_pedidos"] == 0
    assert resultado["desde"] is None


@pytest.mark.parametrize(
    "cambio_horario, dia_esperado",
    [
        # Último domingo de marzo 2026 (29-mar): WET -> WEST a las 01:00 UTC.
        (datetime(2026, 3, 30, 0, 30), "Lunes"),
        # Último domingo de octubre 2026 (25-oct): WEST -> WET.
        (datetime(2026, 10, 26, 0, 30), "Lunes"),
    ],
)
def test_los_cambios_de_hora_no_desplazan_el_dia(cambio_horario, dia_esperado):
    resultado = agregar_pedidos_por_dia([cambio_horario])

    assert totales(resultado)[dia_esperado] == 1


# --------------------------------------------------------------------------
# Integración con la base de datos
# --------------------------------------------------------------------------

def test_lee_todos_los_pedidos_del_ayuntamiento_activo(db):
    set_session_cliente(db, 1)
    p = crear_producto(db, "Ficus")
    linea(db, p, 1, created_at=datetime(2026, 1, 5, 9))
    # Cuenta también reposiciones y denegados: mide carga de trabajo recibida.
    linea(db, p, 1, created_at=datetime(2026, 1, 5, 10), tipo="reposicion")
    linea(db, p, 1, created_at=datetime(2026, 1, 5, 11), estado="DENEGADO")
    db.commit()

    assert totales(pedidos_por_dia_semana(db))["Lunes"] == 3


def test_no_cuenta_pedidos_de_otro_ayuntamiento(db):
    ajeno = crear_producto(db, "Ajeno", cliente_id=2, producto_id=777)
    for hora in range(5):
        linea(db, ajeno, 1, cliente_id=2, created_at=datetime(2026, 1, 6, 9 + hora))
    propio = crear_producto(db, "Propio", cliente_id=1)
    linea(db, propio, 1, cliente_id=1, created_at=datetime(2026, 1, 5, 9))
    db.commit()

    set_session_cliente(db, 1)
    resultado = pedidos_por_dia_semana(db)

    assert resultado["total_pedidos"] == 1
    assert totales(resultado)["Martes"] == 0
