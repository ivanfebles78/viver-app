"""
Permisos del endpoint de analítica.

`main.py` abre la conexión a la base de datos al importarse (migra y siembra),
así que no se puede levantar con TestClient sin un Postgres delante. Estas
pruebas leen el árbol sintáctico del módulo: no ejecutan la app, pero vigilan
exactamente la propiedad que importa y que es fácil romper sin darse cuenta.

Qué protegen: `GET /pedidos` recorta las FILAS que ven `empresa_externa` (solo
sus pedidos) y `proveedor` (solo reposiciones servibles). Si esos roles
pudieran llamar a la analítica, deducirían la demanda y los destinos de TODO el
ayuntamiento a partir de unos rankings que agregan pedidos que no tienen
permiso para consultar.
"""

import ast
from pathlib import Path

import pytest

MAIN = Path(__file__).resolve().parents[1] / "main.py"

ROLES_SIN_HISTORICO_COMPLETO = {"empresa_externa", "proveedor"}


def _roles_del_endpoint(ruta: str) -> set[str]:
    """Roles del `require_roles([...])` de la función que sirve `ruta`."""
    arbol = ast.parse(MAIN.read_text(encoding="utf-8"))

    for nodo in ast.walk(arbol):
        if not isinstance(nodo, ast.FunctionDef):
            continue

        rutas = {
            d.args[0].value
            for d in nodo.decorator_list
            if isinstance(d, ast.Call)
            and d.args
            and isinstance(d.args[0], ast.Constant)
            and isinstance(d.args[0].value, str)
        }
        if ruta not in rutas:
            continue

        for llamada in ast.walk(nodo):
            if (
                isinstance(llamada, ast.Call)
                and isinstance(llamada.func, ast.Name)
                and llamada.func.id == "require_roles"
            ):
                return {
                    elemento.value
                    for elemento in llamada.args[0].elts
                    if isinstance(elemento, ast.Constant)
                }

    raise AssertionError(f"No se encontró el endpoint {ruta} en main.py")


def test_el_endpoint_de_analitica_existe_y_exige_roles():
    roles = _roles_del_endpoint("/dashboard/analytics")

    assert roles, "La analítica debe declarar require_roles"


@pytest.mark.parametrize("rol", sorted(ROLES_SIN_HISTORICO_COMPLETO))
def test_los_roles_con_pedidos_recortados_no_acceden_a_la_analitica(rol):
    assert rol not in _roles_del_endpoint("/dashboard/analytics")


def test_la_analitica_no_amplia_el_acceso_mas_alla_de_pedidos():
    """Nadie puede ver los agregados sin poder ver los pedidos que agregan."""
    analitica = _roles_del_endpoint("/dashboard/analytics")
    pedidos = _roles_del_endpoint("/pedidos")

    assert analitica <= pedidos, f"Roles de más en la analítica: {analitica - pedidos}"


def test_los_roles_que_ven_todo_el_historico_si_acceden():
    roles = _roles_del_endpoint("/dashboard/analytics")

    # `admin` cubre además admin_vivero y superadmin por la jerarquía de
    # require_roles (ver main.py).
    assert {"admin", "manager", "tecnico", "gestor_vivero"} == roles
