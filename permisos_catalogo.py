"""
Catálogo de funcionalidades y matriz de permisos por defecto de ViverApp.

Fuente única (en código) de QUÉ funcionalidades existen y cómo quedan por
defecto para cada rol, reproduciendo la "Matriz de permisos por rol" del PDF.
Se usa para:
  - sembrar los roles por defecto de cada ayuntamiento (modelo `Rol`),
  - servir el catálogo al editor de la interfaz,
  - resolver permisos en el backend (`require_permiso`).

Niveles por celda:
  - "full"  (Sí)       acceso completo a la funcionalidad.
  - "read"  (Lectura)  solo consulta; el backend bloquea las escrituras.
  - "none"  (No)       sin acceso.

Las celdas "Limitado" del PDF se modelan como acceso "full" + una CASILLA DE
ALCANCE en el rol (p.ej. empresa externa ve Pedidos = full + solo_sus_pedidos).
Esas casillas (scope) filtran los DATOS, no el acceso, y viajan con el rol
aunque se renombre.

El rol `superadmin` NO está aquí: es god-mode global, puede todo y no se edita.
`admin_vivero` se resuelve como alias de `admin` (ver main.py).
"""

from __future__ import annotations

NIVELES = ("none", "read", "full")

# Orden de las columnas (roles de sistema) para leer la matriz compacta.
ROLES_SISTEMA = [
    "admin",
    "manager",
    "tecnico",
    "gestor_vivero",
    "empresa_externa",
    "proveedor",
    "observador",
]

# Etiqueta visible de cada rol de sistema.
ROLES_SISTEMA_NOMBRE = {
    "admin": "Administrador",
    "manager": "Manager",
    "tecnico": "Técnico",
    "gestor_vivero": "Gestor del vivero",
    "empresa_externa": "Empresa externa",
    "proveedor": "Proveedor",
    "observador": "Observador",
}

# Casillas de alcance (filtrado de datos) por rol de sistema. El resto en False.
SCOPE_SISTEMA = {
    "empresa_externa": {"solo_sus_pedidos": True, "ocultar_internos": True},
    "proveedor": {"solo_reposiciones_aprobadas": True},
}

# Claves de las casillas de alcance disponibles (para la UI y el modelo).
SCOPE_FLAGS = ("solo_sus_pedidos", "solo_reposiciones_aprobadas", "ocultar_internos")
SCOPE_FLAGS_META = [
    {
        "clave": "solo_sus_pedidos",
        "etiqueta": "Solo ve sus propios pedidos",
        "descripcion": "El usuario solo ve los pedidos que ha creado él (y las reposiciones públicas servibles).",
    },
    {
        "clave": "solo_reposiciones_aprobadas",
        "etiqueta": "Solo ve reposiciones aprobadas",
        "descripcion": "El usuario solo ve los pedidos de reposición ya aprobados que puede servir.",
    },
    {
        "clave": "ocultar_internos",
        "etiqueta": "Ocultar productos y columnas internas",
        "descripcion": "No ve los productos marcados como internos ni las columnas de reservado, disponible y stock mínimo.",
    },
]

# Letra → nivel para la matriz compacta.
_L = {"F": "full", "R": "read", "N": "none"}

# ── MATRIZ ──────────────────────────────────────────────────────────────────
# (clave, grupo, etiqueta, soporta_lectura, "admin manager tecnico gestor empresa proveedor observador")
_MATRIX = [
    # GENERAL
    ("general.panel", "GENERAL", "Panel de control", True, "F F F F N N R"),
    ("general.mapa", "GENERAL", "Mapa del vivero", True, "F F F F N N N"),
    ("general.mapa_editar_zonas", "GENERAL", "Editar zonas del mapa", False, "F N N N N N N"),
    ("general.mapa_zona_interna", "GENERAL", "Marcar zona interna", False, "F N N N N N N"),
    ("general.lotes", "GENERAL", "Trazabilidad de lotes", True, "F F F F N N R"),
    ("general.notificaciones", "GENERAL", "Notificaciones", True, "F F F F N F R"),
    # PRODUCTOS
    ("productos.ver", "PRODUCTOS", "Ver catálogo", True, "F F F F F N R"),
    ("productos.gestionar", "PRODUCTOS", "Gestionar productos (crear, editar, borrar, importar)", False, "F F F N N N N"),
    ("productos.marcar_interno", "PRODUCTOS", "Marcar producto como interno", False, "F F N N N N N"),
    ("productos.reposicion", "PRODUCTOS", "Pedir más (reposición)", False, "F F F F N N N"),
    # MOVIMIENTOS
    ("movimientos.ver", "MOVIMIENTOS", "Ver movimientos", True, "F F F F N N R"),
    ("movimientos.registrar", "MOVIMIENTOS", "Registrar movimiento (entrada, salida, traslado, devolución, préstamo)", False, "F F F F N N N"),
    # PEDIDOS
    ("pedidos.ver", "PEDIDOS", "Ver pantalla Pedidos", True, "F N F F F F R"),
    ("pedidos.crear", "PEDIDOS", "Crear pedido", False, "F N N N F N N"),
    ("pedidos.editar", "PEDIDOS", "Editar / cancelar pedido en reserva", False, "F N N N F N N"),
    ("pedidos.eliminar", "PEDIDOS", "Eliminar pedido", False, "F N N N N N N"),
    ("pedidos.pdf", "PEDIDOS", "Descargar PDF de pedido", True, "F F F F F F R"),
    ("pedidos.modificacion", "PEDIDOS", "Solicitar modificación de pedido", False, "F N F F N N N"),
    ("pedidos.devolucion", "PEDIDOS", "Registrar devolución de pedido", False, "F F F F N N N"),
    ("pedidos.aceptar", "PEDIDOS", "Marcar leído / aceptar pedido", False, "N N N N N F N"),
    # APROBACIONES
    ("aprobaciones.ver", "APROBACIONES", "Ver pantalla Aprobaciones", True, "F F N N N N R"),
    ("aprobaciones.decidir", "APROBACIONES", "Aprobar / denegar pedidos", False, "F F N N N N N"),
    ("aprobaciones.modificaciones", "APROBACIONES", "Decidir modificaciones", False, "F F N N N N N"),
    # INFORMES
    ("informes.trazabilidad", "INFORMES", "Trazabilidad", True, "F F N F N N R"),
    ("informes.distribucion", "INFORMES", "Distribución", True, "F F F F N N R"),
    ("informes.inventario", "INFORMES", "Inventario vivero", True, "F F F F N N R"),
    ("informes.existencias", "INFORMES", "Existencias", True, "F F F F N N R"),
    ("informes.caducidad", "INFORMES", "Caducidad", True, "F F N F N N R"),
    ("informes.movimientos_externos", "INFORMES", "Movimientos externos", True, "F F F F F N R"),
    ("informes.prestamos", "INFORMES", "Préstamos", True, "F F F F N N R"),
    ("informes.abastecimiento", "INFORMES", "Abastecimiento", True, "F F N F N N R"),
    ("informes.baja", "INFORMES", "Baja vivero", True, "F F N F N N R"),
    ("informes.estadisticas", "INFORMES", "Estadísticas (costes)", False, "F N N N N N N"),
    # ADMINISTRACIÓN
    ("admin.usuarios", "ADMINISTRACION", "Gestión de usuarios y roles", False, "F N N N N N N"),
    ("admin.email", "ADMINISTRACION", "Configuración y prueba de email", False, "F N N N N N N"),
    ("admin.backup", "ADMINISTRACION", "Copia de seguridad y restauración", False, "F N N N N N N"),
]

GRUPOS_ORDEN = ["GENERAL", "PRODUCTOS", "MOVIMIENTOS", "PEDIDOS", "APROBACIONES", "INFORMES", "ADMINISTRACION"]
GRUPOS_ETIQUETA = {
    "GENERAL": "General",
    "PRODUCTOS": "Productos",
    "MOVIMIENTOS": "Movimientos",
    "PEDIDOS": "Pedidos",
    "APROBACIONES": "Aprobaciones",
    "INFORMES": "Informes",
    "ADMINISTRACION": "Administración",
}

# Funcionalidades que, en viver-app (multi-ayuntamiento), son de PLATAFORMA y las
# gestiona solo el superadmin (correo y copia de seguridad son globales, no por
# ayuntamiento). Se muestran en el editor pero no son editables por el admin.
SOLO_SUPERADMIN = {"admin.email", "admin.backup"}

# Funcionalidades en orden, para catálogo de la UI y validación.
FUNCIONALIDADES = [
    {
        "clave": clave,
        "grupo": grupo,
        "etiqueta": etiqueta,
        "soporta_lectura": soporta_lectura,
        "solo_superadmin": clave in SOLO_SUPERADMIN,
    }
    for (clave, grupo, etiqueta, soporta_lectura, _celdas) in _MATRIX
]
FUNCIONALIDADES_CLAVES = {f["clave"] for f in FUNCIONALIDADES}
_SOPORTA_LECTURA = {f["clave"]: f["soporta_lectura"] for f in FUNCIONALIDADES}


def nivel_permitido(clave: str, nivel: str) -> bool:
    """¿Es `nivel` válido para la funcionalidad `clave`? ('read' solo si la
    funcionalidad lo soporta)."""
    if nivel not in NIVELES:
        return False
    if nivel == "read" and not _SOPORTA_LECTURA.get(clave, False):
        return False
    return True


def permisos_por_defecto(rol_clave: str) -> dict:
    """Mapa {funcionalidad: nivel} por defecto para un rol de sistema."""
    idx = ROLES_SISTEMA.index(rol_clave)
    out = {}
    for (clave, _g, _e, _lectura, celdas) in _MATRIX:
        out[clave] = _L[celdas.split()[idx]]
    return out


def scope_por_defecto(rol_clave: str) -> dict:
    base = {flag: False for flag in SCOPE_FLAGS}
    base.update(SCOPE_SISTEMA.get(rol_clave, {}))
    return base


def roles_por_defecto() -> list[dict]:
    """Definición completa de los 7 roles de sistema para sembrar un ayuntamiento."""
    out = []
    for clave in ROLES_SISTEMA:
        out.append(
            {
                "clave": clave,
                "nombre": ROLES_SISTEMA_NOMBRE[clave],
                "es_sistema": True,
                "permisos": permisos_por_defecto(clave),
                "scope": scope_por_defecto(clave),
            }
        )
    return out


def catalogo_serializable() -> dict:
    """Catálogo para la interfaz: grupos, funcionalidades y casillas de alcance."""
    return {
        "grupos": [{"clave": g, "etiqueta": GRUPOS_ETIQUETA[g]} for g in GRUPOS_ORDEN],
        "funcionalidades": FUNCIONALIDADES,
        "niveles": list(NIVELES),
        "scope_flags": SCOPE_FLAGS_META,
    }
