"""
Infraestructura compartida de las pruebas del backend.

Se ejecuta contra PostgreSQL DE VERDAD, por la misma razón que
`test_reservas.py`: lo que se prueba son consultas con filtros, agrupaciones y
sumas sobre estados, fechas y cantidades. Un doble del ORM devolvería lo que le
pidiéramos y no probaría nada, y SQLite tampoco vale como sustituto: agrupa
devolviendo las filas ya ordenadas por la clave, así que enmascara justo los
desempates que el ranking necesita.

`TEST_DATABASE_URL` la aporta la CI (servicio `postgres:16`).
"""

import os

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import (
    Base,
    Cliente,
    InventarioLote,
    Movimiento,
    Pedido,
    PedidoItem,
    Producto,
)

URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://vivero:vivero123@localhost:5432/vivero_pruebas",
)

# Orden de borrado: de la hoja a la raíz, para no chocar con las claves ajenas.
TABLAS_A_LIMPIAR = (Movimiento, PedidoItem, Pedido, InventarioLote, Producto)


@pytest.fixture(scope="session")
def motor():
    e = create_engine(URL)
    Base.metadata.create_all(bind=e)
    return e


@pytest.fixture()
def db(motor):
    """
    Sesión limpia por prueba.

    Las agregaciones del panel se calculan sobre TODO el histórico, así que una
    prueba que heredara filas de la anterior mediría otra cosa.

    Se crean DOS ayuntamientos: el 1 es el que se prueba y el 2 existe para
    poder comprobar que ningún ranking se lleva datos del vecino.
    """
    from factories import reiniciar_contadores

    Sesion = sessionmaker(bind=motor)
    s = Sesion()

    # Ids predecibles en cada prueba: alguna fija el id de un producto porque
    # lo que comprueba es precisamente el desempate por id.
    reiniciar_contadores()

    for tabla in TABLAS_A_LIMPIAR:
        s.query(tabla).delete()
    s.query(Cliente).delete()
    s.add_all(
        [
            Cliente(id=1, nombre="Ayuntamiento de pruebas", slug="pruebas", activo=True),
            Cliente(id=2, nombre="Otro ayuntamiento", slug="otro", activo=True),
        ]
    )
    s.commit()

    yield s

    s.rollback()
    s.close()
