"""
Agregaciones de analítica del Dashboard.

Vive en su propio módulo (y no en main.py) por dos motivos:

1. main.py ya supera las 5.000 líneas; tener aquí las consultas deja el
   endpoint reducido a "pedir el dato y devolverlo".
2. Estas funciones reciben una `Session` y devuelven diccionarios planos, así
   que se pueden probar sin levantar FastAPI ni tocar la autenticación.

AISLAMIENTO POR AYUNTAMIENTO
----------------------------
Todas las consultas van por el ORM, de modo que el filtro automático de
`tenant.py` (`with_loader_criteria` en `do_orm_execute`) se aplica también a
las agregaciones y a los `select` de una sola columna. NO se usa SQL crudo
aquí precisamente para no saltarse ese filtro.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from models import Pedido, PedidoItem, Producto

# ---------------------------------------------------------------------------
# CRITERIOS DE NEGOCIO
# ---------------------------------------------------------------------------

# El vivero está en Canarias. `Pedido.created_at` se guarda como UTC naive
# (`datetime.utcnow`), así que para saber en qué día de la semana entró un
# pedido hay que pasarlo a hora local canaria. Se usa la zona IANA y NO un
# offset fijo: Canarias cambia de hora (WET/WEST) dos veces al año y un
# "+0"/"+1" hardcodeado desplazaría los pedidos de madrugada al día anterior
# o siguiente durante medio año.
TZ_NEGOCIO = ZoneInfo("Atlantic/Canary")

# Solo los pedidos de SALIDA representan demanda hacia el exterior. Los de
# `reposicion` son compras del propio vivero a un proveedor: son abastecimiento,
# no demanda, y mezclarlos falsearía ambos rankings.
TIPO_PEDIDO_SALIDA = "salida"

# Un pedido cancelado o caducado nunca llegó a ser demanda comprometida:
# el solicitante lo retiró o venció sin servirse.
ESTADOS_PEDIDO_EXCLUIDOS = ("CANCELADO", "CADUCADO")

# Una línea denegada fue rechazada por el vivero, así que no cuenta como
# demanda atendible. Las líneas en RESERVA, APROBADO o SERVIDO sí cuentan.
ESTADO_ITEM_EXCLUIDO = "DENEGADO"

# Lunes..Viernes en la numeración ISO (1 = lunes ... 7 = domingo).
DIAS_LABORABLES = (1, 2, 3, 4, 5)
NOMBRES_DIAS = {
    1: "Lunes",
    2: "Martes",
    3: "Miércoles",
    4: "Jueves",
    5: "Viernes",
}

TOP_POR_DEFECTO = 5


def _num(valor) -> float:
    """Normaliza los Numeric de SQLAlchemy (Decimal) a float para el JSON."""
    if valor is None:
        return 0.0
    if isinstance(valor, Decimal):
        return float(valor)
    return float(valor)


def _porcentaje(parte: float, total: float) -> float:
    if not total:
        return 0.0
    return round((parte / total) * 100, 1)


def _texto(valor) -> str:
    """Colapsa espacios repetidos y recorta. No cambia el contenido."""
    return " ".join(str(valor or "").split())


def orden_producto(fila) -> tuple:
    """
    Criterio de orden del ranking de productos: más unidades -> más pedidos
    distintos -> id menor.

    Está extraído a una función con nombre porque el tercer criterio solo se
    nota cuando hay empate y la base de datos devuelve los grupos en un orden
    arbitrario (Postgres con hash aggregate). Como función suelta se puede
    probar directamente, sin depender de en qué orden agrupe el motor.
    """
    return (-_num(fila.unidades), -int(fila.pedidos or 0), int(fila.producto_id))


def orden_destino(destino: dict) -> tuple:
    """Criterio de orden del ranking de destinos: más envíos -> más unidades
    -> alfabético. Ver `orden_producto` para el porqué de la función suelta."""
    return (-destino["envios"], -destino["unidades"], destino["barrio"].casefold())


def _base_lineas_salida(db: Session):
    """
    Query base compartida por los dos rankings: líneas de pedidos de SALIDA que
    representan demanda real (ni pedido retirado/caducado, ni línea denegada).

    Se hace un único JOIN pedido_items -> pedidos y se agrupa en la base de
    datos, de modo que el backend nunca materializa las líneas una a una
    (sin N+1 y sin traerse el histórico entero a memoria).
    """
    return (
        db.query(PedidoItem)
        .join(Pedido, Pedido.id == PedidoItem.pedido_id)
        .filter(
            func.lower(func.coalesce(Pedido.tipo, "")) == TIPO_PEDIDO_SALIDA,
            func.upper(func.coalesce(Pedido.estado, "")).notin_(ESTADOS_PEDIDO_EXCLUIDOS),
            func.upper(func.coalesce(PedidoItem.estado_item, "")) != ESTADO_ITEM_EXCLUIDO,
        )
    )


# ---------------------------------------------------------------------------
# A. PRODUCTOS MÁS DEMANDADOS
# ---------------------------------------------------------------------------

def top_productos_demandados(db: Session, limite: int = TOP_POR_DEFECTO) -> dict:
    """
    Ranking de productos por DEMANDA, entendida como:

        suma de `pedido_items.cantidad` de las líneas de pedidos de SALIDA
        cuyo pedido no está CANCELADO ni CADUCADO y cuya línea no está DENEGADA.

    Es demanda solicitada, no actividad de almacén: no intervienen entradas,
    traslados internos, ajustes ni movimientos de ningún tipo.

    El porcentaje es la CUOTA sobre la demanda total del periodo (todas las
    líneas que cumplen el criterio, no solo el top N).
    """
    filas = (
        _base_lineas_salida(db)
        .join(Producto, Producto.id == PedidoItem.producto_id)
        .with_entities(
            Producto.id.label("producto_id"),
            Producto.nombre_cientifico.label("nombre_cientifico"),
            Producto.nombre_natural.label("nombre_natural"),
            func.sum(PedidoItem.cantidad).label("unidades"),
            func.count(func.distinct(PedidoItem.pedido_id)).label("pedidos"),
        )
        .group_by(Producto.id, Producto.nombre_cientifico, Producto.nombre_natural)
        .all()
    )

    total_unidades = sum(_num(f.unidades) for f in filas)

    ordenadas = sorted(filas, key=orden_producto)

    items = [
        {
            "producto_id": int(f.producto_id),
            "nombre": f.nombre_cientifico or f.nombre_natural or f"Producto #{f.producto_id}",
            "nombre_natural": f.nombre_natural,
            "unidades": _num(f.unidades),
            "pedidos": int(f.pedidos or 0),
            "porcentaje": _porcentaje(_num(f.unidades), total_unidades),
        }
        for f in ordenadas[:limite]
    ]

    return {
        "items": items,
        "total_unidades": total_unidades,
        "productos_distintos": len(filas),
    }


# ---------------------------------------------------------------------------
# B. DESTINOS MÁS FRECUENTES
# ---------------------------------------------------------------------------

def _clave_destino(barrio: str) -> str:
    """
    Agrupa variantes de MAYÚSCULAS/minúsculas y espacios sobrantes del mismo
    barrio ("AÑAZA", "Añaza ", "añaza" -> un solo destino). NO normaliza tildes
    ni reescribe topónimos: solo unifica lo que es literalmente la misma cadena
    escrita de otra forma. Las variantes encontradas se devuelven en
    `variantes_ortograficas` para poder corregirlas en el origen.
    """
    return _texto(barrio).casefold()


def top_destinos_frecuentes(db: Session, limite: int = TOP_POR_DEFECTO) -> dict:
    """
    Ranking de destinos por número de ENVÍOS: cuántos pedidos distintos de
    SALIDA han ido a cada barrio.

    El destino se resuelve por línea, porque un mismo pedido puede repartirse
    entre varias direcciones (`pedido_items.barrio_destino`). Si la línea no
    trae barrio propio, se usa el del pedido. El distrito se toma SIEMPRE del
    mismo registro que aportó el barrio, para no emparejar un barrio de la
    línea con el distrito de la cabecera.

    Se excluyen: entradas, traslados internos y ajustes (no son pedidos de
    salida), y las líneas sin barrio, que se cuentan aparte como
    `envios_sin_destino` en lugar de silenciarse.
    """
    barrio_item = func.nullif(func.trim(func.coalesce(PedidoItem.barrio_destino, "")), "")
    barrio_pedido = func.nullif(func.trim(func.coalesce(Pedido.barrio_destino, "")), "")

    # El barrio efectivo manda: si la línea lo trae, distrito y barrio salen de
    # la línea; si no, ambos salen del pedido.
    barrio_efectivo = func.coalesce(barrio_item, barrio_pedido)
    distrito_efectivo = case(
        (barrio_item.isnot(None), PedidoItem.distrito_destino),
        else_=Pedido.distrito_destino,
    )

    filas = (
        _base_lineas_salida(db)
        .with_entities(
            barrio_efectivo.label("barrio"),
            distrito_efectivo.label("distrito"),
            func.count(func.distinct(PedidoItem.pedido_id)).label("envios"),
            func.sum(PedidoItem.cantidad).label("unidades"),
        )
        .group_by(barrio_efectivo, distrito_efectivo)
        .all()
    )

    agrupados: dict[str, dict] = {}
    variantes: dict[str, set] = defaultdict(set)
    envios_sin_destino = 0
    unidades_sin_destino = 0.0

    for fila in filas:
        barrio = _texto(fila.barrio)
        if not barrio:
            envios_sin_destino += int(fila.envios or 0)
            unidades_sin_destino += _num(fila.unidades)
            continue

        clave = _clave_destino(barrio)
        variantes[clave].add(barrio)
        distrito = _texto(fila.distrito) or None

        actual = agrupados.setdefault(
            clave,
            {
                "barrio": barrio,
                "distrito": distrito,
                "envios": 0,
                "unidades": 0.0,
                "_grafias": Counter(),
            },
        )
        actual["envios"] += int(fila.envios or 0)
        actual["unidades"] += _num(fila.unidades)
        actual["_grafias"][barrio] += int(fila.envios or 0)
        if actual["distrito"] is None and distrito:
            actual["distrito"] = distrito

    total_envios = sum(d["envios"] for d in agrupados.values())

    ordenados = sorted(agrupados.values(), key=orden_destino)

    items = []
    for destino in ordenados[:limite]:
        # De las variantes ortográficas mostramos la más usada.
        grafia = destino["_grafias"].most_common(1)[0][0]
        items.append(
            {
                "barrio": grafia,
                "distrito": destino["distrito"],
                "envios": destino["envios"],
                "unidades": destino["unidades"],
                "porcentaje": _porcentaje(destino["envios"], total_envios),
            }
        )

    return {
        "items": items,
        "total_envios": total_envios,
        "destinos_distintos": len(agrupados),
        "envios_sin_destino": envios_sin_destino,
        "unidades_sin_destino": unidades_sin_destino,
        # Señal de calidad de dato: barrios escritos de más de una forma.
        "variantes_ortograficas": {
            sorted(v)[0]: sorted(v) for v in variantes.values() if len(v) > 1
        },
    }


# ---------------------------------------------------------------------------
# C. PEDIDOS POR DÍA DE LA SEMANA
# ---------------------------------------------------------------------------

def a_fecha_local(momento_utc: datetime, tz: ZoneInfo = TZ_NEGOCIO) -> date:
    """
    Pasa un `datetime` UTC naive (como los guarda `datetime.utcnow`) a la fecha
    local del vivero. Un pedido creado el lunes a las 00:15 hora canaria se
    guarda en UTC como domingo 23:15 durante el horario de verano; sin esta
    conversión acabaría contado en domingo y desaparecería del gráfico.
    """
    if momento_utc.tzinfo is None:
        momento_utc = momento_utc.replace(tzinfo=timezone.utc)
    return momento_utc.astimezone(tz).date()


def agregar_pedidos_por_dia(fechas_utc, tz: ZoneInfo = TZ_NEGOCIO) -> dict:
    """
    Media de pedidos recibidos por cada día de la semana (lunes a viernes).

    Fórmula, para cada día D:

        media(D) = pedidos creados en cualquier fecha local que caiga en D
                   ---------------------------------------------------------
                   nº de fechas que caen en D dentro del periodo cubierto

    El periodo cubierto va del primer al último pedido (ambos incluidos) en
    hora local canaria. El denominador cuenta FECHAS reales, no semanas: si el
    histórico empieza un miércoles, ese lunes y ese martes no existen y no se
    cuentan, así que una semana parcial no infla ni diluye la media.

    Función pura (recibe fechas, no una Session) para poder probar la zona
    horaria y los periodos parciales sin base de datos.
    """
    todas = list(fechas_utc)
    momentos = [f for f in todas if f is not None]
    sin_fecha = len(todas) - len(momentos)

    if not momentos:
        return {
            "dias": [
                {"iso": d, "dia": NOMBRES_DIAS[d], "total": 0, "ocurrencias": 0, "media": 0.0}
                for d in DIAS_LABORABLES
            ],
            "total_pedidos": 0,
            "pedidos_fin_de_semana": 0,
            "pedidos_sin_fecha": sin_fecha,
            "desde": None,
            "hasta": None,
            "dias_mas_pedidos": [],
            "dias_menos_pedidos": [],
        }

    por_fecha = Counter(a_fecha_local(m, tz) for m in momentos)
    desde, hasta = min(por_fecha), max(por_fecha)

    totales = {d: 0 for d in DIAS_LABORABLES}
    ocurrencias = {d: 0 for d in DIAS_LABORABLES}
    fin_de_semana = 0

    # Recorre el calendario del periodo día a día: así los días laborables sin
    # ningún pedido cuentan como ocurrencia con 0 pedidos (bajan la media),
    # que es justo lo que hace honesta la comparación entre días.
    cursor = desde
    while cursor <= hasta:
        iso = cursor.isoweekday()
        if iso in ocurrencias:
            ocurrencias[iso] += 1
            totales[iso] += por_fecha.get(cursor, 0)
        cursor += timedelta(days=1)

    for fecha, cantidad in por_fecha.items():
        if fecha.isoweekday() not in totales:
            fin_de_semana += cantidad

    dias = []
    for iso in DIAS_LABORABLES:
        ocurr = ocurrencias[iso]
        dias.append(
            {
                "iso": iso,
                "dia": NOMBRES_DIAS[iso],
                "total": totales[iso],
                "ocurrencias": ocurr,
                "media": round(totales[iso] / ocurr, 2) if ocurr else 0.0,
            }
        )

    # Máximos y mínimos como LISTA: si hay empate se muestran todos los días
    # empatados en lugar de elegir uno arbitrariamente.
    con_datos = [d for d in dias if d["ocurrencias"] > 0]
    if con_datos:
        media_max = max(d["media"] for d in con_datos)
        media_min = min(d["media"] for d in con_datos)
        mas = [d["dia"] for d in con_datos if d["media"] == media_max]
        menos = [d["dia"] for d in con_datos if d["media"] == media_min]
        # Si todos los días empatan no hay "el que más" ni "el que menos".
        if media_max == media_min:
            mas, menos = [], []
    else:
        mas, menos = [], []

    return {
        "dias": dias,
        "total_pedidos": sum(totales.values()),
        "pedidos_fin_de_semana": fin_de_semana,
        "pedidos_sin_fecha": sin_fecha,
        "desde": desde.isoformat(),
        "hasta": hasta.isoformat(),
        "dias_mas_pedidos": mas,
        "dias_menos_pedidos": menos,
    }


def pedidos_por_dia_semana(db: Session) -> dict:
    """
    Igual que `agregar_pedidos_por_dia`, leyendo del histórico del ayuntamiento
    activo.

    Cuenta TODOS los pedidos recibidos (salida y reposición, en cualquier
    estado, incluidos denegados y cancelados): la pregunta aquí no es cuánta
    demanda hubo, sino qué días entra más trabajo por la puerta. Un pedido que
    luego se deniega también consumió esa jornada.

    Se trae una única columna (`created_at`), no los pedidos completos ni sus
    líneas.
    """
    fechas = [fila[0] for fila in db.query(Pedido.created_at).all()]
    return agregar_pedidos_por_dia(fechas)


# ---------------------------------------------------------------------------
# RESPUESTA AGREGADA DEL DASHBOARD
# ---------------------------------------------------------------------------

def dashboard_analytics(db: Session, limite: int = TOP_POR_DEFECTO) -> dict:
    """Las tres métricas en una sola respuesta (una sola llamada del front)."""
    return {
        "productos_demandados": top_productos_demandados(db, limite=limite),
        "destinos_frecuentes": top_destinos_frecuentes(db, limite=limite),
        "pedidos_por_dia": pedidos_por_dia_semana(db),
        "zona_horaria": str(TZ_NEGOCIO),
    }
