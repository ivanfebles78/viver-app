"""Widget B — Destinos más frecuentes."""

from analytics import top_destinos_frecuentes
from tenant import set_session_cliente
from factories import crear_item, crear_pedido, crear_producto, linea


def test_ordena_por_numero_de_envios(db):
    set_session_cliente(db, 1)
    p = crear_producto(db, "Ficus")
    for _ in range(3):
        linea(db, p, 1, pedido_barrio="Añaza", pedido_distrito="Suroeste")
    linea(db, p, 1, pedido_barrio="Ofra", pedido_distrito="Salud-La Salle")
    db.commit()

    items = top_destinos_frecuentes(db)["items"]

    assert [i["barrio"] for i in items] == ["Añaza", "Ofra"]
    assert items[0]["envios"] == 3
    assert items[1]["envios"] == 1


def test_muestra_barrio_y_distrito_cuando_existen(db):
    set_session_cliente(db, 1)
    p = crear_producto(db, "Ficus")
    linea(db, p, 1, pedido_barrio="Añaza", pedido_distrito="Suroeste")
    db.commit()

    destino = top_destinos_frecuentes(db)["items"][0]

    assert destino["barrio"] == "Añaza"
    assert destino["distrito"] == "Suroeste"


def test_barrio_sin_distrito_no_inventa_distrito(db):
    set_session_cliente(db, 1)
    p = crear_producto(db, "Ficus")
    linea(db, p, 1, pedido_barrio="Barrio suelto")
    db.commit()

    destino = top_destinos_frecuentes(db)["items"][0]

    assert destino["barrio"] == "Barrio suelto"
    assert destino["distrito"] is None


def test_el_destino_de_la_linea_manda_sobre_el_del_pedido(db):
    """Un pedido puede repartirse entre varias direcciones."""
    set_session_cliente(db, 1)
    p = crear_producto(db, "Ficus")
    pedido = crear_pedido(db, barrio="Cabecera", distrito="Distrito cabecera")
    crear_item(db, pedido, p, 5, barrio="Añaza", distrito="Suroeste")
    crear_item(db, pedido, p, 5, barrio="Ofra", distrito="Salud-La Salle")
    db.commit()

    items = {i["barrio"]: i for i in top_destinos_frecuentes(db)["items"]}

    assert set(items) == {"Añaza", "Ofra"}
    assert items["Añaza"]["distrito"] == "Suroeste"
    assert items["Ofra"]["distrito"] == "Salud-La Salle"
    # La cabecera no se cuenta: ninguna línea la usó.
    assert "Cabecera" not in items


def test_linea_sin_barrio_hereda_el_del_pedido(db):
    set_session_cliente(db, 1)
    p = crear_producto(db, "Ficus")
    pedido = crear_pedido(db, barrio="Cabecera", distrito="Centro")
    crear_item(db, pedido, p, 5)
    db.commit()

    destino = top_destinos_frecuentes(db)["items"][0]

    assert destino["barrio"] == "Cabecera"
    assert destino["distrito"] == "Centro"


def test_no_empareja_barrio_de_linea_con_distrito_de_cabecera(db):
    """Si la línea trae barrio propio, el distrito sale también de la línea."""
    set_session_cliente(db, 1)
    p = crear_producto(db, "Ficus")
    pedido = crear_pedido(db, barrio="Cabecera", distrito="Distrito cabecera")
    crear_item(db, pedido, p, 5, barrio="Añaza", distrito=None)
    db.commit()

    destino = top_destinos_frecuentes(db)["items"][0]

    assert destino["barrio"] == "Añaza"
    assert destino["distrito"] is None


def test_registros_sin_destino_se_cuentan_aparte(db):
    set_session_cliente(db, 1)
    p = crear_producto(db, "Ficus")
    linea(db, p, 4, pedido_barrio="Añaza")
    linea(db, p, 9)
    linea(db, p, 1, pedido_barrio="   ")
    db.commit()

    resultado = top_destinos_frecuentes(db)

    assert [i["barrio"] for i in resultado["items"]] == ["Añaza"]
    assert resultado["envios_sin_destino"] == 2
    assert resultado["unidades_sin_destino"] == 10


def test_excluye_reposiciones_cancelados_y_lineas_denegadas(db):
    set_session_cliente(db, 1)
    p = crear_producto(db, "Ficus")
    linea(db, p, 1, pedido_barrio="Válido")
    linea(db, p, 1, pedido_barrio="Reposición", tipo="reposicion")
    linea(db, p, 1, pedido_barrio="Cancelado", estado="CANCELADO")
    linea(db, p, 1, pedido_barrio="Denegado", estado_item="DENEGADO")
    db.commit()

    assert [i["barrio"] for i in top_destinos_frecuentes(db)["items"]] == ["Válido"]


def test_unifica_variantes_de_mayusculas_y_espacios(db):
    set_session_cliente(db, 1)
    p = crear_producto(db, "Ficus")
    linea(db, p, 1, pedido_barrio="Añaza")
    linea(db, p, 1, pedido_barrio="Añaza")
    linea(db, p, 1, pedido_barrio="AÑAZA")
    db.commit()

    resultado = top_destinos_frecuentes(db)

    assert len(resultado["items"]) == 1
    assert resultado["items"][0]["envios"] == 3
    # Muestra la grafía mayoritaria...
    assert resultado["items"][0]["barrio"] == "Añaza"
    # ...pero deja constancia del problema de calidad de dato.
    assert resultado["variantes_ortograficas"] == {"AÑAZA": ["AÑAZA", "Añaza"]}


def test_porcentaje_sobre_el_total_de_envios(db):
    set_session_cliente(db, 1)
    p = crear_producto(db, "Ficus")
    for _ in range(3):
        linea(db, p, 1, pedido_barrio="Añaza")
    linea(db, p, 1, pedido_barrio="Ofra")
    db.commit()

    resultado = top_destinos_frecuentes(db)

    assert resultado["total_envios"] == 4
    assert resultado["items"][0]["porcentaje"] == 75.0
    assert resultado["items"][1]["porcentaje"] == 25.0


def test_empate_se_resuelve_alfabeticamente(db):
    set_session_cliente(db, 1)
    p = crear_producto(db, "Ficus")
    linea(db, p, 1, pedido_barrio="Zurita")
    linea(db, p, 1, pedido_barrio="Añaza")
    db.commit()

    assert [i["barrio"] for i in top_destinos_frecuentes(db)["items"]] == [
        "Añaza",
        "Zurita",
    ]


def test_sin_datos_devuelve_estado_vacio(db):
    set_session_cliente(db, 1)

    resultado = top_destinos_frecuentes(db)

    assert resultado["items"] == []
    assert resultado["total_envios"] == 0
    assert resultado["envios_sin_destino"] == 0


def test_no_mezcla_destinos_de_otro_ayuntamiento(db):
    ajeno = crear_producto(db, "Ajeno", cliente_id=2, producto_id=777)
    for _ in range(9):
        linea(db, ajeno, 1, pedido_barrio="Barrio ajeno", cliente_id=2)
    propio = crear_producto(db, "Propio", cliente_id=1)
    linea(db, propio, 1, pedido_barrio="Barrio propio", cliente_id=1)
    db.commit()

    set_session_cliente(db, 1)
    resultado = top_destinos_frecuentes(db)

    assert [i["barrio"] for i in resultado["items"]] == ["Barrio propio"]
    assert resultado["total_envios"] == 1
