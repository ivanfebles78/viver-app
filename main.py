from datetime import date, datetime, timedelta
from typing import Optional
import unicodedata
import uuid
import json
from decimal import Decimal

from fastapi import FastAPI, Depends, HTTPException, status, Header, UploadFile, File, Request
import io
import logging
import traceback
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from pdf_pedido import generar_pdf_pedido
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload
from passlib.context import CryptContext
from jose import jwt, JWTError
from sqlalchemy import func, or_, and_, text, inspect as sa_inspect
from db import SessionLocal

from db import engine
from models import (
    Cliente,
    Usuario,
    Producto,
    Movimiento,
    Lote,
    InventarioLote,
    MovimientoLoteDetalle,
    Pedido,
    PedidoItem,
    CaducidadConfig,
    AccountToken,
    ZonaPolygon,
    Base,
)
from schemas import PedidoActionRequest, PedidoDecidirRequest, PedidoOut

# Importar `tenant` registra los eventos SQLAlchemy que aíslan los datos por
# ayuntamiento (cliente_id). Debe importarse siempre, aunque no se use un
# símbolo directamente. Ver tenant.py.
import tenant
from tenant import set_session_cliente

import account_tokens
import email_service




# =============================
# APP
# =============================
app = FastAPI()
Base.metadata.create_all(bind=engine)


def _ensure_schema() -> None:
    """Migraciones ligeras e idempotentes para columnas nuevas que create_all()
    no añade a tablas ya existentes (PostgreSQL soporta ADD COLUMN IF NOT
    EXISTS). Seguro de ejecutar en cada arranque."""
    ddl = [
        "ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS distrito_destino VARCHAR(150)",
        "ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS barrio_destino VARCHAR(150)",
        "ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS direccion_destino VARCHAR(255)",
        "ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio NUMERIC(10,2)",
        # --- multi-tenant: cliente_id en todas las tablas de datos ---
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id)",
        "ALTER TABLE productos ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id)",
        "ALTER TABLE caducidad_reglas ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id)",
        "ALTER TABLE lotes ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id)",
        "ALTER TABLE inventario_lote ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id)",
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id)",
        "ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id)",
        "ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id)",
        "ALTER TABLE movimiento_lote_detalle ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id)",
        # --- imagen del mapa por ayuntamiento (guardada en la BD) ---
        "ALTER TABLE clientes ADD COLUMN IF NOT EXISTS mapa_imagen BYTEA",
        "ALTER TABLE clientes ADD COLUMN IF NOT EXISTS mapa_mimetype VARCHAR(60)",
        "ALTER TABLE clientes ADD COLUMN IF NOT EXISTS mapa_updated_at TIMESTAMP",
        "ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cuota_mensual NUMERIC(10,2)",
    ]
    try:
        with engine.begin() as conn:
            for stmt in ddl:
                conn.execute(text(stmt))
    except Exception as exc:  # pragma: no cover - no debe tumbar el arranque
        print(f"[schema] aviso al asegurar columnas: {exc}")


_ensure_schema()


def _seed_bootstrap() -> None:
    """Arranque de una BD nueva y vacía: crea el ayuntamiento de Santa Cruz
    (cliente id=1) y, si no existe ningún usuario, un super-admin global y un
    admin_vivero para Santa Cruz. Idempotente: no toca nada si ya hay datos.

    Las credenciales iniciales se pueden fijar por variables de entorno; si no,
    se usan valores por defecto que DEBEN cambiarse tras el primer login.
    """
    import os

    db = SessionLocal()
    try:
        cliente = db.query(Cliente).filter(Cliente.slug == "santa-cruz").first()
        if not cliente:
            cliente = Cliente(
                id=1,
                nombre="Ayuntamiento de Santa Cruz de Tenerife",
                slug="santa-cruz",
                activo=True,
            )
            db.add(cliente)
            db.commit()
            db.refresh(cliente)

        total_users = db.query(Usuario).count()
        if total_users == 0:
            sa_pwd = os.getenv("BOOTSTRAP_SUPERADMIN_PASSWORD", "superadmin1234")
            admin_pwd = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "admin1234")
            db.add(
                Usuario(
                    username="superadmin",
                    email=os.getenv("BOOTSTRAP_SUPERADMIN_EMAIL"),
                    password_hash=pwd_context.hash(sa_pwd),
                    status="activo",
                    rol="superadmin",
                    cliente_id=None,  # dueño global de la plataforma (ningún ayuntamiento)
                )
            )
            db.add(
                Usuario(
                    username="admin_sct",
                    email=os.getenv("BOOTSTRAP_ADMIN_EMAIL"),
                    password_hash=pwd_context.hash(admin_pwd),
                    status="activo",
                    rol="admin",
                    cliente_id=cliente.id,  # administrador del ayuntamiento de Santa Cruz
                )
            )
            db.commit()
            print(
                "[seed] Usuarios de arranque creados: 'superadmin' (plataforma) y "
                "'admin_sct' (admin de Santa Cruz). Cambia las contraseñas."
            )
    except Exception as exc:  # pragma: no cover - no debe tumbar el arranque
        db.rollback()
        print(f"[seed] aviso durante el arranque: {exc}")
    finally:
        db.close()


# NOTA: la llamada a _seed_bootstrap() se hace más abajo, una vez definido
# `pwd_context` (necesita hashear las contraseñas iniciales).

import os as _os_cors
# Orígenes permitidos: localhost (dev) + cualquier subdominio *.railway.app.
# Para un dominio propio, añádelo en la variable EXTRA_CORS_ORIGINS (separados
# por comas), p.ej. "https://viverapp.midominio.com".
_cors_origins = [
    "http://localhost:5173",
    "http://localhost:5476",
    "https://viver-app.com",
    "https://www.viver-app.com",
]
_extra = _os_cors.getenv("EXTRA_CORS_ORIGINS", "")
_cors_origins += [o.strip() for o in _extra.split(",") if o.strip()]

_CORS_REGEX = __import__("re").compile(r"https://.*\.railway\.app")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"https://.*\.railway\.app",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger = logging.getLogger("viverapp")
logging.basicConfig(level=logging.INFO)


def _cors_headers_for(request: Request) -> dict:
    """Cabeceras CORS para una respuesta de error. El CORSMiddleware NO se aplica
    a las respuestas 500 no controladas (van por una capa exterior), así que las
    añadimos a mano para que el navegador pueda LEER el mensaje de error en vez
    de mostrar un 'CORS error' engañoso que oculta la causa real."""
    origin = request.headers.get("origin")
    if not origin:
        return {}
    if origin in _cors_origins or _CORS_REGEX.fullmatch(origin):
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
            "Vary": "Origin",
        }
    return {}


# Cuando un endpoint crashea con una excepción no controlada, FastAPI devuelve
# un 500 cuyo cuerpo NO pasa por el CORSMiddleware. Este handler registra el
# traceback completo en los logs de Railway y devuelve un JSON con detalle útil
# AL QUE le añadimos las cabeceras CORS a mano, para que el frontend muestre el
# error real al usuario en lugar de un net::ERR_FAILED.
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error(
        "[unhandled] %s %s\n%s",
        request.method,
        request.url.path,
        traceback.format_exc(),
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": f"Error interno: {type(exc).__name__}: {str(exc)[:300]}",
        },
        headers=_cors_headers_for(request),
    )

# =============================
# CONFIG AUTH
# =============================
import os as _os
# En producción (Railway) define SECRET_KEY como variable de entorno. El valor
# por defecto es SOLO para desarrollo local.
SECRET_KEY = _os.getenv("SECRET_KEY", "dev-secret-key-viverapp-CAMBIAR")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 12

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Ya tenemos `pwd_context`: sembramos la BD (Santa Cruz + usuarios de arranque).
_seed_bootstrap()


# =============================
# DB
# =============================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =============================
# SCHEMAS AUTH
# =============================
class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


# =============================
# SCHEMAS PEDIDOS
# =============================
class PedidoItemCreate(BaseModel):
    producto_id: int
    tamano: str
    cantidad: float
    # Destino de esta línea (pedidos con varios destinos). Si es None se usa el
    # destino a nivel de pedido.
    distrito_destino: Optional[str] = None
    barrio_destino: Optional[str] = None
    direccion_destino: Optional[str] = None


class PedidoCreate(BaseModel):
    items: list[PedidoItemCreate]
    nota: Optional[str] = None
    distrito_destino: Optional[str] = None
    barrio_destino: Optional[str] = None
    direccion_destino: Optional[str] = None
    tipo: Optional[str] = "salida"


# =============================
# SCHEMAS MOVIMIENTOS
# =============================
class MovimientoCreate(BaseModel):
    pedido_id: Optional[int] = None
    pedido_item_id: Optional[int] = None
    uuid_lote: Optional[str] = None

    producto_id: int
    cantidad: float
    origen_tipo: str
    destino_tipo: str

    zona_origen: Optional[str] = None
    zona_destino: Optional[str] = None

    tamano_origen: Optional[str] = None
    tamano_destino: Optional[str] = None

    distrito_destino: Optional[str] = None
    barrio_destino: Optional[str] = None
    direccion_destino: Optional[str] = None
    cp_destino: Optional[str] = None

    nota: Optional[str] = None

    # 🔥 NUEVO
    observaciones: Optional[str] = None
    es_prestamo: bool = False
    es_devolucion: bool = False
    prestamo_referencia_id: Optional[int] = None
    fecha_disponibilidad: Optional[date] = None
    # Fecha/hora del movimiento. Si no se envía, se usa el momento actual.
    # Permite registrar a posteriori un movimiento que ocurrió en otra fecha.
    fecha_movimiento: Optional[datetime] = None

class MovimientoOut(BaseModel):
    id: int
    pedido_id: Optional[int] = None
    pedido_item_id: Optional[int] = None
    uuid_lote: Optional[str] = None
    producto_id: int
    cantidad: float
    tipo_movimiento: str
    origen_tipo: str
    destino_tipo: str
    zona_origen: Optional[str] = None
    zona_destino: Optional[str] = None
    tamano_origen: Optional[str] = None
    tamano_destino: Optional[str] = None
    distrito_destino: Optional[str] = None
    barrio_destino: Optional[str] = None
    direccion_destino: Optional[str] = None
    cp_destino: Optional[str] = None
    created_by: Optional[str] = None
    fecha_movimiento: datetime
    fecha_caducidad: Optional[date] = None
    dias_caducidad_aplicados: Optional[int] = None
    fecha_disponibilidad: Optional[date] = None

    class Config:
        from_attributes = True


# =============================
# HELPERS AUTH
# =============================
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        if not password_hash or not str(password_hash).strip():
            return False
        return pwd_context.verify(plain_password, password_hash)
    except Exception:
        return False


MAX_FAILED_LOGIN_ATTEMPTS = 3


@app.post("/auth/login", response_model=LoginResponse)
def auth_login(payload: LoginRequest, db: Session = Depends(get_db)):
    # El username es case-insensitive (medina, Medina y MEDINA son el mismo).
    # La contraseña SIGUE siendo case-sensitive — esa es la parte segura.
    username_lookup = (payload.username or "").strip().lower()
    user = (
        db.query(Usuario)
        .filter(func.lower(Usuario.username) == username_lookup)
        .first()
    )

    if not user:
        # Mensaje genérico para no filtrar si el usuario existe o no.
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    status_norm = (user.status or "").strip().lower()

    if status_norm == "bloqueado":
        raise HTTPException(
            status_code=403,
            detail="Cuenta bloqueada por intentos fallidos. Contacta con un administrador.",
        )

    if status_norm == "pendiente":
        raise HTTPException(
            status_code=403,
            detail="Cuenta pendiente de activación. Revisa tu email.",
        )

    if status_norm and status_norm != "activo":
        raise HTTPException(status_code=403, detail="Usuario inactivo")

    password_hash = getattr(user, "password_hash", None)

    if not verify_password(payload.password, password_hash):
        # Incrementar contador de fallos y bloquear si llegamos al límite.
        current_failures = (user.failed_login_attempts or 0) + 1
        user.failed_login_attempts = current_failures
        if current_failures >= MAX_FAILED_LOGIN_ATTEMPTS:
            user.status = "bloqueado"
        db.add(user)
        db.commit()

        if current_failures >= MAX_FAILED_LOGIN_ATTEMPTS:
            raise HTTPException(
                status_code=403,
                detail=(
                    "Cuenta bloqueada por superar el número máximo de intentos. "
                    "Contacta con un administrador."
                ),
            )
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    # Login correcto: reseteamos el contador de fallos.
    if user.failed_login_attempts:
        user.failed_login_attempts = 0
        db.add(user)
        db.commit()

    access_token = create_access_token({"sub": user.username})

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "rol": user.rol,
            "status": user.status,
            "cliente_id": user.cliente_id,
        },
    }


# Rol GLOBAL de plataforma ("superadmin"): dueño de la SaaS, no está atado a
# ningún ayuntamiento (cliente_id NULL). Ve todos los ayuntamientos, elige uno
# con X-Cliente-Id, y administra la plataforma (enrollment, estadísticas…).
# `admin` y `admin_vivero`, en cambio, SÍ pertenecen a un ayuntamiento.
ROL_ADMIN_GLOBAL = "superadmin"


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    x_cliente_id: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")

    token = authorization.split(" ", 1)[1].strip()

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Token inválido")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido")

    # OJO: en este punto la Session aún no tiene cliente_id activo, así que la
    # búsqueda del usuario NO está filtrada por ayuntamiento (username es único
    # global). Justo después fijamos el ayuntamiento activo de la petición.
    user = db.query(Usuario).filter(Usuario.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")

    # --- Resolución del ayuntamiento activo para el resto de la petición ---
    rol = (user.rol or "").strip().lower()
    if rol == ROL_ADMIN_GLOBAL:
        # El super-admin global elige el ayuntamiento con la cabecera
        # X-Cliente-Id. Si no manda ninguna, opera sin filtro (ve todos).
        active_cid = None
        if x_cliente_id is not None and str(x_cliente_id).strip() != "":
            try:
                active_cid = int(x_cliente_id)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="X-Cliente-Id inválido")
    else:
        # Cualquier otro rol queda atado SIEMPRE a su propio ayuntamiento,
        # ignorando cualquier X-Cliente-Id que intente enviar el cliente.
        active_cid = user.cliente_id
        if active_cid is None:
            raise HTTPException(
                status_code=403,
                detail="Tu usuario no está asociado a ningún ayuntamiento.",
            )

    set_session_cliente(db, active_cid)
    return user


def require_roles(roles: list[str]):
    allowed = {r.lower() for r in roles}
    # Jerarquía de administración: donde se permita `admin`, también entran
    # `admin_vivero` (admin del vivero, subconjunto) y `superadmin` (plataforma,
    # que puede hacer todo lo que un admin hace). Todos quedan acotados por el
    # aislamiento de tenant.py; los endpoints SOLO-plataforma usan
    # `require_global_admin`.
    if "admin" in allowed:
        allowed.add("admin_vivero")
        allowed.add("superadmin")

    def _dep(current_user: Usuario = Depends(get_current_user)):
        rol = (current_user.rol or "").strip().lower()
        if rol not in allowed:
            raise HTTPException(status_code=403, detail="Sin permisos")
        return current_user

    return _dep


def require_global_admin():
    """Solo el `superadmin` (dueño de la plataforma, cliente_id NULL). Para
    herramientas globales cross-tenant: enrollment de ayuntamientos,
    estadísticas de plataforma, copia de seguridad y configuración de correo.
    Ni `admin` ni `admin_vivero` entran aquí."""

    def _dep(current_user: Usuario = Depends(get_current_user)):
        rol = (current_user.rol or "").strip().lower()
        if rol != ROL_ADMIN_GLOBAL:
            raise HTTPException(status_code=403, detail="Solo el superadmin de la plataforma")
        return current_user

    return _dep


# =============================
# HELPERS
# =============================
def _norm_str(value: Optional[str]) -> str:
    return (value or "").strip().lower()


def _norm_tam(value: Optional[str]) -> str:
    """Normaliza el tamaño/formato para comparar (sin mayúsculas/espacios).
    'M30' histórico se trata como 'M35'."""
    raw = (value or "").strip().lower()
    if raw == "m30":
        return "m35"
    return raw


def _norm_txt(value: Optional[str]) -> str:
    """Minúsculas y sin acentos, para comparar categorías/subcategorías."""
    s = unicodedata.normalize("NFD", str(value or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.strip().lower()


def _tamano_disponible_planta(categoria, subcategoria, tamano) -> bool:
    """Reglas de disponibilidad por tamaño de maceta para PLANTAS:
      - Semillero: nunca cuenta (aún no disponible).
      - Arbusto: solo M20 o M35.
      - Árbol y Palmera: solo M35.
      - Resto de plantas: M12, M20 o M35 (nunca semillero).
    No aplica a productos que no sean plantas (devuelve True)."""
    if _norm_txt(categoria) not in ("planta", "plantas"):
        return True
    t = _norm_tam(tamano)  # minúsculas, m30→m35
    if t in ("", "semillero"):
        return False
    sub = _norm_txt(subcategoria)
    if sub == "arbusto":
        return t in ("m20", "m35")
    if sub in ("arbol", "palmera"):
        return t == "m35"
    return t in ("m12", "m20", "m35")

def safeArray(x):
    return x if isinstance(x, list) else []
    
    
def _unique_preserve_order(values: list[str]) -> list[str]:
    seen = set()
    out = []
    for value in values:
        v = (value or "").strip()
        if not v or v in seen:
            continue
        seen.add(v)
        out.append(v)
    return out


def _join_uuid_lotes(values: list[str]) -> Optional[str]:
    uuids = _unique_preserve_order(values)
    return ",".join(uuids) if uuids else None


def _tipo_movimiento(origen_tipo: str, destino_tipo: str) -> str:
    origen = _norm_str(origen_tipo)
    destino = _norm_str(destino_tipo)

    if origen != "vivero" and destino == "vivero":
        return "entrada"
    if origen == "vivero" and destino == "vivero":
        return "traslado_interno"
    if origen == "vivero" and destino != "vivero":
        return "salida"
    return "movimiento"


def _tamano_aplicable_para_caducidad(payload: MovimientoCreate) -> Optional[str]:
    destino = _norm_str(payload.destino_tipo)
    if destino == "vivero":
        return (payload.tamano_destino or "").strip() or None
    return None


def _buscar_regla_caducidad(
    db: Session,
    categoria: Optional[str],
    subcategoria: Optional[str],
    tamano: Optional[str],
) -> Optional[CaducidadConfig]:
    categoria = (categoria or "").strip()
    subcategoria = (subcategoria or "").strip()
    tamano = (tamano or "").strip()

    if not categoria:
        return None

    base = db.query(CaducidadConfig).filter(CaducidadConfig.activo == True).filter(
        func.lower(CaducidadConfig.categoria) == categoria.lower()
    )

    # 1. Exact match (categoria + subcategoria + tamano) — si están todos
    if subcategoria and tamano:
        regla = (
            base
            .filter(func.lower(CaducidadConfig.subcategoria) == subcategoria.lower())
            .filter(func.lower(CaducidadConfig.tamano) == tamano.lower())
            .first()
        )
        if regla:
            return regla

    # 2. categoria + tamano, subcategoria = NULL (comodín)
    if tamano:
        regla = (
            base
            .filter(CaducidadConfig.subcategoria.is_(None))
            .filter(func.lower(CaducidadConfig.tamano) == tamano.lower())
            .first()
        )
        if regla:
            return regla

    # 3. categoria + subcategoria, tamano = NULL
    if subcategoria:
        regla = (
            base
            .filter(func.lower(CaducidadConfig.subcategoria) == subcategoria.lower())
            .filter(CaducidadConfig.tamano.is_(None))
            .first()
        )
        if regla:
            return regla

    # 4. Solo categoria (subcategoria y tamano = NULL)
    regla = (
        base
        .filter(CaducidadConfig.subcategoria.is_(None))
        .filter(CaducidadConfig.tamano.is_(None))
        .first()
    )
    return regla


def _calcular_fecha_caducidad(
    db: Session,
    producto: Producto,
    tamano: Optional[str],
    fecha_base: datetime,
) -> tuple[Optional[date], Optional[int]]:
    regla = _buscar_regla_caducidad(
        db=db,
        categoria=getattr(producto, "categoria", None),
        subcategoria=getattr(producto, "subcategoria", None),
        tamano=tamano,
    )

    if not regla or regla.dias_caducidad is None:
        return None, None

    dias = int(regla.dias_caducidad)
    fecha = (fecha_base.date() + timedelta(days=dias))
    return fecha, dias


def _get_fecha_caducidad_actual_lote(
    db: Session,
    uuid_lote: str,
    producto_id: int,
    zona: Optional[str],
    tamano: Optional[str],
) -> Optional[date]:
    if not uuid_lote:
        return None

    row = (
        db.query(Movimiento)
        .join(MovimientoLoteDetalle, MovimientoLoteDetalle.movimiento_id == Movimiento.id)
        .filter(MovimientoLoteDetalle.uuid_lote == uuid_lote)
        .filter(MovimientoLoteDetalle.producto_id == producto_id)
        .filter(MovimientoLoteDetalle.zona_destino == zona)
        .filter(MovimientoLoteDetalle.tamano_destino == tamano)
        .filter(Movimiento.fecha_caducidad.isnot(None))
        .order_by(Movimiento.fecha_movimiento.desc(), Movimiento.id.desc())
        .first()
    )

    return getattr(row, "fecha_caducidad", None) if row else None


def _disponible_filter():
    hoy = datetime.utcnow().date()
    return or_(
        InventarioLote.fecha_disponibilidad.is_(None),
        InventarioLote.fecha_disponibilidad <= hoy,
    )


def _stock_total_producto(db: Session, producto_id: int) -> int:
    rows = (
        db.query(InventarioLote)
        .filter(InventarioLote.producto_id == producto_id)
        .filter(_disponible_filter())
        .all()
    )
    return sum(float(r.cantidad_disponible or 0) for r in rows)


def _stock_en_zona_tamano(
    db: Session,
    producto_id: int,
    zona: Optional[str],
    tamano: Optional[str],
    include_no_disponibles: bool = False,
) -> int:
    # Comparamos zona y tamaño NORMALIZADOS en Python (no con `==` exacto en
    # SQL): la grafía guardada puede variar ("11" vs "zona-11", "M20" vs "m20"),
    # y un `==` exacto devolvía 0 aunque hubiera stock.
    q = db.query(InventarioLote).filter(InventarioLote.producto_id == producto_id)
    if not include_no_disponibles:
        q = q.filter(_disponible_filter())
    rows = q.all()
    zn = _normalize_zona_id(zona or "")
    tn = _norm_tam(tamano or "")
    total = 0.0
    for r in rows:
        if _normalize_zona_id(getattr(r, "zona", None) or "") != zn:
            continue
        if _norm_tam(getattr(r, "tamano", None) or "") != tn:
            continue
        total += float(r.cantidad_disponible or 0)
    return total


def _stock_por_tamano_producto(db: Session, producto_id: int) -> dict:
    rows = (
        db.query(InventarioLote)
        .filter(
            InventarioLote.producto_id == producto_id,
            InventarioLote.cantidad_disponible > 0,
        )
        .filter(_disponible_filter())
        .all()
    )

    out = {}
    for r in rows:
        tam = (r.tamano or "").strip()
        if not tam:
            continue
        out[tam] = out.get(tam, 0) + float(r.cantidad_disponible or 0)

    return out


def _stock_total_producto_tamano(db: Session, producto_id: int, tamano: str) -> int:
    rows = (
        db.query(InventarioLote)
        .filter(
            InventarioLote.producto_id == producto_id,
            InventarioLote.tamano == tamano,
            InventarioLote.cantidad_disponible > 0,
        )
        .filter(_disponible_filter())
        .all()
    )
    return sum(float(r.cantidad_disponible or 0) for r in rows)


def _transicionar_pedidos_caducados(db: Session) -> int:
    """
    Marca como CADUCADO todos los pedidos cuya fecha_caducidad ya pasó
    y que todavía estén vivos (RESERVA / APROBADO_PARCIAL / APROBADO).
    Devuelve el número afectado.
    """
    hoy = datetime.utcnow().date()
    q = (
        db.query(Pedido)
        .filter(Pedido.fecha_caducidad.isnot(None))
        .filter(Pedido.fecha_caducidad < hoy)
        .filter(func.upper(Pedido.estado).in_(["RESERVA", "APROBADO_PARCIAL", "APROBADO"]))
    )
    vencidos = q.all()
    for p in vencidos:
        p.estado = "CADUCADO"
    if vencidos:
        db.commit()
    return len(vencidos)


def _asegurar_no_caducado(pedido: Pedido, db: Session) -> None:
    """Si el pedido ha pasado su fecha_caducidad y sigue vivo, lo cierra como CADUCADO y lanza 400."""
    if pedido is None or pedido.fecha_caducidad is None:
        return
    hoy = datetime.utcnow().date()
    estado_norm = (pedido.estado or "").upper()
    if pedido.fecha_caducidad < hoy and estado_norm in ("RESERVA", "APROBADO_PARCIAL", "APROBADO"):
        pedido.estado = "CADUCADO"
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="El pedido ha caducado. Ya no se puede modificar ni aprobar.",
        )


def _item_estado(item: PedidoItem) -> str:
    """Per-item state, normalised to upper-case.  Defaults to RESERVA when
    the column is absent (e.g. brand new code reading legacy data before
    the migration runs)."""
    raw = getattr(item, "estado_item", None) or "RESERVA"
    return str(raw).strip().upper() or "RESERVA"


def _pedido_totalmente_servido(pedido: Pedido) -> bool:
    """True si TODAS las líneas servibles (no denegadas) del pedido están
    servidas por completo y al menos una se ha servido. Las líneas RESERVA
    (pendientes de decidir) tienen cantidad_servida 0, así que impiden el True
    hasta que se decidan. Es el mismo criterio que usa crear_movimiento."""
    servibles = [it for it in (pedido.items or []) if _item_estado(it) != "DENEGADO"]
    if not servibles:
        return False
    algo_servido = any(float(getattr(it, "cantidad_servida", 0) or 0) > 0 for it in servibles)
    todas = all(
        float(getattr(it, "cantidad_servida", 0) or 0) >= float(getattr(it, "cantidad", 0) or 0)
        for it in servibles
    )
    return algo_servido and todas


def _transicionar_pedidos_servidos(db: Session) -> int:
    """Marca como SERVIDO los pedidos APROBADO/APROBADO_PARCIAL cuyas líneas
    aprobadas ya están todas servidas. Repara pedidos que quedaron 'colgados'
    en APROBADO_PARCIAL (p.ej. servidos antes de existir esta transición) y que
    de otro modo no mostrarían líneas pendientes pero tampoco estado SERVIDO."""
    candidatos = (
        db.query(Pedido)
        .options(selectinload(Pedido.items))
        .filter(func.upper(Pedido.estado).in_(["APROBADO", "APROBADO_PARCIAL"]))
        .all()
    )
    afectados = 0
    for p in candidatos:
        if _pedido_totalmente_servido(p):
            p.estado = "SERVIDO"
            if hasattr(p, "served_at") and not getattr(p, "served_at", None):
                p.served_at = datetime.utcnow()
            afectados += 1
    if afectados:
        db.commit()
    return afectados


# =============================
# RESERVA DE STOCK (derivada)
# =============================
# El stock "reservado" se calcula a partir de los pedidos de SALIDA vivos, sin
# columnas nuevas: cada línea no denegada y aún no servida del todo mantiene
# reservada su cantidad pendiente. Así el ciclo es automático:
#   - crear pedido      → línea RESERVA      → reservado
#   - denegar línea     → estado DENEGADO    → liberado
#   - aprobar           → estado APROBADO    → sigue reservado
#   - servir (recoger)  → cantidad_servida ↑ → reservado ↓ (y el stock real baja
#                          con el movimiento, así "disponible" queda consistente)
#   - caducar pedido    → estado CADUCADO    → liberado
# disponible = stock_real − reservado.
def _reservas_por_producto_tamano(db: Session, exclude_pedido_id: Optional[int] = None) -> dict:
    """Devuelve {(producto_id, tamaño_normalizado): cantidad_reservada}."""
    hoy = datetime.utcnow().date()
    pedidos = (
        db.query(Pedido)
        .filter(func.lower(Pedido.tipo) == "salida")
        .filter(func.upper(Pedido.estado).in_(["RESERVA", "APROBADO", "APROBADO_PARCIAL"]))
        .filter(or_(Pedido.fecha_caducidad.is_(None), Pedido.fecha_caducidad >= hoy))
        .all()
    )
    out: dict = {}
    for p in pedidos:
        if exclude_pedido_id is not None and int(getattr(p, "id", 0) or 0) == int(exclude_pedido_id):
            continue
        for it in (getattr(p, "items", None) or []):
            if _item_estado(it) == "DENEGADO":
                continue
            pend = float(getattr(it, "cantidad", 0) or 0) - float(getattr(it, "cantidad_servida", 0) or 0)
            if pend <= 0:
                continue
            key = (int(getattr(it, "producto_id", 0) or 0), _norm_tam(getattr(it, "tamano", None)))
            out[key] = out.get(key, 0.0) + pend
    return out


def _reservado_producto_tamano(db: Session, producto_id: int, tamano: str, exclude_pedido_id: Optional[int] = None) -> float:
    m = _reservas_por_producto_tamano(db, exclude_pedido_id=exclude_pedido_id)
    return m.get((int(producto_id), _norm_tam(tamano)), 0.0)


def recompute_pedido_estado(pedido: Pedido) -> str:
    """
    Derive the pedido's aggregate state from its items' `estado_item` values.

    The caller still owns terminal states (SERVIDO / CANCELADO / CADUCADO) —
    we only recompute within the RESERVA / APROBADO_PARCIAL / APROBADO /
    DENEGADO continuum:

      • Any item RESERVA  AND no item APROBADO   → pedido = RESERVA
        (nothing serviceable yet — keep in approvals queue, hide from proveedor)
      • Any item RESERVA  AND ≥1 item APROBADO   → pedido = APROBADO_PARCIAL
        (proveedor can start serving the approved ones; manager still needs
        to decide the rest)
      • No item RESERVA  AND ≥1 item APROBADO    → pedido = APROBADO
      • All items DENEGADO                       → pedido = DENEGADO
      • No items                                 → leave estado unchanged.

    The function mutates `pedido.estado` in place and returns the new value.
    The caller is responsible for `db.commit()`.
    """
    terminal = {"SERVIDO", "CANCELADO", "CADUCADO"}
    current = (pedido.estado or "").upper()
    if current in terminal:
        return current

    items = getattr(pedido, "items", None) or []
    if not items:
        return current

    has_reserva  = any(_item_estado(it) == "RESERVA"  for it in items)
    has_approved = any(_item_estado(it) == "APROBADO" for it in items)
    has_denegado = any(_item_estado(it) == "DENEGADO" for it in items)

    # APROBADO_PARCIAL means: at least one APROBADO line co-exists with at
    # least one non-APROBADO line (RESERVA or DENEGADO).  Two flavours:
    #   - APROBADO + RESERVA  → legacy partial (pre-atomic-decision flow)
    #   - APROBADO + DENEGADO → new partial (manager rejected some lines)
    if has_approved and (has_reserva or has_denegado):
        new_state = "APROBADO_PARCIAL"
    elif has_approved:
        new_state = "APROBADO"
    elif has_reserva:
        new_state = "RESERVA"
    else:
        new_state = "DENEGADO"

    pedido.estado = new_state
    return new_state


# Convenience: states where the pedido is still partly or fully serviceable
# by a proveedor / external company.  APROBADO_PARCIAL is intentionally
# included so the partial-approval workflow actually delivers value: the
# proveedor sees the pedido as soon as ANY of its items has been approved.
SERVICEABLE_STATES = ("APROBADO", "APROBADO_PARCIAL", "SERVIDO")

# States where the manager can still take aprobar/denegar actions on items
# (there are still RESERVA items to decide).
DECIDABLE_STATES   = ("RESERVA", "APROBADO_PARCIAL")


# ───────────────────────────────────────────────────────────────────────────
# Email notification helpers
# ───────────────────────────────────────────────────────────────────────────
def _emails_by_role(db: Session, *roles: str) -> list[str]:
    """Return all distinct, non-empty emails for users with one of the given roles."""
    if not roles:
        return []
    rows = (
        db.query(Usuario.email)
        .filter(func.lower(Usuario.rol).in_([r.lower() for r in roles]))
        .filter(Usuario.email.isnot(None))
        .all()
    )
    seen, out = set(), []
    for (e,) in rows:
        e = (e or "").strip()
        if not e:
            continue
        k = e.lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(e)
    return out


def _email_of_user(db: Session, username: str) -> Optional[str]:
    if not username:
        return None
    u = db.query(Usuario).filter(Usuario.username == username).first()
    return (u.email or "").strip() if u and u.email else None


def _safe_notify(label: str, fn, **kwargs) -> None:
    """Run an email-send function in a guarded try/except.  Email failures
    must NEVER break the underlying pedido transaction — they're a
    secondary effect."""
    try:
        fn(**kwargs)
    except Exception as exc:  # noqa: BLE001
        # Log to stdout so Railway captures it.  We deliberately swallow.
        print(f"[email] WARN {label} failed: {exc}", flush=True)


def _pdf_silencioso(pedido, viewer_role: Optional[str] = None) -> Optional[bytes]:
    """Generate the PDF for the given pedido, returning None on any error
    so a broken PDF doesn't take down the rest of the notification."""
    try:
        return generar_pdf_pedido(pedido, viewer_role=viewer_role)
    except Exception as exc:  # noqa: BLE001
        print(f"[email] WARN PDF generation failed for pedido {getattr(pedido, 'id', '?')}: {exc}", flush=True)
        return None


def _users_without_email(db: Session, *roles: str) -> list[str]:
    """Return usernames of users that have one of the given roles but no
    email registered.  Used to surface 'X usuarios no recibirán aviso'
    warnings in the API response."""
    if not roles:
        return []
    rows = (
        db.query(Usuario.username)
        .filter(func.lower(Usuario.rol).in_([r.lower() for r in roles]))
        .filter((Usuario.email.is_(None)) | (func.length(func.trim(Usuario.email)) == 0))
        .all()
    )
    return [u for (u,) in rows if u]


def _notificar_pedido_creado(db: Session, pedido: Pedido) -> list[str]:
    """Pedido recién creado → email a managers con PDF adjunto.
    Devuelve una lista de avisos (recipients sin email)."""
    warnings: list[str] = []
    managers = _emails_by_role(db, "manager")
    missing = _users_without_email(db, "manager")
    if missing:
        warnings.append(
            f"{len(missing)} manager(s) sin email registrado no recibirán el aviso: "
            + ", ".join(missing)
        )
    if not managers:
        # Diferencia entre 'no hay managers' y 'los hay pero sin email'.
        any_manager = (
            db.query(Usuario)
            .filter(func.lower(Usuario.rol) == "manager")
            .first()
        )
        if not any_manager:
            warnings.append("No hay ningún usuario con rol manager — nadie recibirá el aviso del pedido nuevo.")
        # Si hay managers pero todos sin email, el warning ya está cubierto arriba.
        return warnings

    pdf = _pdf_silencioso(pedido)
    _safe_notify(
        "pedido_creado_a_manager",
        email_service.send_pedido_creado_a_manager,
        recipients=managers,
        pedido=pedido,
        pdf_bytes=pdf,
    )
    return warnings


def _notificar_pedido_decidido(db: Session, pedido: Pedido) -> list[str]:
    """Pedido decidido (aprobar/denegar/decidir) → notificar a:
       - solicitante (con PDF general)
       - técnicos del vivero (FYI, con PDF general)
       - proveedor (solo reposición y solo si hay items aprobados — PDF
         filtrado a sus líneas).
    Devuelve una lista de avisos para recipients sin email registrado.
    """
    warnings: list[str] = []
    estado = (getattr(pedido, "estado", "") or "").upper()
    tipo = (getattr(pedido, "tipo", "") or "salida").strip().lower()

    pdf_general = _pdf_silencioso(pedido)

    # --- Solicitante -----------------------------------------------------
    solicitante_username = (getattr(pedido, "solicitante_username", "") or "").strip()
    solicitante_email = _email_of_user(db, solicitante_username) if solicitante_username else None
    if solicitante_username and not solicitante_email:
        warnings.append(
            f"El solicitante '{solicitante_username}' no tiene email registrado — "
            "no se le pudo notificar la decisión."
        )
    if solicitante_email:
        _safe_notify(
            "pedido_decidido_a_solicitante",
            email_service.send_pedido_decidido_a_solicitante,
            recipients=[solicitante_email],
            pedido=pedido,
            pdf_bytes=pdf_general,
        )

    # --- Técnicos del vivero --------------------------------------------
    tecnicos = _emails_by_role(db, "tecnico", "gestor_vivero")
    tecnicos_sin_email = _users_without_email(db, "tecnico", "gestor_vivero")
    if tecnicos_sin_email:
        warnings.append(
            f"{len(tecnicos_sin_email)} técnico(s) sin email registrado no recibirán el FYI: "
            + ", ".join(tecnicos_sin_email)
        )
    # Evita mandarse a sí mismo si el solicitante también es técnico.
    if solicitante_email:
        tecnicos = [e for e in tecnicos if e.lower() != solicitante_email.lower()]
    if tecnicos:
        _safe_notify(
            "pedido_decidido_a_tecnico",
            email_service.send_pedido_decidido_a_tecnico,
            recipients=tecnicos,
            pedido=pedido,
            pdf_bytes=pdf_general,
        )

    # --- Proveedor (solo reposición con items aprobados) ----------------
    if tipo == "reposicion" and (estado in SERVICEABLE_STATES) and _has_any_approved_item(pedido):
        proveedores = _emails_by_role(db, "proveedor")
        proveedores_sin_email = _users_without_email(db, "proveedor")
        if proveedores_sin_email:
            warnings.append(
                f"{len(proveedores_sin_email)} proveedor(es) sin email registrado no recibirán el pedido: "
                + ", ".join(proveedores_sin_email)
            )
        if not proveedores:
            any_prov = (
                db.query(Usuario)
                .filter(func.lower(Usuario.rol) == "proveedor")
                .first()
            )
            if not any_prov:
                warnings.append("No hay ningún proveedor configurado — no se ha podido enviar el pedido a ninguno.")
        if proveedores:
            pdf_proveedor = _pdf_silencioso(pedido, viewer_role="proveedor")
            _safe_notify(
                "pedido_reposicion_decidido_a_proveedor",
                email_service.send_pedido_reposicion_decidido_a_proveedor,
                recipients=proveedores,
                pedido=pedido,
                pdf_bytes=pdf_proveedor,
            )

    return warnings


def _has_any_approved_item(pedido: Pedido) -> bool:
    """True if at least one item is APROBADO (or already SERVIDO).
    Used to decide whether the PDF endpoint is available even while the
    pedido itself is still in RESERVA due to other pending items."""
    items = getattr(pedido, "items", None) or []
    if not items:
        return False
    for it in items:
        st = _item_estado(it)
        if st in ("APROBADO", "SERVIDO"):
            return True
        # Legacy data with no estado_item but cantidad_servida > 0 counts as served.
        try:
            if float(getattr(it, "cantidad_servida", 0) or 0) > 0:
                return True
        except (TypeError, ValueError):
            pass
    return False


def _pedido_to_dict(
    pedido: Pedido,
    viewer_role: Optional[str] = None,
    warnings: Optional[list] = None,
) -> dict:
    """
    Serialise a Pedido to the JSON shape the frontend expects.

    `viewer_role` lets the serializer hide line items that the caller has
    no business seeing.  In particular:

      - proveedor → only APROBADO / SERVIDO lines are returned.  Denied
        or still-pending lines never reach a supplier's UI/PDF.  The
        pedido's overall `estado` is left untouched so the UI can still
        show "APROBADO PARCIAL" — the proveedor learns that the manager
        rejected some lines they're not seeing.

    For every other role the full items list is returned as before.

    `warnings` — optional list of non-fatal advisories (e.g. "manager X
    has no email registered, no aviso").  Included in the response so
    the frontend can surface them as a soft toast.
    """
    items = getattr(pedido, "items", []) or []
    role = (viewer_role or "").strip().lower()
    if role == "proveedor":
        items = [it for it in items if _item_estado(it) in ("APROBADO", "SERVIDO")]
    # La empresa externa / UTE (y el proveedor) no deben ver el motivo de
    # denegación; solo los roles internos. Lo ocultamos en la serialización,
    # lo que afecta tanto a la interfaz como al PDF generado.
    ocultar_motivo = role in ("empresa_externa", "proveedor")

    return {
        "id": getattr(pedido, "id", None),
        "estado": getattr(pedido, "estado", None),
        "tipo": getattr(pedido, "tipo", "salida") or "salida",
        "fecha_caducidad": getattr(pedido, "fecha_caducidad", None),
        "solicitante_username": getattr(pedido, "solicitante_username", None),
        "nota": getattr(pedido, "nota", None),
        "distrito_destino": getattr(pedido, "distrito_destino", None),
        "barrio_destino": getattr(pedido, "barrio_destino", None),
        "direccion_destino": getattr(pedido, "direccion_destino", None),
        "created_at": getattr(pedido, "created_at", None),
        "aprobado_por": getattr(pedido, "aprobado_por", None),
        "aprobado_at": getattr(pedido, "aprobado_at", None),
        "denegado_por": getattr(pedido, "denegado_por", None),
        "denegado_at": getattr(pedido, "denegado_at", None),
        "motivo_denegacion": None if ocultar_motivo else getattr(pedido, "motivo_denegacion", None),
        "served_at": getattr(pedido, "served_at", None),
        "served_by": getattr(pedido, "served_by", None),
        "items": [
            {
                "id": getattr(item, "id", None),
                "producto_id": getattr(item, "producto_id", None),
                "tamano": getattr(item, "tamano", None),
                "cantidad": getattr(item, "cantidad", 0),
                "cantidad_servida": getattr(item, "cantidad_servida", 0),
                "estado_item": _item_estado(item),
                # Destino de la línea. Si la línea no lo tiene (pedidos antiguos
                # o de un solo destino), cae al destino del pedido.
                "distrito_destino": getattr(item, "distrito_destino", None) or getattr(pedido, "distrito_destino", None),
                "barrio_destino": getattr(item, "barrio_destino", None) or getattr(pedido, "barrio_destino", None),
                "direccion_destino": getattr(item, "direccion_destino", None) or getattr(pedido, "direccion_destino", None),
                "servicio_completo": int(getattr(item, "cantidad_servida", 0) or 0)
                >= int(getattr(item, "cantidad", 0) or 0),
                "producto_nombre_cientifico": getattr(getattr(item, "producto", None), "nombre_cientifico", None),
                "producto_nombre_natural": getattr(getattr(item, "producto", None), "nombre_natural", None),
                "producto_nombre": (
                    getattr(getattr(item, "producto", None), "nombre_cientifico", None)
                    or getattr(getattr(item, "producto", None), "nombre_natural", None)
                ),
                "movimientos_servicio": [
                    {
                        "movimiento_id": getattr(mov, "id", None),
                        "fecha_movimiento": getattr(mov, "fecha_movimiento", None),
                        "fecha_caducidad": getattr(mov, "fecha_caducidad", None),
                        "cantidad": getattr(mov, "cantidad", 0),
                        "origen_tipo": getattr(mov, "origen_tipo", None),
                        "destino_tipo": getattr(mov, "destino_tipo", None),
                        "zona_origen": getattr(mov, "zona_origen", None),
                        "tamano_origen": getattr(mov, "tamano_origen", None),
                        "zona_destino": getattr(mov, "zona_destino", None),
                        "tamano_destino": getattr(mov, "tamano_destino", None),
                        "distrito_destino": getattr(mov, "distrito_destino", None),
                        "barrio_destino": getattr(mov, "barrio_destino", None),
                        "direccion_destino": getattr(mov, "direccion_destino", None),
                        "uuid_lote": getattr(mov, "uuid_lote", None),
                        "created_by": getattr(mov, "created_by", None),
                    }
                    for mov in sorted(
                        safeArray(getattr(item, "movimientos", [])),
                        key=lambda x: getattr(x, "fecha_movimiento", datetime.min),
                        reverse=True,
                    )
                ],
            }
            for item in items
        ],
        # Non-fatal advisories collected during the current request.
        # Frontend reads this and surfaces a soft toast.  Defaults to None
        # so listing endpoints (where we don't track warnings) stay clean.
        "email_warnings": list(warnings) if warnings else None,
    }



# =============================
# HEALTH
# =============================
@app.get("/")
def root():
    return {"status": "ok"}


@app.get("/ping")
def ping():
    return {"message": "pong"}


# =============================
# AUTH
# =============================


@app.get("/auth/me")
def auth_me(
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Nombre del ayuntamiento del usuario (si tiene). El admin global no tiene.
    cliente_nombre = None
    if current_user.cliente_id is not None:
        c = (
            db.query(Cliente)
            .filter(Cliente.id == current_user.cliente_id)
            .execution_options(skip_tenant=True)
            .first()
        )
        cliente_nombre = c.nombre if c else None
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "rol": current_user.rol,
        "status": current_user.status,
        "cliente_id": current_user.cliente_id,
        "cliente_nombre": cliente_nombre,
        # es_superadmin: dueño global de la plataforma. Mantenemos es_admin_global
        # como alias por compatibilidad (mismo significado).
        "es_superadmin": (current_user.rol or "").strip().lower() == ROL_ADMIN_GLOBAL,
        "es_admin_global": (current_user.rol or "").strip().lower() == ROL_ADMIN_GLOBAL,
    }


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


@app.post("/auth/change-password")
def auth_change_password(
    payload: ChangePasswordIn,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Cambio de contraseña self-service: el propio usuario logueado indica su
    contraseña actual y la nueva. No depende del correo."""
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="La contraseña actual no es correcta.")
    new_pwd = _validate_password_or_400(payload.new_password)  # mínimo 8 caracteres
    if verify_password(new_pwd, current_user.password_hash):
        raise HTTPException(status_code=400, detail="La nueva contraseña debe ser distinta de la actual.")
    current_user.password_hash = pwd_context.hash(new_pwd)
    # Cambiar la contraseña también resetea el contador de intentos fallidos.
    current_user.failed_login_attempts = 0
    db.add(current_user)
    db.commit()
    return {"ok": True}


# =============================
# CLIENTES (AYUNTAMIENTOS / ENTIDADES)
# =============================
def _cliente_to_dict(c: Cliente, with_mapa: bool = False) -> dict:
    out = {
        "id": c.id,
        "nombre": c.nombre,
        "slug": c.slug,
        "activo": c.activo,
        "cif": c.cif,
        "direccion": c.direccion,
        "email_contacto": c.email_contacto,
        "telefono": c.telefono,
        "tiene_mapa": c.mapa_imagen is not None,
        "mapa_updated_at": c.mapa_updated_at.isoformat() if c.mapa_updated_at else None,
        # Cuota propia del ayuntamiento (NULL = usa la de la plataforma).
        "cuota_mensual": float(c.cuota_mensual) if c.cuota_mensual is not None else None,
    }
    return out


class ClienteIn(BaseModel):
    nombre: str
    slug: str
    cif: Optional[str] = None
    direccion: Optional[str] = None
    email_contacto: Optional[str] = None
    telefono: Optional[str] = None
    activo: Optional[bool] = True


class ClienteUpdate(BaseModel):
    nombre: Optional[str] = None
    slug: Optional[str] = None
    cif: Optional[str] = None
    direccion: Optional[str] = None
    email_contacto: Optional[str] = None
    telefono: Optional[str] = None
    activo: Optional[bool] = None
    # Cuota mensual propia (EUR). Envía null para volver a la cuota por defecto.
    # Se distingue "no tocar" de "poner a null" con el flag interno de abajo.
    cuota_mensual: Optional[float] = None
    # Si True, aplica el valor de cuota_mensual (incluido null = quitar descuento).
    set_cuota: Optional[bool] = None


@app.get("/clientes")
def list_clientes(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Lista de ayuntamientos. El super-admin global los ve todos (para el
    selector); cualquier otro rol solo ve el suyo. `Cliente` no está en los
    modelos con auto-filtro, así que aquí se acota a mano."""
    rol = (current_user.rol or "").strip().lower()
    q = db.query(Cliente).order_by(Cliente.id.asc())
    if rol != ROL_ADMIN_GLOBAL:
        if current_user.cliente_id is None:
            return []
        q = q.filter(Cliente.id == current_user.cliente_id)
    return [_cliente_to_dict(c) for c in q.all()]


@app.post("/clientes", status_code=201)
def create_cliente(
    payload: ClienteIn,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_global_admin()),
):
    """Alta de un ayuntamiento nuevo en la plataforma. Solo el admin global."""
    slug = (payload.slug or "").strip().lower()
    nombre = (payload.nombre or "").strip()
    if not slug or not nombre:
        raise HTTPException(status_code=400, detail="Nombre y slug son obligatorios")
    existe = db.query(Cliente).filter(func.lower(Cliente.slug) == slug).first()
    if existe:
        raise HTTPException(status_code=409, detail="Ya existe un ayuntamiento con ese slug")
    c = Cliente(
        nombre=nombre,
        slug=slug,
        cif=(payload.cif or None),
        direccion=(payload.direccion or None),
        email_contacto=(payload.email_contacto or None),
        telefono=(payload.telefono or None),
        activo=bool(payload.activo) if payload.activo is not None else True,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _cliente_to_dict(c)


@app.patch("/clientes/{cliente_id}")
def update_cliente(
    cliente_id: int,
    payload: ClienteUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_global_admin()),
):
    """Edita un ayuntamiento. Solo el admin global."""
    c = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Ayuntamiento no encontrado")
    if payload.slug is not None:
        nuevo_slug = payload.slug.strip().lower()
        if nuevo_slug and nuevo_slug != c.slug:
            dup = db.query(Cliente).filter(func.lower(Cliente.slug) == nuevo_slug, Cliente.id != c.id).first()
            if dup:
                raise HTTPException(status_code=409, detail="Ya existe un ayuntamiento con ese slug")
            c.slug = nuevo_slug
    if payload.nombre is not None:
        c.nombre = payload.nombre.strip()
    if payload.cif is not None:
        c.cif = payload.cif or None
    if payload.direccion is not None:
        c.direccion = payload.direccion or None
    if payload.email_contacto is not None:
        c.email_contacto = payload.email_contacto or None
    if payload.telefono is not None:
        c.telefono = payload.telefono or None
    if payload.activo is not None:
        c.activo = bool(payload.activo)
    # Cuota propia: solo se toca si viene set_cuota=True. cuota_mensual=null con
    # set_cuota=True quita el descuento (vuelve a la cuota por defecto).
    if payload.set_cuota:
        if payload.cuota_mensual is None:
            c.cuota_mensual = None
        else:
            if payload.cuota_mensual < 0:
                raise HTTPException(status_code=400, detail="La cuota no puede ser negativa.")
            c.cuota_mensual = payload.cuota_mensual
    db.add(c)
    db.commit()
    db.refresh(c)
    return _cliente_to_dict(c)


# =============================
# MAPA DEL VIVERO (imagen por ayuntamiento, guardada en la BD)
# =============================
def _resolve_active_cliente_id(current_user: Usuario, db: Session) -> Optional[int]:
    """cliente_id efectivo de la petición: el propio del usuario, o el que el
    admin global haya seleccionado con X-Cliente-Id (ya fijado en la Session)."""
    rol = (current_user.rol or "").strip().lower()
    if rol == ROL_ADMIN_GLOBAL:
        return tenant.get_session_cliente(db)
    return current_user.cliente_id


@app.get("/mapa-imagen")
def get_mapa_imagen(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Devuelve la imagen del mapa del vivero del ayuntamiento activo."""
    cid = _resolve_active_cliente_id(current_user, db)
    if cid is None:
        raise HTTPException(status_code=400, detail="No hay ayuntamiento seleccionado")
    c = db.query(Cliente).filter(Cliente.id == cid).first()
    if not c or not c.mapa_imagen:
        raise HTTPException(status_code=404, detail="Este vivero aún no tiene mapa")
    return Response(content=bytes(c.mapa_imagen), media_type=c.mapa_mimetype or "image/png")


_MAPA_MIMETYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"}
_MAPA_MAX_BYTES = 8 * 1024 * 1024  # 8 MB


@app.post("/mapa-imagen")
async def upload_mapa_imagen(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin", "manager"])),
):
    """Sube/reemplaza la imagen del mapa del vivero del ayuntamiento activo.
    Disponible para admin_vivero (hereda de 'admin'), admin global y manager."""
    cid = _resolve_active_cliente_id(current_user, db)
    if cid is None:
        raise HTTPException(status_code=400, detail="No hay ayuntamiento seleccionado")

    mimetype = (file.content_type or "").lower()
    if mimetype not in _MAPA_MIMETYPES:
        raise HTTPException(status_code=400, detail="Formato no válido. Usa PNG, JPG, WEBP o GIF.")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="El fichero está vacío")
    if len(data) > _MAPA_MAX_BYTES:
        raise HTTPException(status_code=400, detail="La imagen supera el tamaño máximo (8 MB)")

    c = db.query(Cliente).filter(Cliente.id == cid).first()
    if not c:
        raise HTTPException(status_code=404, detail="Ayuntamiento no encontrado")
    c.mapa_imagen = data
    c.mapa_mimetype = mimetype
    c.mapa_updated_at = datetime.utcnow()
    db.add(c)
    db.commit()
    return {"ok": True, "mimetype": mimetype, "bytes": len(data)}


@app.delete("/mapa-imagen")
def delete_mapa_imagen(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin", "manager"])),
):
    """Elimina la imagen del mapa del vivero del ayuntamiento activo."""
    cid = _resolve_active_cliente_id(current_user, db)
    if cid is None:
        raise HTTPException(status_code=400, detail="No hay ayuntamiento seleccionado")
    c = db.query(Cliente).filter(Cliente.id == cid).first()
    if not c:
        raise HTTPException(status_code=404, detail="Ayuntamiento no encontrado")
    c.mapa_imagen = None
    c.mapa_mimetype = None
    c.mapa_updated_at = None
    db.add(c)
    db.commit()
    return {"ok": True}


# =============================
# SUPERADMIN — PLATAFORMA SaaS (enrollment + estadísticas)
# =============================
# Todo lo de este bloque es SOLO para el rol `superadmin` (dueño de la
# plataforma) y opera de forma GLOBAL (sobre todos los ayuntamientos), por lo
# que desactivamos el filtro por ayuntamiento con set_session_cliente(db, None).

class EnrollAyuntamientoIn(BaseModel):
    # Datos del ayuntamiento
    nombre: str
    slug: str
    cif: Optional[str] = None
    direccion: Optional[str] = None
    email_contacto: Optional[str] = None
    telefono: Optional[str] = None
    # Datos del administrador inicial de ese ayuntamiento
    admin_username: str
    admin_email: str
    # Rol del usuario inicial (admin del ayuntamiento por defecto)
    admin_rol: Optional[str] = "admin"


@app.post("/superadmin/enroll", status_code=201)
def superadmin_enroll(
    payload: EnrollAyuntamientoIn,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_global_admin()),
):
    """Alta (enrollment) de un ayuntamiento NUEVO y su administrador inicial en
    una sola operación. Solo el superadmin. El admin se crea en estado
    'pendiente' y recibe un email de invitación para fijar su contraseña."""
    set_session_cliente(db, None)  # operación global

    slug = (payload.slug or "").strip().lower()
    nombre = (payload.nombre or "").strip()
    admin_username = (payload.admin_username or "").strip()
    admin_email = _validate_email_or_400(payload.admin_email)
    admin_rol = (payload.admin_rol or "admin").strip().lower()

    if not slug or not nombre:
        raise HTTPException(status_code=400, detail="Nombre y slug del ayuntamiento son obligatorios")
    if len(admin_username) < 3:
        raise HTTPException(status_code=400, detail="El usuario admin debe tener al menos 3 caracteres")
    if admin_rol not in {"admin", "admin_vivero"}:
        raise HTTPException(status_code=400, detail="El rol del usuario inicial debe ser admin o admin_vivero")

    if db.query(Cliente).filter(func.lower(Cliente.slug) == slug).first():
        raise HTTPException(status_code=409, detail="Ya existe un ayuntamiento con ese slug")
    if db.query(Usuario).filter(func.lower(Usuario.username) == admin_username.lower()).first():
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese nombre")
    if db.query(Usuario).filter(func.lower(Usuario.email) == admin_email).first():
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese email")

    # 1) Ayuntamiento
    cliente = Cliente(
        nombre=nombre,
        slug=slug,
        cif=(payload.cif or None),
        direccion=(payload.direccion or None),
        email_contacto=(payload.email_contacto or None),
        telefono=(payload.telefono or None),
        activo=True,
    )
    db.add(cliente)
    db.flush()  # necesitamos cliente.id

    # 2) Administrador inicial del ayuntamiento (pendiente de activación)
    admin_user = Usuario(
        username=admin_username,
        email=admin_email,
        password_hash=pwd_context.hash(uuid.uuid4().hex),  # placeholder
        status="pendiente",
        rol=admin_rol,
        failed_login_attempts=0,
        cliente_id=cliente.id,
    )
    db.add(admin_user)
    db.flush()

    raw_token = account_tokens.issue_token(
        db, admin_user, "activate", created_by=current_user.username
    )
    db.commit()

    email_enviado = False
    try:
        email_service.send_invitation_email(
            to=admin_user.email, username=admin_user.username, token=raw_token
        )
        email_enviado = True
    except Exception as e:  # noqa: BLE001
        print(f"[superadmin_enroll] Email de invitación falló: {e}")

    db.refresh(cliente)
    db.refresh(admin_user)
    return {
        "ok": True,
        "cliente": _cliente_to_dict(cliente),
        "admin": {
            "id": admin_user.id,
            "username": admin_user.username,
            "email": admin_user.email,
            "rol": admin_user.rol,
            "status": admin_user.status,
        },
        "email_invitacion_enviado": email_enviado,
    }


# Cuota mensual por ayuntamiento activo (facturación). Configurable por entorno.
def _cuota_mensual_default() -> float:
    """Cuota mensual por defecto (misma para todos), configurable por entorno.
    Cada ayuntamiento puede tener su propia cuota (descuento) en
    Cliente.cuota_mensual; si es NULL se usa esta."""
    try:
        return float(_os.getenv("FACTURACION_CUOTA_MENSUAL", "199"))
    except (TypeError, ValueError):
        return 199.0


@app.get("/superadmin/stats")
def superadmin_stats(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_global_admin()),
):
    """Estadísticas globales de la plataforma para el superadmin: evolución de
    altas de ayuntamientos, métricas de uso por ayuntamiento y facturación."""
    set_session_cliente(db, None)  # agregamos sobre TODOS los ayuntamientos

    clientes = db.query(Cliente).order_by(Cliente.id.asc()).all()

    # --- Conteos por ayuntamiento (agrupados) ---
    def _counts_by_cliente(model):
        rows = (
            db.query(model.cliente_id, func.count())
            .group_by(model.cliente_id)
            .all()
        )
        return {cid: n for (cid, n) in rows}

    usuarios_por = _counts_by_cliente(Usuario)
    productos_por = _counts_by_cliente(Producto)
    pedidos_por = _counts_by_cliente(Pedido)
    movimientos_por = _counts_by_cliente(Movimiento)

    cuota_default = _cuota_mensual_default()
    activos = [c for c in clientes if c.activo]

    # Cuota efectiva de cada ayuntamiento: la suya propia si la tiene fijada
    # (descuento/precio especial), o la de la plataforma por defecto.
    def _cuota_de(c) -> float:
        return float(c.cuota_mensual) if c.cuota_mensual is not None else cuota_default

    ingreso_mensual = 0.0
    por_cliente = []
    for c in clientes:
        cuota_c = _cuota_de(c)
        if c.activo:
            ingreso_mensual += cuota_c
        por_cliente.append({
            "id": c.id,
            "nombre": c.nombre,
            "slug": c.slug,
            "activo": c.activo,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "usuarios": int(usuarios_por.get(c.id, 0)),
            "productos": int(productos_por.get(c.id, 0)),
            "pedidos": int(pedidos_por.get(c.id, 0)),
            "movimientos": int(movimientos_por.get(c.id, 0)),
            # cuota_mensual = la que se le factura (efectiva).
            "cuota_mensual": round(cuota_c, 2),
            # cuota_personalizada = True si tiene precio propio (descuento).
            "cuota_personalizada": c.cuota_mensual is not None,
        })
    ingreso_mensual = round(ingreso_mensual, 2)

    # --- Evolución de altas por mes (acumulado) ---
    por_mes: dict[str, int] = {}
    for c in clientes:
        if not c.created_at:
            continue
        key = c.created_at.strftime("%Y-%m")
        por_mes[key] = por_mes.get(key, 0) + 1
    evolucion = []
    acumulado = 0
    for mes in sorted(por_mes.keys()):
        altas = por_mes[mes]
        acumulado += altas
        evolucion.append({"mes": mes, "altas": altas, "acumulado": acumulado})

    return {
        "resumen": {
            "ayuntamientos_total": len(clientes),
            "ayuntamientos_activos": len(activos),
            "ayuntamientos_inactivos": len(clientes) - len(activos),
            "usuarios_total": int(sum(usuarios_por.values())),
            "productos_total": int(sum(productos_por.values())),
            "pedidos_total": int(sum(pedidos_por.values())),
            "movimientos_total": int(sum(movimientos_por.values())),
        },
        "facturacion": {
            "cuota_mensual_por_defecto": cuota_default,
            "ayuntamientos_facturables": len(activos),
            "ingreso_mensual_estimado": ingreso_mensual,
            "ingreso_anual_estimado": round(ingreso_mensual * 12, 2),
            "moneda": "EUR",
        },
        "evolucion_altas": evolucion,
        "por_cliente": por_cliente,
    }


# =============================
# PRODUCTOS
# =============================
@app.get("/productos")
def get_productos(
    db: Session = Depends(get_db),
    user: Usuario = Depends(require_roles(["admin", "manager", "tecnico", "empresa_externa", "gestor_vivero"])),
):
    """
    Listado de productos con stock agregado y lotes vivos.

    OPTIMIZADO (sin N+1):
      - 1 query para productos.
      - 1 query para TODOS los inventarios de esos productos.
      - 1 query con window function para TODAS las caducidades.
    Total: 3 queries independientemente del número de productos.
    """
    rol_user = (user.rol or "").strip().lower()
    today = datetime.utcnow().date()
    warning_limit = today + timedelta(days=7)

    # ---------- 1. Productos ----------
    productos_q = db.query(Producto)
    if rol_user == "empresa_externa":
        productos_q = productos_q.filter(
            or_(Producto.es_interno.is_(None), Producto.es_interno == False)
        )
    productos = productos_q.order_by(Producto.nombre_cientifico.asc()).all()

    if not productos:
        return []

    product_ids = [p.id for p in productos]

    # Reservas vigentes (stock comprometido por pedidos de salida vivos).
    reservas_map = _reservas_por_producto_tamano(db)

    # ---------- 2. Todos los inventarios en una sola query ----------
    inventarios_all = (
        db.query(InventarioLote)
        .filter(InventarioLote.producto_id.in_(product_ids))
        .all()
    )

    inv_by_product: dict[int, list[InventarioLote]] = {}
    for inv in inventarios_all:
        inv_by_product.setdefault(inv.producto_id, []).append(inv)

    # ---------- 3. Caducidad de cada (uuid_lote, producto, zona, tamano) en una sola query ----------
    # Usamos ROW_NUMBER() para quedarnos con el movimiento más reciente por combinación.
    from sqlalchemy import desc as _desc

    rn = (
        func.row_number()
        .over(
            partition_by=(
                MovimientoLoteDetalle.uuid_lote,
                MovimientoLoteDetalle.producto_id,
                MovimientoLoteDetalle.zona_destino,
                MovimientoLoteDetalle.tamano_destino,
            ),
            order_by=(_desc(Movimiento.fecha_movimiento), _desc(Movimiento.id)),
        )
        .label("rn")
    )

    sub = (
        db.query(
            MovimientoLoteDetalle.uuid_lote.label("uuid_lote"),
            MovimientoLoteDetalle.producto_id.label("producto_id"),
            MovimientoLoteDetalle.zona_destino.label("zona"),
            MovimientoLoteDetalle.tamano_destino.label("tamano"),
            Movimiento.fecha_caducidad.label("fecha_caducidad"),
            rn,
        )
        .join(Movimiento, Movimiento.id == MovimientoLoteDetalle.movimiento_id)
        .filter(Movimiento.fecha_caducidad.isnot(None))
        .filter(MovimientoLoteDetalle.producto_id.in_(product_ids))
        .subquery()
    )

    caducidad_rows = db.query(sub).filter(sub.c.rn == 1).all()

    cad_map: dict[tuple, date] = {
        (r.uuid_lote, r.producto_id, r.zona, r.tamano): r.fecha_caducidad
        for r in caducidad_rows
    }

    # ---------- 4. Construcción de la respuesta (todo en memoria, sin más DB) ----------
    out = []

    for p in productos:
        invs = inv_by_product.get(p.id, [])

        # Stock total: TODO el stock vivo del producto (sin filtrar por
        # fecha_disponibilidad). Si una entrada M35 marcó una fecha futura,
        # el stock se sigue contando aquí porque conceptualmente "está en el
        # vivero". La distinción de "disponible para servir AHORA" se aplica
        # en validaciones específicas de movimientos / pedidos, no en el
        # listado general.
        stock_total = 0
        stock_by_size: dict[str, int] = {}
        # Stock que AÚN NO está disponible por tener fecha de disponibilidad
        # futura (entradas M35 en maduración). Se cuenta como stock del vivero
        # (stock_by_size) pero NO como disponible para pedir/reservar.
        no_disp_by_size: dict[str, float] = {}
        for inv in invs:
            cantidad = float(inv.cantidad_disponible or 0)
            if cantidad <= 0:
                continue
            stock_total += cantidad
            tam = (inv.tamano or "").strip()
            if tam:
                stock_by_size[tam] = stock_by_size.get(tam, 0) + cantidad
                fdisp = getattr(inv, "fecha_disponibilidad", None)
                if fdisp is not None and fdisp > today:
                    no_disp_by_size[tam] = no_disp_by_size.get(tam, 0.0) + cantidad

        # Lotes vivos para mostrar caducidades: cantidad > 0 (sin filtrar por disponibilidad)
        lotes = []
        alertas_caducidad = []
        for inv in invs:
            cantidad = float(inv.cantidad_disponible or 0)
            if cantidad <= 0:
                continue
            fecha_cad = cad_map.get((inv.uuid_lote, p.id, inv.zona, inv.tamano))
            if not fecha_cad:
                continue

            if fecha_cad < today:
                estado = "caducado"
            elif fecha_cad <= warning_limit:
                estado = "proximo_a_caducar"
            else:
                estado = "vigente"

            lote_info = {
                "uuid_lote": inv.uuid_lote,
                "zona": inv.zona,
                "tamano": inv.tamano,
                "cantidad_disponible": cantidad,
                "fecha_caducidad": fecha_cad.isoformat(),
                "fecha_disponibilidad": inv.fecha_disponibilidad.isoformat() if inv.fecha_disponibilidad else None,
                "estado": estado,
            }

            lotes.append(lote_info)
            if fecha_cad <= warning_limit:
                alertas_caducidad.append(lote_info)

        # Disponible por tamaño = stock real − reservado − stock con fecha de
        # disponibilidad futura. Además se excluyen los tamaños que por reglas de
        # la planta NO cuentan como disponibles (semillero siempre; arbustos <M20;
        # árboles/palmeras <M35). Esos tamaños no se pueden pedir ni servir.
        reservado_total = 0.0
        no_disponible_total = 0.0
        disponible_by_size: dict[str, float] = {}
        for tam, qty in stock_by_size.items():
            if not _tamano_disponible_planta(p.categoria, p.subcategoria, tam):
                continue
            res = float(reservas_map.get((p.id, _norm_tam(tam)), 0.0))
            futuro = float(no_disp_by_size.get(tam, 0.0))
            reservado_total += min(res, qty)
            no_disponible_total += futuro
            disponible_by_size[tam] = max(qty - res - futuro, 0)
        disponible_total = sum(disponible_by_size.values())

        item = {
            "id": p.id,
            "nombre_cientifico": p.nombre_cientifico,
            "nombre_natural": p.nombre_natural,
            "nombre": p.nombre_natural or p.nombre_cientifico,
            "categoria": p.categoria,
            "subcategoria": p.subcategoria,
            "stock": stock_total,
            "stock_by_size": stock_by_size,
            "reservado": reservado_total,
            "no_disponible": no_disponible_total,
            "no_disponible_by_size": no_disp_by_size,
            "disponible": disponible_total,
            "disponible_by_size": disponible_by_size,
            "alertas_caducidad": alertas_caducidad,
            "lotes": lotes,
        }

        if rol_user != "empresa_externa":
            item["stock_minimo"] = p.stock_minimo
            item["es_interno"] = bool(getattr(p, "es_interno", False))
            _precio = getattr(p, "precio", None)
            item["precio"] = float(_precio) if _precio is not None else None

        out.append(item)

    return out


# =============================
# PRODUCTOS - ES_INTERNO
# =============================
class ProductoInternoUpdate(BaseModel):
    es_interno: bool


@app.patch("/productos/{producto_id}/es-interno")
def actualizar_producto_interno(
    producto_id: int,
    payload: ProductoInternoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin", "manager"])),
):
    producto = db.query(Producto).filter(Producto.id == producto_id).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    producto.es_interno = bool(payload.es_interno)
    db.commit()
    db.refresh(producto)

    return {
        "id": producto.id,
        "nombre_cientifico": producto.nombre_cientifico,
        "es_interno": bool(producto.es_interno),
    }


# =============================
# PRODUCTOS - CRUD
# =============================
class ProductoCreate(BaseModel):
    nombre_cientifico: str
    nombre_natural: Optional[str] = None
    categoria: str
    subcategoria: str
    stock_minimo: int = 0
    es_interno: bool = False
    precio: Optional[float] = None


class ProductoUpdate(BaseModel):
    nombre_cientifico: Optional[str] = None
    nombre_natural: Optional[str] = None
    categoria: Optional[str] = None
    subcategoria: Optional[str] = None
    stock_minimo: Optional[int] = None
    es_interno: Optional[bool] = None
    precio: Optional[float] = None


def _producto_dict(p: Producto) -> dict:
    precio = getattr(p, "precio", None)
    return {
        "id": p.id,
        "nombre_cientifico": p.nombre_cientifico,
        "nombre_natural": p.nombre_natural,
        "categoria": p.categoria,
        "subcategoria": p.subcategoria,
        "stock_minimo": int(p.stock_minimo or 0),
        "es_interno": bool(getattr(p, "es_interno", False)),
        "precio": float(precio) if precio is not None else None,
    }


@app.post("/productos")
def crear_producto(
    payload: ProductoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin", "manager", "tecnico"])),
):
    nombre_c = (payload.nombre_cientifico or "").strip()
    if not nombre_c:
        raise HTTPException(status_code=400, detail="El nombre científico es obligatorio")
    if not (payload.categoria or "").strip():
        raise HTTPException(status_code=400, detail="La categoría es obligatoria")
    if not (payload.subcategoria or "").strip():
        raise HTTPException(status_code=400, detail="La subcategoría es obligatoria")

    existente = db.query(Producto).filter(func.lower(Producto.nombre_cientifico) == nombre_c.lower()).first()
    if existente:
        raise HTTPException(status_code=409, detail=f"Ya existe un producto con nombre científico '{nombre_c}'")

    if payload.precio is not None and payload.precio < 0:
        raise HTTPException(status_code=400, detail="El precio no puede ser negativo")

    p = Producto(
        nombre_cientifico=nombre_c,
        nombre_natural=(payload.nombre_natural or "").strip() or None,
        categoria=payload.categoria.strip(),
        subcategoria=payload.subcategoria.strip(),
        stock_minimo=int(payload.stock_minimo or 0),
        es_interno=bool(payload.es_interno),
        precio=payload.precio,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return _producto_dict(p)


@app.put("/productos/{producto_id}")
def actualizar_producto(
    producto_id: int,
    payload: ProductoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin", "manager", "tecnico"])),
):
    producto = db.query(Producto).filter(Producto.id == producto_id).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    if payload.nombre_cientifico is not None:
        nc = payload.nombre_cientifico.strip()
        if not nc:
            raise HTTPException(status_code=400, detail="El nombre científico no puede estar vacío")
        duplicado = (
            db.query(Producto)
            .filter(func.lower(Producto.nombre_cientifico) == nc.lower(), Producto.id != producto_id)
            .first()
        )
        if duplicado:
            raise HTTPException(status_code=409, detail=f"Ya existe otro producto con nombre científico '{nc}'")
        producto.nombre_cientifico = nc

    if payload.nombre_natural is not None:
        producto.nombre_natural = payload.nombre_natural.strip() or None
    if payload.categoria is not None:
        nueva_cat = payload.categoria.strip()
        if not nueva_cat:
            raise HTTPException(status_code=400, detail="La categoría no puede estar vacía")
        producto.categoria = nueva_cat
    if payload.subcategoria is not None:
        nueva_sub = payload.subcategoria.strip()
        if not nueva_sub:
            raise HTTPException(status_code=400, detail="La subcategoría no puede estar vacía")
        producto.subcategoria = nueva_sub
    if payload.stock_minimo is not None:
        if payload.stock_minimo < 0:
            raise HTTPException(status_code=400, detail="El stock mínimo no puede ser negativo")
        producto.stock_minimo = int(payload.stock_minimo)
    if payload.es_interno is not None:
        producto.es_interno = bool(payload.es_interno)
    if payload.precio is not None:
        if payload.precio < 0:
            raise HTTPException(status_code=400, detail="El precio no puede ser negativo")
        producto.precio = payload.precio

    db.commit()
    db.refresh(producto)
    return _producto_dict(producto)


@app.delete("/productos/{producto_id}")
def eliminar_producto(
    producto_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin", "manager", "tecnico"])),
):
    producto = db.query(Producto).filter(Producto.id == producto_id).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    # No se puede eliminar si hay inventario vivo
    inv_con_stock = (
        db.query(InventarioLote)
        .filter(InventarioLote.producto_id == producto_id, InventarioLote.cantidad_disponible > 0)
        .count()
    )
    if inv_con_stock > 0:
        raise HTTPException(
            status_code=400,
            detail="No se puede eliminar: el producto tiene inventario vivo. Mueve o da de baja su stock primero.",
        )

    # Si tiene movimientos históricos, bloquear delete real y sugerir ocultar/inactivo
    mov_count = db.query(Movimiento).filter(Movimiento.producto_id == producto_id).count()
    ped_items_count = db.query(PedidoItem).filter(PedidoItem.producto_id == producto_id).count()
    if mov_count > 0 or ped_items_count > 0:
        raise HTTPException(
            status_code=400,
            detail="No se puede eliminar: el producto tiene historial de movimientos o pedidos. Márcalo como interno para ocultarlo a la empresa externa.",
        )

    db.delete(producto)
    db.commit()
    return {"ok": True, "id": producto_id}


# =============================
# PRODUCTOS - IMPORT CSV / EXCEL
# =============================
def _parse_bool(value) -> bool:
    if value is None:
        return False
    s = str(value).strip().lower()
    return s in ("true", "1", "yes", "si", "sí", "y", "t", "verdadero")


@app.post("/productos/import")
async def importar_productos(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin", "manager", "tecnico"])),
):
    try:
        import pandas as pd  # lazy import
    except ImportError:
        raise HTTPException(status_code=500, detail="pandas no está instalado en el backend")

    try:
        content = await file.read()
        name = (file.filename or "").lower()
        buf = io.BytesIO(content)
        if name.endswith(".csv"):
            df = pd.read_csv(buf)
        elif name.endswith((".xlsx", ".xls")):
            df = pd.read_excel(buf)
        else:
            # Intenta CSV por defecto
            df = pd.read_csv(buf)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"No se pudo leer el archivo: {e}")

    # Normaliza columnas (acepta varias variantes)
    alias = {
        "nombre_cientifico": ["nombre_cientifico", "nombre cientifico", "nombre científico", "cientifico"],
        "nombre_natural":    ["nombre_natural", "nombre natural", "nombre comun", "nombre común", "comun"],
        "categoria":         ["categoria", "categoría"],
        "subcategoria":      ["subcategoria", "subcategoría"],
        "stock_minimo":      ["stock_minimo", "stock mínimo", "stock minimo", "minimo"],
        "es_interno":        ["es_interno", "interno", "internal"],
    }

    cols_lower = {str(c).strip().lower(): c for c in df.columns}
    resolved = {}
    for canon, opts in alias.items():
        for o in opts:
            if o.lower() in cols_lower:
                resolved[canon] = cols_lower[o.lower()]
                break

    if "nombre_cientifico" not in resolved:
        raise HTTPException(status_code=400, detail="El archivo debe incluir la columna 'nombre_cientifico'")
    if "categoria" not in resolved:
        raise HTTPException(status_code=400, detail="El archivo debe incluir la columna 'categoria'")
    if "subcategoria" not in resolved:
        raise HTTPException(status_code=400, detail="El archivo debe incluir la columna 'subcategoria'")

    insertados = 0
    actualizados = 0
    saltados = 0
    errores = []

    for idx, row in df.iterrows():
        try:
            nc = str(row[resolved["nombre_cientifico"]]).strip()
            if not nc or nc.lower() == "nan":
                saltados += 1
                continue

            natural = None
            if "nombre_natural" in resolved:
                v = row[resolved["nombre_natural"]]
                if v is not None and str(v).strip().lower() != "nan":
                    natural = str(v).strip() or None

            cat = str(row[resolved["categoria"]]).strip()
            sub = str(row[resolved["subcategoria"]]).strip()
            if not cat or not sub or cat.lower() == "nan" or sub.lower() == "nan":
                errores.append(f"Fila {idx + 2}: categoría o subcategoría vacía")
                saltados += 1
                continue

            minimo = 0
            if "stock_minimo" in resolved:
                try:
                    v = row[resolved["stock_minimo"]]
                    minimo = int(float(v)) if v is not None and str(v).strip().lower() != "nan" else 0
                except (ValueError, TypeError):
                    minimo = 0
                if minimo < 0:
                    minimo = 0

            interno = False
            if "es_interno" in resolved:
                interno = _parse_bool(row[resolved["es_interno"]])

            existente = (
                db.query(Producto)
                .filter(func.lower(Producto.nombre_cientifico) == nc.lower())
                .first()
            )
            if existente:
                existente.nombre_natural = natural
                existente.categoria = cat
                existente.subcategoria = sub
                existente.stock_minimo = minimo
                existente.es_interno = interno
                actualizados += 1
            else:
                p = Producto(
                    nombre_cientifico=nc,
                    nombre_natural=natural,
                    categoria=cat,
                    subcategoria=sub,
                    stock_minimo=minimo,
                    es_interno=interno,
                )
                db.add(p)
                insertados += 1
        except Exception as e:
            errores.append(f"Fila {idx + 2}: {e}")
            saltados += 1

    db.commit()

    return {
        "ok": True,
        "insertados": insertados,
        "actualizados": actualizados,
        "saltados": saltados,
        "errores": errores[:50],  # no devolver listas enormes
    }


# =============================
# PEDIDOS
# =============================
@app.get("/pedidos")
def get_pedidos(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin", "manager", "tecnico", "empresa_externa", "gestor_vivero", "proveedor"])),
):
    # Transiciona pedidos vencidos y repara los que ya están totalmente
    # servidos pero quedaron colgados en APROBADO_PARCIAL, antes de listar.
    _transicionar_pedidos_caducados(db)
    _transicionar_pedidos_servidos(db)

    rol = (current_user.rol or "").strip().lower()
    # Eager-loading para evitar N+1: los items, su producto y sus movimientos se
    # cargan en pocas consultas en vez de una por cada item al serializar.
    q = db.query(Pedido).options(
        selectinload(Pedido.items).selectinload(PedidoItem.producto),
        selectinload(Pedido.items).selectinload(PedidoItem.movimientos),
    )

    # Empresa externa: ve dos tipos de pedidos.
    #   1) Sus propios pedidos (cualquier estado), independientemente del tipo.
    #   2) Pedidos de reposición que ya tengan items aprobados (APROBADO,
    #      APROBADO_PARCIAL o SERVIDO) — son los que puede empezar a servir.
    #      APROBADO_PARCIAL se incluye para no perder la esencia de la
    #      aprobación parcial: el proveedor puede servir los items ya
    #      aprobados aunque queden otros pendientes de decisión.
    if rol == "empresa_externa":
        q = q.filter(
            or_(
                # Caso 1: sus propios pedidos
                Pedido.solicitante_username == current_user.username,
                # Caso 2: reposiciones con items servibles
                and_(
                    func.lower(Pedido.tipo) == "reposicion",
                    func.upper(Pedido.estado).in_(SERVICEABLE_STATES),
                ),
            )
        )

    # Proveedor: rol estrictamente de consulta y servicio.  Solo ve los
    # pedidos de REPOSICIÓN con al menos un item aprobado o servido.
    # Nunca pedidos de salida, ni reposiciones aún sin aprobación.
    if rol == "proveedor":
        q = q.filter(
            and_(
                func.lower(Pedido.tipo) == "reposicion",
                func.upper(Pedido.estado).in_(SERVICEABLE_STATES),
            )
        )

    pedidos = q.order_by(Pedido.id.desc()).all()
    out = [_pedido_to_dict(p, viewer_role=rol) for p in pedidos]
    # For proveedor: after filtering items, drop pedidos that ended up with
    # zero visible lines (e.g. all approved items already SERVIDO and the
    # rest were denied — nothing left for them to act on or audit).
    if rol == "proveedor":
        out = [p for p in out if p.get("items")]
    return out


@app.post("/pedidos")
def create_pedido(
    payload: PedidoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin", "manager", "tecnico", "empresa_externa", "gestor_vivero"])),
):
    if not payload.items or len(payload.items) == 0:
        raise HTTPException(status_code=400, detail="Debes añadir al menos una línea al pedido")

    tipo_pedido = (payload.tipo or "salida").strip().lower()
    if tipo_pedido not in ("salida", "reposicion"):
        raise HTTPException(status_code=400, detail="Tipo de pedido inválido")

    # Permiso por rol para pedidos de reposición: solo personal interno del
    # vivero (admin, manager, técnico, gestor_vivero). Empresa externa NO
    # puede generar pedidos de reposición: ella los recibe y los sirve.
    user_role = (current_user.rol or "").strip().lower()
    if tipo_pedido == "reposicion" and user_role == "empresa_externa":
        raise HTTPException(
            status_code=403,
            detail="Las empresas externas no pueden crear pedidos de reposición.",
        )

    if tipo_pedido == "salida":
        if not payload.distrito_destino or not payload.barrio_destino or not payload.direccion_destino:
            raise HTTPException(status_code=400, detail="Debes indicar distrito, barrio y dirección de destino")

    # Transiciona pedidos vencidos para que su stock deje de contar como
    # reservado, y calcula las reservas vigentes una sola vez.
    if tipo_pedido == "salida":
        _transicionar_pedidos_caducados(db)
        reservas_map = _reservas_por_producto_tamano(db)
    else:
        reservas_map = {}
    solicitado_local: dict = {}

    for item in payload.items:
        if item.cantidad <= 0:
            raise HTTPException(status_code=400, detail="Todas las cantidades deben ser mayores que 0")

        if not item.tamano or not str(item.tamano).strip():
            raise HTTPException(status_code=400, detail="Cada línea del pedido debe incluir un tamaño")

        producto = db.query(Producto).filter(Producto.id == item.producto_id).first()
        if not producto:
            raise HTTPException(status_code=404, detail=f"Producto no encontrado: {item.producto_id}")

        if tipo_pedido == "salida":
            if not _tamano_disponible_planta(producto.categoria, producto.subcategoria, item.tamano):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"{producto.nombre_cientifico}: el tamaño {item.tamano} no está "
                        f"disponible para pedidos (semillero o tamaño insuficiente para su tipo)."
                    ),
                )
            stock_total = _stock_total_producto_tamano(db, item.producto_id, item.tamano)
            key = (int(item.producto_id), _norm_tam(item.tamano))
            reservado = float(reservas_map.get(key, 0.0))
            ya_pedido = float(solicitado_local.get(key, 0.0))
            disponible = stock_total - reservado - ya_pedido

            if item.cantidad > disponible:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Stock insuficiente para {producto.nombre_cientifico} "
                        f"en tamaño {item.tamano}. Disponible={disponible:g} "
                        f"(stock {stock_total:g} − {reservado:g} reservado por otros pedidos), "
                        f"solicitado={item.cantidad:g}"
                    ),
                )
            solicitado_local[key] = ya_pedido + float(item.cantidad)

    # Caducidad de pedido: TODOS los pedidos caducan a los 15 días (máximo)
    # desde su creación. Si nadie los gestiona/recoge en ese plazo, se liberan.
    fecha_cad_pedido = datetime.utcnow().date() + timedelta(days=15)

    pedido = Pedido(
        solicitante_username=current_user.username,
        estado="RESERVA",
        tipo=tipo_pedido,
        nota=payload.nota,
        distrito_destino=payload.distrito_destino if tipo_pedido == "salida" else None,
        barrio_destino=payload.barrio_destino if tipo_pedido == "salida" else None,
        direccion_destino=payload.direccion_destino if tipo_pedido == "salida" else None,
        fecha_caducidad=fecha_cad_pedido,
    )
    db.add(pedido)
    db.flush()

    for item in payload.items:
        # Destino efectivo de la línea: el propio de la línea (pedidos con
        # varios destinos) o, si no lo trae, el del pedido (un solo destino).
        if tipo_pedido == "salida":
            it_distrito = item.distrito_destino or payload.distrito_destino or None
            it_barrio = item.barrio_destino or payload.barrio_destino or None
            it_direccion = item.direccion_destino or payload.direccion_destino or None
        else:
            it_distrito = it_barrio = it_direccion = None
        db.add(
            PedidoItem(
                pedido_id=pedido.id,
                producto_id=item.producto_id,
                tamano=item.tamano,
                cantidad=item.cantidad,
                cantidad_servida=0,
                distrito_destino=it_distrito,
                barrio_destino=it_barrio,
                direccion_destino=it_direccion,
            )
        )

    db.commit()
    db.refresh(pedido)

    # Notify managers — they have a new pedido waiting for their decision.
    warnings = _notificar_pedido_creado(db, pedido)

    return _pedido_to_dict(pedido, warnings=warnings)


@app.put("/pedidos/{pedido_id}")
def update_pedido(
    pedido_id: int,
    payload: PedidoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin", "manager", "tecnico", "empresa_externa", "gestor_vivero"])),
):
    pedido = db.query(Pedido).filter(Pedido.id == pedido_id).first()
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    _asegurar_no_caducado(pedido, db)

    estado_normalizado = (pedido.estado or "").upper()
    if estado_normalizado != "RESERVA":
        raise HTTPException(status_code=400, detail="Solo se pueden editar pedidos en estado RESERVA")

    if not payload.items or len(payload.items) == 0:
        raise HTTPException(status_code=400, detail="Debes añadir al menos una línea al pedido")

    tipo_pedido = (getattr(pedido, "tipo", "salida") or "salida").strip().lower()

    if tipo_pedido == "salida":
        if not payload.distrito_destino or not payload.barrio_destino or not payload.direccion_destino:
            raise HTTPException(status_code=400, detail="Debes indicar distrito, barrio y dirección de destino")

    # Reservas vigentes EXCLUYENDO este pedido (sus propias líneas no cuentan
    # contra sí mismo al re-editarlo).
    if tipo_pedido == "salida":
        _transicionar_pedidos_caducados(db)
        reservas_map = _reservas_por_producto_tamano(db, exclude_pedido_id=pedido_id)
    else:
        reservas_map = {}
    solicitado_local: dict = {}

    for item in payload.items:
        if item.cantidad <= 0:
            raise HTTPException(status_code=400, detail="Todas las cantidades deben ser mayores que 0")

        if not item.tamano or not str(item.tamano).strip():
            raise HTTPException(status_code=400, detail="Cada línea del pedido debe incluir un tamaño")

        producto = db.query(Producto).filter(Producto.id == item.producto_id).first()
        if not producto:
            raise HTTPException(status_code=404, detail=f"Producto no encontrado: {item.producto_id}")

        if tipo_pedido == "salida":
            if not _tamano_disponible_planta(producto.categoria, producto.subcategoria, item.tamano):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"{producto.nombre_cientifico}: el tamaño {item.tamano} no está "
                        f"disponible para pedidos (semillero o tamaño insuficiente para su tipo)."
                    ),
                )
            stock_total = _stock_total_producto_tamano(db, item.producto_id, item.tamano)
            key = (int(item.producto_id), _norm_tam(item.tamano))
            reservado = float(reservas_map.get(key, 0.0))
            ya_pedido = float(solicitado_local.get(key, 0.0))
            disponible = stock_total - reservado - ya_pedido

            if item.cantidad > disponible:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Stock insuficiente para {producto.nombre_cientifico} "
                        f"en tamaño {item.tamano}. Disponible={disponible:g} "
                        f"(stock {stock_total:g} − {reservado:g} reservado por otros pedidos), "
                        f"solicitado={item.cantidad:g}"
                    ),
                )
            solicitado_local[key] = ya_pedido + float(item.cantidad)

    pedido.nota = payload.nota
    if tipo_pedido == "salida":
        pedido.distrito_destino = payload.distrito_destino
        pedido.barrio_destino = payload.barrio_destino
        pedido.direccion_destino = payload.direccion_destino

    for existing in list(pedido.items):
        db.delete(existing)

    db.flush()

    for item in payload.items:
        if tipo_pedido == "salida":
            it_distrito = item.distrito_destino or payload.distrito_destino or None
            it_barrio = item.barrio_destino or payload.barrio_destino or None
            it_direccion = item.direccion_destino or payload.direccion_destino or None
        else:
            it_distrito = it_barrio = it_direccion = None
        db.add(
            PedidoItem(
                pedido_id=pedido.id,
                producto_id=item.producto_id,
                tamano=item.tamano,
                cantidad=item.cantidad,
                cantidad_servida=0,
                distrito_destino=it_distrito,
                barrio_destino=it_barrio,
                direccion_destino=it_direccion,
            )
        )

    db.commit()
    db.refresh(pedido)
    return _pedido_to_dict(pedido)


@app.post("/pedidos/{pedido_id}/cancelar")
def cancelar_pedido_endpoint(
    pedido_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin", "manager", "tecnico", "empresa_externa", "gestor_vivero"])),
):
    pedido = db.query(Pedido).filter(Pedido.id == pedido_id).first()
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    _asegurar_no_caducado(pedido, db)

    estado = (pedido.estado or "").upper()
    if estado != "RESERVA":
        raise HTTPException(status_code=400, detail="Solo se pueden cancelar pedidos en estado RESERVA")

    pedido.estado = "CANCELADO"
    db.commit()
    db.refresh(pedido)
    return _pedido_to_dict(pedido)


def _select_items_for_action(pedido: Pedido, item_ids):
    """
    Resolve which items the action targets.
      - item_ids = None or [] → ALL items currently in RESERVA (legacy
        "approve / deny whole pedido" semantics).
      - item_ids = [..]       → only items whose id is in the list AND
        whose `estado_item` is still RESERVA (already-decided items are
        immutable and silently skipped — never overwritten).

    Returns the list of PedidoItem rows to mutate.  Raises 400 if the
    caller passed item_ids that don't belong to the pedido at all.
    """
    items = list(getattr(pedido, "items", []) or [])
    items_by_id = {it.id: it for it in items}

    if not item_ids:
        return [it for it in items if _item_estado(it) == "RESERVA"]

    bogus = [iid for iid in item_ids if iid not in items_by_id]
    if bogus:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Items {bogus} no pertenecen al pedido.",
        )

    return [items_by_id[iid] for iid in item_ids if _item_estado(items_by_id[iid]) == "RESERVA"]


@app.post("/pedidos/{pedido_id}/aprobar", response_model=PedidoOut)
def aprobar_pedido(
    pedido_id: int,
    payload: PedidoActionRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin", "manager"])),
):
    """
    Approve a pedido — fully or partially.

    Body:
      - No `item_ids` (or empty) → approves every still-RESERVA item.
      - `item_ids: [int, ...]`   → approves only those items; the rest
        stay in RESERVA so the manager can decide them later.

    The pedido's aggregate `estado` is recomputed from its items:
    while any item remains RESERVA the pedido stays RESERVA (so it
    keeps showing up in the approvals queue).
    """
    pedido = db.query(Pedido).filter(Pedido.id == pedido_id).first()

    if not pedido:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pedido no encontrado.",
        )

    _asegurar_no_caducado(pedido, db)

    if (pedido.estado or "").upper() not in DECIDABLE_STATES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se pueden aprobar items mientras el pedido tenga líneas en RESERVA.",
        )

    # Reposición pedidos: los aprueban manager o admin (el admin puede hacer de
    # todo). Salida pedidos: admin o manager vía require_roles de arriba.
    pedido_tipo = (pedido.tipo or "salida").strip().lower()
    user_role = (current_user.rol or "").strip().lower()
    if pedido_tipo == "reposicion" and user_role not in ("manager", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Solo un manager o un administrador puede aprobar pedidos de reposición.",
        )

    targets = _select_items_for_action(pedido, payload.item_ids)
    if not targets:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay items en RESERVA que aprobar en este pedido.",
        )

    now = datetime.utcnow()
    for item in targets:
        item.estado_item = "APROBADO"

    # Stamp the pedido's "approved by/at" the FIRST time any item is approved.
    if hasattr(pedido, "aprobado_por") and not getattr(pedido, "aprobado_por", None):
        pedido.aprobado_por = current_user.username
    if hasattr(pedido, "aprobado_at") and not getattr(pedido, "aprobado_at", None):
        pedido.aprobado_at = now
    if hasattr(pedido, "approved_by") and not getattr(pedido, "approved_by", None):
        pedido.approved_by = current_user.username
    if hasattr(pedido, "approved_at") and not getattr(pedido, "approved_at", None):
        pedido.approved_at = now

    recompute_pedido_estado(pedido)

    db.commit()
    db.refresh(pedido)

    # Notify solicitante + técnicos (+ proveedor for reposicion).
    _notificar_pedido_decidido(db, pedido)

    return _pedido_to_dict(pedido)


@app.post("/pedidos/{pedido_id}/denegar", response_model=PedidoOut)
def denegar_pedido(
    pedido_id: int,
    payload: PedidoActionRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin", "manager"])),
):
    """
    Deny a pedido — fully or partially.

    Mirrors /aprobar: pass `item_ids` to deny specific items, or omit
    it to deny every still-RESERVA item in the pedido.
    """
    pedido = db.query(Pedido).filter(Pedido.id == pedido_id).first()

    if not pedido:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pedido no encontrado.",
        )

    _asegurar_no_caducado(pedido, db)

    if (pedido.estado or "").upper() not in DECIDABLE_STATES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se pueden denegar items mientras el pedido tenga líneas en RESERVA.",
        )

    targets = _select_items_for_action(pedido, payload.item_ids)
    if not targets:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay items en RESERVA que denegar en este pedido.",
        )

    now = datetime.utcnow()
    for item in targets:
        item.estado_item = "DENEGADO"

    if hasattr(pedido, "denegado_por") and not getattr(pedido, "denegado_por", None):
        pedido.denegado_por = current_user.username
    if hasattr(pedido, "denegado_at") and not getattr(pedido, "denegado_at", None):
        pedido.denegado_at = now
    if hasattr(pedido, "motivo_denegacion") and payload.motivo:
        # Append rather than overwrite if there's already a previous reason.
        existing = getattr(pedido, "motivo_denegacion", None) or ""
        pedido.motivo_denegacion = (existing + "\n" + payload.motivo).strip() if existing else payload.motivo

    recompute_pedido_estado(pedido)

    db.commit()
    db.refresh(pedido)

    # Notify solicitante + técnicos (+ proveedor for reposicion).
    warnings = _notificar_pedido_decidido(db, pedido)

    return _pedido_to_dict(pedido, warnings=warnings)


@app.post("/pedidos/{pedido_id}/decidir", response_model=PedidoOut)
def decidir_pedido(
    pedido_id: int,
    payload: PedidoDecidirRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin", "manager"])),
):
    """
    Atomic per-item decision over a pedido.

    Business rule: when the manager opens a pedido to decide, they MUST
    take a decision on EVERY item still in RESERVA — there is no
    "leave-for-later" option.  The request body must therefore contain
    `approved_item_ids` and `denied_item_ids` whose union equals exactly
    the current set of RESERVA items in the pedido.

    After applying the decisions the pedido transitions in one shot to
    APROBADO (all approved), DENEGADO (all denied) or APROBADO_PARCIAL
    (mix).  No item is left in RESERVA.
    """
    pedido = db.query(Pedido).filter(Pedido.id == pedido_id).first()
    if not pedido:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pedido no encontrado.",
        )

    _asegurar_no_caducado(pedido, db)

    if (pedido.estado or "").upper() not in DECIDABLE_STATES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este pedido ya no admite decisiones (no hay items en RESERVA).",
        )

    # Reposición: la deciden manager o admin (coincide con /aprobar).
    pedido_tipo = (pedido.tipo or "salida").strip().lower()
    user_role  = (current_user.rol or "").strip().lower()
    if pedido_tipo == "reposicion" and user_role not in ("manager", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Solo un manager o un administrador puede decidir pedidos de reposición.",
        )

    items_by_id = {it.id: it for it in (pedido.items or [])}
    reserva_ids = {it.id for it in (pedido.items or []) if _item_estado(it) == "RESERVA"}

    approved = list(payload.approved_item_ids or [])
    denied   = list(payload.denied_item_ids   or [])

    # Validation 1: every referenced item must belong to the pedido.
    all_referenced = set(approved) | set(denied)
    bogus = [iid for iid in all_referenced if iid not in items_by_id]
    if bogus:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Items {bogus} no pertenecen al pedido.",
        )

    # Validation 2: no item in both lists.
    overlap = set(approved) & set(denied)
    if overlap:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Items {sorted(overlap)} aparecen simultáneamente como aprobados y denegados.",
        )

    # Validation 3: every still-RESERVA item must be covered.
    missing = reserva_ids - all_referenced
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Debes decidir sobre todos los items pendientes. "
                f"Te faltan: {sorted(missing)}."
            ),
        )

    # Validation 4: every referenced item must currently be RESERVA.
    # (Already-decided items are immutable; they can't be re-decided.)
    immutable = [iid for iid in all_referenced if iid not in reserva_ids]
    if immutable:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Items {immutable} ya tienen decisión previa y no pueden modificarse."
            ),
        )

    # Apply.
    now = datetime.utcnow()
    for iid in approved:
        items_by_id[iid].estado_item = "APROBADO"
    for iid in denied:
        items_by_id[iid].estado_item = "DENEGADO"

    # Stamp aprobado_por/at the first time any item gets approved.
    if approved:
        if hasattr(pedido, "aprobado_por") and not getattr(pedido, "aprobado_por", None):
            pedido.aprobado_por = current_user.username
        if hasattr(pedido, "aprobado_at") and not getattr(pedido, "aprobado_at", None):
            pedido.aprobado_at = now
        if hasattr(pedido, "approved_by") and not getattr(pedido, "approved_by", None):
            pedido.approved_by = current_user.username
        if hasattr(pedido, "approved_at") and not getattr(pedido, "approved_at", None):
            pedido.approved_at = now

    # Stamp denegado_por/at + motivo the first time any item gets denied.
    if denied:
        if hasattr(pedido, "denegado_por") and not getattr(pedido, "denegado_por", None):
            pedido.denegado_por = current_user.username
        if hasattr(pedido, "denegado_at") and not getattr(pedido, "denegado_at", None):
            pedido.denegado_at = now
        if hasattr(pedido, "motivo_denegacion") and payload.motivo_denegacion:
            existing = getattr(pedido, "motivo_denegacion", None) or ""
            pedido.motivo_denegacion = (existing + "\n" + payload.motivo_denegacion).strip() if existing else payload.motivo_denegacion

    recompute_pedido_estado(pedido)

    db.commit()
    db.refresh(pedido)

    # Notify solicitante + técnicos (+ proveedor for reposicion).
    warnings = _notificar_pedido_decidido(db, pedido)

    return _pedido_to_dict(pedido, warnings=warnings)


@app.get("/pedidos/{pedido_id}/pdf")
def descargar_pedido_pdf(
    pedido_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin", "manager", "tecnico", "gestor_vivero", "empresa_externa", "proveedor"])),
):
    """
    Devuelve el PDF imprimible del pedido.

    El PDF está disponible cuando hay **al menos un item APROBADO o SERVIDO**
    en el pedido, aunque su `estado` global siga siendo RESERVA por items
    todavía pendientes (escenario de aprobación parcial).  Esto permite al
    manager descargar el PDF de las líneas ya aprobadas sin esperar a que
    decida el resto.
    """
    pedido = (
        db.query(Pedido)
        .filter(Pedido.id == pedido_id)
        .first()
    )
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido no encontrado.")

    estado = (pedido.estado or "").upper()
    has_approved = _has_any_approved_item(pedido)

    # PDF gating: any state where a decision has already been recorded —
    # APROBADO / APROBADO_PARCIAL / SERVIDO (serviceable) plus DENEGADO
    # (so the requester / manager can audit motive + line detail).  We
    # only block pristine RESERVA where nothing is yet decided.
    PDF_VIEWABLE_STATES = SERVICEABLE_STATES + ("DENEGADO",)
    if estado not in PDF_VIEWABLE_STATES and not has_approved:
        raise HTTPException(
            status_code=400,
            detail="El PDF solo está disponible una vez tomada la decisión sobre el pedido.",
        )

    rol = (current_user.rol or "").strip().lower()

    # Empresa externa: only their own pedidos, or public reposiciones.
    if rol == "empresa_externa":
        tipo = (pedido.tipo or "").strip().lower()
        es_reposicion_publica = tipo == "reposicion" and (
            estado in SERVICEABLE_STATES or has_approved
        )
        es_propio = (pedido.solicitante_username or "") == (current_user.username or "")
        if not (es_reposicion_publica or es_propio):
            raise HTTPException(status_code=403, detail="No puedes descargar este pedido.")

    # Proveedor: only reposiciones with at least one approved/served item.
    # Additional belt-and-suspenders check: even if the pedido is in a
    # serviceable state, refuse if there are no APROBADO/SERVIDO items
    # (theoretical edge case after filtering).
    if rol == "proveedor":
        tipo = (pedido.tipo or "").strip().lower()
        has_servible_items = any(
            _item_estado(it) in ("APROBADO", "SERVIDO")
            for it in (pedido.items or [])
        )
        if not (tipo == "reposicion" and (estado in SERVICEABLE_STATES or has_approved) and has_servible_items):
            raise HTTPException(status_code=403, detail="No puedes descargar este pedido.")

    pdf_bytes = generar_pdf_pedido(pedido, viewer_role=rol)
    filename = f"pedido_{pedido.id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# =============================
# LOTES DISPONIBLES POR PRODUCTO
# =============================
@app.get("/lotes/disponibles/{producto_id}")
def get_lotes_disponibles(
    producto_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin", "manager", "tecnico", "empresa_externa", "gestor_vivero"])),
):
    rows = (
        db.query(InventarioLote, Lote)
        .join(Lote, Lote.uuid_lote == InventarioLote.uuid_lote)
        .filter(
            InventarioLote.producto_id == producto_id,
            InventarioLote.cantidad_disponible > 0,
        )
        .filter(_disponible_filter())
        .order_by(Lote.id.asc(), InventarioLote.id.asc())
        .all()
    )

    return [
        {
            "uuid_lote": lote.uuid_lote,
            "zona": inv.zona,
            "tamano": inv.tamano,
            "cantidad_disponible": inv.cantidad_disponible,
        }
        for inv, lote in rows
    ]


# =============================
# CREAR MOVIMIENTO
# =============================
@app.post("/movimientos", response_model=MovimientoOut)
def crear_movimiento(
    payload: MovimientoCreate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(require_roles(["admin", "manager", "tecnico", "gestor_vivero"])),
):
    if payload.cantidad <= 0:
        raise HTTPException(status_code=400, detail="La cantidad debe ser mayor que 0")

    producto = db.query(Producto).filter(Producto.id == payload.producto_id).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    origen = _norm_str(payload.origen_tipo)
    destino = _norm_str(payload.destino_tipo)
    tipo = _tipo_movimiento(payload.origen_tipo, payload.destino_tipo)

    pedido = None
    pedido_item = None

    if payload.pedido_id is not None:
        pedido = db.query(Pedido).filter(Pedido.id == payload.pedido_id).first()
        if not pedido:
            raise HTTPException(status_code=404, detail="Pedido no encontrado")

        _asegurar_no_caducado(pedido, db)

        # Se admite asociar movimientos a pedidos que ya tienen líneas aprobadas
        # (APROBADO o APROBADO_PARCIAL). El control real de no exceder lo pedido
        # se hace por línea (cantidad_servida vs cantidad) más abajo.
        if (pedido.estado or "").upper() not in ("APROBADO", "APROBADO_PARCIAL"):
            raise HTTPException(
                status_code=400,
                detail="Solo se puede asociar el movimiento a pedidos aprobados",
            )

        if payload.pedido_item_id is None:
            raise HTTPException(
                status_code=400,
                detail="Debes indicar la línea del pedido (pedido_item_id).",
            )

        pedido_item = (
            db.query(PedidoItem)
            .filter(
                PedidoItem.id == payload.pedido_item_id,
                PedidoItem.pedido_id == pedido.id,
            )
            .first()
        )

        if not pedido_item:
            raise HTTPException(status_code=404, detail="Línea de pedido no encontrada")

        if int(pedido_item.producto_id) != int(payload.producto_id):
            raise HTTPException(
                status_code=400,
                detail="El producto del movimiento no coincide con la línea del pedido",
            )

        pedido_tipo = (getattr(pedido, "tipo", "salida") or "salida").strip().lower()
        tamano_comparar = (
            payload.tamano_destino if pedido_tipo == "reposicion" else payload.tamano_origen
        )
        if (pedido_item.tamano or "") != (tamano_comparar or ""):
            raise HTTPException(
                status_code=400,
                detail="El tamaño del movimiento no coincide con el tamaño de la línea del pedido",
            )

        pendiente = float(pedido_item.cantidad or 0) - float(pedido_item.cantidad_servida or 0)
        if payload.cantidad > pendiente:
            raise HTTPException(
                status_code=400,
                detail=f"La cantidad supera la pendiente de servir de la línea del pedido. Pendiente={pendiente}",
            )

    es_traslado_interno = origen == "vivero" and destino == "vivero"

    # Regla de disponibilidad por tamaño: no se puede SACAR del vivero (salida a
    # destino externo) plantas en tamaño no disponible (semillero, o menor al
    # mínimo de su tipo). Entradas y traslados internos SÍ admiten cualquier
    # tamaño (registrar semilleros, reubicar, trasplantar…).
    if origen == "vivero" and not es_traslado_interno:
        if not _tamano_disponible_planta(
            getattr(producto, "categoria", None),
            getattr(producto, "subcategoria", None),
            payload.tamano_origen,
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"El tamaño {payload.tamano_origen} no está disponible para salidas de "
                    f"{getattr(producto, 'nombre_cientifico', 'este producto')} "
                    f"(semillero o tamaño insuficiente para su tipo)."
                ),
            )

    if origen == "vivero":
        # La fecha de disponibilidad (M35) NO debe impedir sacar/mover stock que
        # ya existe físicamente en la zona: solo condiciona el "disponible" que
        # se muestra para reservas y nuevos pedidos. Al registrar cualquier
        # movimiento con origen vivero (salida, traslado o servir un pedido)
        # contamos TODO el stock físico de esa zona/tamaño
        # (include_no_disponibles=True), igual que muestra el frontend. Antes se
        # excluía el stock con fecha de disponibilidad futura y eso impedía
        # servir un pedido de M35 aunque hubiera stock de sobra.
        disponible = _stock_en_zona_tamano(
            db,
            payload.producto_id,
            payload.zona_origen,
            payload.tamano_origen,
            include_no_disponibles=True,
        )
        if payload.cantidad > disponible:
            raise HTTPException(
                status_code=400,
                detail=f"Stock insuficiente en zona/tamaño. Disponible={disponible}, solicitado={payload.cantidad}",
            )

    # Fecha del movimiento: la indicada por el usuario (registro a posteriori) o
    # el momento actual. No se admiten fechas futuras.
    fecha_base_movimiento = payload.fecha_movimiento or datetime.utcnow()
    if isinstance(fecha_base_movimiento, datetime) and fecha_base_movimiento.tzinfo is not None:
        fecha_base_movimiento = fecha_base_movimiento.replace(tzinfo=None)
    if fecha_base_movimiento > datetime.utcnow() + timedelta(minutes=5):
        raise HTTPException(status_code=400, detail="No se puede registrar un movimiento con fecha futura")
    tamano_aplicable_caducidad = _tamano_aplicable_para_caducidad(payload)
    fecha_caducidad, dias_caducidad_aplicados = _calcular_fecha_caducidad(
        db=db,
        producto=producto,
        tamano=tamano_aplicable_caducidad,
        fecha_base=fecha_base_movimiento,
    )

    fecha_disp = payload.fecha_disponibilidad
    if fecha_disp is not None:
        if destino != "vivero":
            raise HTTPException(status_code=400, detail="La fecha de disponibilidad solo aplica a movimientos con destino Vivero")
        if (payload.tamano_destino or "").strip().upper() != "M35":
            raise HTTPException(status_code=400, detail="La fecha de disponibilidad solo aplica al tamaño M35")
        hoy = fecha_base_movimiento.date()
        if fecha_disp <= hoy:
            raise HTTPException(status_code=400, detail="La fecha de disponibilidad debe ser futura")
        if fecha_caducidad is not None and fecha_disp > fecha_caducidad:
            raise HTTPException(status_code=400, detail="La fecha de disponibilidad no puede ser posterior a la fecha de caducidad")

    # Destino del movimiento: al servir una línea de un pedido de SALIDA, el
    # destino lo manda la propia LÍNEA del pedido (pedidos repartidos en varios
    # destinos), con fallback al destino del pedido y luego al del payload. Así,
    # al servir un pedido con varios destinos, cada línea genera un movimiento
    # con su destino correcto.
    mov_distrito = payload.distrito_destino
    mov_barrio = payload.barrio_destino
    mov_direccion = payload.direccion_destino
    if (
        pedido is not None
        and pedido_item is not None
        and (getattr(pedido, "tipo", "salida") or "salida").strip().lower() == "salida"
    ):
        mov_distrito = getattr(pedido_item, "distrito_destino", None) or getattr(pedido, "distrito_destino", None) or mov_distrito
        mov_barrio = getattr(pedido_item, "barrio_destino", None) or getattr(pedido, "barrio_destino", None) or mov_barrio
        mov_direccion = getattr(pedido_item, "direccion_destino", None) or getattr(pedido, "direccion_destino", None) or mov_direccion

    movimiento = Movimiento(
        pedido_id=payload.pedido_id,
        pedido_item_id=payload.pedido_item_id,
        uuid_lote=payload.uuid_lote.strip() if payload.uuid_lote else None,
        producto_id=payload.producto_id,
        tipo_movimiento=tipo,
        origen_tipo=payload.origen_tipo,
        destino_tipo=payload.destino_tipo,
        zona_origen=payload.zona_origen,
        zona_destino=payload.zona_destino,
        tamano_origen=payload.tamano_origen,
        tamano_destino=payload.tamano_destino,
        cantidad=payload.cantidad,
        distrito_destino=mov_distrito,
        barrio_destino=mov_barrio,
        direccion_destino=mov_direccion,
        cp_destino=payload.cp_destino,

        # 🔥 NUEVO
        observaciones=payload.observaciones or payload.nota,
        es_prestamo=payload.es_prestamo,
        es_devolucion=payload.es_devolucion,
        prestamo_referencia_id=payload.prestamo_referencia_id,

        fecha_movimiento=fecha_base_movimiento,
        fecha_caducidad=fecha_caducidad,
        dias_caducidad_aplicados=dias_caducidad_aplicados,
        fecha_disponibilidad=fecha_disp,
        created_by=user.username,
    )

    db.add(movimiento)
    db.flush()

    uuids_asociados = []

    if origen != "vivero" and destino == "vivero":
        nuevo_uuid = str(uuid.uuid4())
        uuids_asociados.append(nuevo_uuid)

        lote = Lote(
            uuid_lote=nuevo_uuid,
            producto_id=payload.producto_id,
            cantidad_inicial=payload.cantidad,
            tamano_inicial=payload.tamano_destino,
            origen_tipo=payload.origen_tipo,
            origen_referencia=None,
            zona_inicial=payload.zona_destino,
            created_by=user.username,
        )
        db.add(lote)

        inventario = InventarioLote(
            uuid_lote=nuevo_uuid,
            producto_id=payload.producto_id,
            zona=payload.zona_destino,
            tamano=payload.tamano_destino,
            cantidad_disponible=payload.cantidad,
            fecha_disponibilidad=fecha_disp,
        )
        db.add(inventario)

        detalle = MovimientoLoteDetalle(
            movimiento_id=movimiento.id,
            uuid_lote=nuevo_uuid,
            producto_id=payload.producto_id,
            zona_origen=None,
            zona_destino=payload.zona_destino,
            tamano_origen=None,
            tamano_destino=payload.tamano_destino,
            cantidad=payload.cantidad,
        )
        db.add(detalle)

    elif origen == "vivero":
        restante = payload.cantidad

        # Buscamos los lotes a consumir comparando zona/tamaño NORMALIZADOS
        # (mismo criterio que _stock_en_zona_tamano), no con `==` exacto.
        # Consumimos el stock físico existente de la zona/tamaño con o sin fecha
        # de disponibilidad futura (misma razón que en la validación de arriba):
        # el stock M35 con fecha futura sigue siendo stock real que se puede
        # sacar/servir. Antes se filtraba _disponible_filter() en las salidas y
        # eso dejaba `restante > 0` → "Stock insuficiente" aunque hubiera stock.
        inventarios_q = (
            db.query(InventarioLote)
            .filter(
                InventarioLote.producto_id == payload.producto_id,
                InventarioLote.cantidad_disponible > 0,
            )
        )
        candidatos = inventarios_q.order_by(InventarioLote.id.asc()).all()
        _zn = _normalize_zona_id(payload.zona_origen or "")
        _tn = _norm_tam(payload.tamano_origen or "")
        inventarios = [
            inv for inv in candidatos
            if _normalize_zona_id(getattr(inv, "zona", None) or "") == _zn
            and _norm_tam(getattr(inv, "tamano", None) or "") == _tn
        ]

        if payload.uuid_lote:
            inventarios = [inv for inv in inventarios if (inv.uuid_lote or "").strip() == payload.uuid_lote.strip()]
            if not inventarios:
                raise HTTPException(
                    status_code=400,
                    detail="No hay stock disponible para ese UUID en la zona y tamaño seleccionados",
                )

        if not inventarios:
            raise HTTPException(status_code=400, detail="No hay stock disponible en esa zona y tamaño")

        for inv in inventarios:
            if restante <= 0:
                break

            # Importante: cantidad_disponible es NUMERIC(12, 3) en BD, por
            # lo que SQLAlchemy lo devuelve como Decimal. No podemos mezclar
            # Decimal con float en operaciones aritméticas (-=, +=) sin
            # provocar TypeError. Trabajamos siempre en float y reasignamos
            # con =, dejando que SQLAlchemy convierta a Decimal al persistir.
            disponible_inv = float(inv.cantidad_disponible or 0)
            usar = min(disponible_inv, restante)
            if usar <= 0:
                continue

            inv.cantidad_disponible = disponible_inv - usar
            uuids_asociados.append(inv.uuid_lote)

            if destino == "vivero":
                destino_inv = (
                    db.query(InventarioLote)
                    .filter(
                        InventarioLote.uuid_lote == inv.uuid_lote,
                        InventarioLote.producto_id == payload.producto_id,
                        InventarioLote.zona == payload.zona_destino,
                        InventarioLote.tamano == payload.tamano_destino,
                    )
                    .first()
                )

                fecha_disp_efectiva = fecha_disp if fecha_disp is not None else getattr(inv, "fecha_disponibilidad", None)

                if destino_inv:
                    destino_inv.cantidad_disponible = float(destino_inv.cantidad_disponible or 0) + usar
                    if fecha_disp_efectiva is not None:
                        destino_inv.fecha_disponibilidad = fecha_disp_efectiva
                else:
                    db.add(
                        InventarioLote(
                            uuid_lote=inv.uuid_lote,
                            producto_id=payload.producto_id,
                            zona=payload.zona_destino,
                            tamano=payload.tamano_destino,
                            cantidad_disponible=usar,
                            fecha_disponibilidad=fecha_disp_efectiva,
                        )
                    )

            db.add(
                MovimientoLoteDetalle(
                    movimiento_id=movimiento.id,
                    uuid_lote=inv.uuid_lote,
                    producto_id=payload.producto_id,
                    zona_origen=payload.zona_origen,
                    zona_destino=payload.zona_destino,
                    tamano_origen=payload.tamano_origen,
                    tamano_destino=payload.tamano_destino,
                    cantidad=usar,
                )
            )

            restante -= usar

        if restante > 0:
            raise HTTPException(status_code=400, detail="Stock insuficiente para completar el movimiento")

    movimiento.uuid_lote = _join_uuid_lotes(uuids_asociados) or movimiento.uuid_lote

    pedido_tipo = (getattr(pedido, "tipo", "salida") or "salida").strip().lower() if pedido else "salida"
    es_servicio_pedido = (
        pedido
        and pedido_item
        and (
            (pedido_tipo == "salida" and origen == "vivero" and destino != "vivero")
            or (pedido_tipo == "reposicion" and origen != "vivero" and destino == "vivero")
        )
    )

    if es_servicio_pedido:
        pedido_item.cantidad_servida = float(pedido_item.cantidad_servida or 0) + float(payload.cantidad)

        if float(pedido_item.cantidad_servida or 0) > float(pedido_item.cantidad or 0):
            raise HTTPException(
                status_code=400,
                detail="La cantidad servida supera la cantidad pedida en la línea seleccionada",
            )

        # Un pedido queda SERVIDO cuando TODAS sus líneas aprobadas están
        # servidas por completo (las DENEGADO se excluyen; ver
        # _pedido_totalmente_servido). Mismo criterio que el barrido que repara
        # pedidos colgados en get_pedidos.
        if _pedido_totalmente_servido(pedido):
            pedido.estado = "SERVIDO"
            pedido.served_at = datetime.utcnow()
            pedido.served_by = user.username

    db.commit()
    db.refresh(movimiento)
    return movimiento


# =============================
# LISTAR MOVIMIENTOS
# =============================
@app.get("/movimientos")
def listar_movimientos(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin", "tecnico", "manager", "empresa_externa", "gestor_vivero"])),
):
    rows = (
        db.query(Movimiento, Producto)
        .join(Producto, Producto.id == Movimiento.producto_id)
        .order_by(Movimiento.id.desc())
        .all()
    )

    out = []
    for mov, prod in rows:
        out.append(
            {
                "id": mov.id,
                "pedido_id": getattr(mov, "pedido_id", None),
                "pedido_item_id": getattr(mov, "pedido_item_id", None),
                "producto_id": mov.producto_id,
                "tipo_movimiento": mov.tipo_movimiento,
                "producto_nombre_cientifico": prod.nombre_cientifico,
                "producto_nombre_natural": prod.nombre_natural,
                "producto_categoria": prod.categoria,
                "producto_subcategoria": prod.subcategoria,
                "cantidad": mov.cantidad,
                "origen_tipo": mov.origen_tipo,
                "destino_tipo": mov.destino_tipo,
                "zona_origen": mov.zona_origen,
                "zona_destino": mov.zona_destino,
                "tamano_origen": mov.tamano_origen,
                "tamano_destino": mov.tamano_destino,
                "fecha_movimiento": mov.fecha_movimiento,
                "fecha_disponibilidad": getattr(mov, "fecha_disponibilidad", None),
                "fecha_caducidad": getattr(mov, "fecha_caducidad", None),
                "dias_caducidad_aplicados": getattr(mov, "dias_caducidad_aplicados", None),
                "distrito_destino": mov.distrito_destino,
                "barrio_destino": mov.barrio_destino,
                "direccion_destino": mov.direccion_destino,
                "cp_destino": mov.cp_destino,
                "observaciones": mov.observaciones,
                "es_prestamo": mov.es_prestamo,
                "es_devolucion": mov.es_devolucion,
                "created_by": getattr(mov, "created_by", None),
                "uuid_lote": getattr(mov, "uuid_lote", None),
                "observaciones": getattr(mov, "observaciones", None),
                "es_prestamo": getattr(mov, "es_prestamo", False),
                "es_devolucion": getattr(mov, "es_devolucion", False),
                "prestamo_referencia_id": getattr(mov, "prestamo_referencia_id", None),
                "devuelto": getattr(mov, "devuelto", False),
                "fecha_devolucion": getattr(mov, "fecha_devolucion", None),
            }
        )
    return out


# =============================
# TRAZABILIDAD POR UUID
# =============================
@app.get("/lotes/{uuid_lote}")
def get_lote(
    uuid_lote: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin", "tecnico", "manager", "empresa_externa", "gestor_vivero"])),
):
    lote = db.query(Lote).filter(Lote.uuid_lote == uuid_lote).first()

    if not lote:
        raise HTTPException(status_code=404, detail="Lote no encontrado")

    detalles = (
        db.query(MovimientoLoteDetalle, Movimiento)
        .join(Movimiento, Movimiento.id == MovimientoLoteDetalle.movimiento_id)
        .filter(MovimientoLoteDetalle.uuid_lote == uuid_lote)
        .order_by(Movimiento.fecha_movimiento.asc(), Movimiento.id.asc())
        .all()
    )

    inventario_actual = (
        db.query(InventarioLote)
        .filter(
            InventarioLote.uuid_lote == uuid_lote,
            InventarioLote.cantidad_disponible > 0,
        )
        .all()
    )

    return {
        "uuid_lote": lote.uuid_lote,
        "producto_id": lote.producto_id,
        "cantidad_inicial": lote.cantidad_inicial,
        "fecha_entrada": lote.fecha_entrada,
        "movimientos": [
            {
                "movimiento_id": mov.id,
                "cantidad": det.cantidad,
                "origen_tipo": mov.origen_tipo,
                "destino_tipo": mov.destino_tipo,
                "zona_origen": det.zona_origen,
                "zona_destino": det.zona_destino,
                "tamano_origen": det.tamano_origen,
                "tamano_destino": det.tamano_destino,
                "fecha_movimiento": mov.fecha_movimiento,
                "fecha_caducidad": getattr(mov, "fecha_caducidad", None),
            }
            for det, mov in detalles
        ],
        "inventario_actual": [
            {
                "zona": inv.zona,
                "tamano": inv.tamano,
                "cantidad_disponible": inv.cantidad_disponible,
            }
            for inv in inventario_actual
        ],
    }
    
    
 # =============================
# REPORTES - HELPERS
# =============================
def _fmt_ubicacion_externa(distrito, barrio, direccion):
    parts = [distrito, barrio, direccion]
    parts = [p for p in parts if p]
    return " · ".join(parts) if parts else "ubicación externa no especificada"


def _producto_display(prod: Producto | None, producto_id: int | None = None) -> str:
    if prod:
        return prod.nombre_cientifico or prod.nombre_natural or f"Producto #{prod.id}"
    if producto_id:
        return f"Producto #{producto_id}"
    return "Producto"


# =============================
# REPORTES - TRAZABILIDAD
# =============================
@app.get("/reportes/trazabilidad/{uuid_lote}")
def reporte_trazabilidad(
    uuid_lote: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin", "manager", "gestor_vivero"])),
):
    lote = (
        db.query(Lote)
        .join(Producto, Producto.id == Lote.producto_id)
        .filter(Lote.uuid_lote == uuid_lote)
        .first()
    )

    if not lote:
        raise HTTPException(status_code=404, detail="UUID no encontrado")

    producto = db.query(Producto).filter(Producto.id == lote.producto_id).first()

    detalles = (
        db.query(MovimientoLoteDetalle, Movimiento)
        .join(Movimiento, Movimiento.id == MovimientoLoteDetalle.movimiento_id)
        .filter(MovimientoLoteDetalle.uuid_lote == uuid_lote)
        .order_by(Movimiento.fecha_movimiento.asc(), Movimiento.id.asc())
        .all()
    )

    inventario_actual = (
        db.query(InventarioLote)
        .filter(
            InventarioLote.uuid_lote == uuid_lote,
            InventarioLote.cantidad_disponible > 0,
        )
        .order_by(InventarioLote.zona.asc(), InventarioLote.tamano.asc())
        .all()
    )

    movimientos_out = []

    for det, mov in detalles:
        origen = (mov.origen_tipo or "").strip().lower()
        destino = (mov.destino_tipo or "").strip().lower()
        cantidad = int(det.cantidad or 0)
        nombre_producto = _producto_display(producto, lote.producto_id)

        if origen != "vivero" and destino == "vivero":
            descripcion = (
                f"El {mov.fecha_movimiento.strftime('%d/%m/%Y')} entraron {cantidad} unidades de "
                f"{nombre_producto}, tamaño {det.tamano_destino or '—'}, en la zona {det.zona_destino or '—'}."
            )
        elif origen == "vivero" and destino == "vivero":
            descripcion = (
                f"El {mov.fecha_movimiento.strftime('%d/%m/%Y')}, {cantidad} unidades de "
                f"{nombre_producto} pasaron de la zona {det.zona_origen or '—'} "
                f"({det.tamano_origen or '—'}) a la zona {det.zona_destino or '—'} "
                f"({det.tamano_destino or '—'})."
            )
        elif origen == "vivero" and destino != "vivero":
            ubicacion = _fmt_ubicacion_externa(
                mov.distrito_destino,
                mov.barrio_destino,
                mov.direccion_destino,
            )
            descripcion = (
                f"El {mov.fecha_movimiento.strftime('%d/%m/%Y')}, {cantidad} unidades de "
                f"{nombre_producto} salieron del vivero hacia {ubicacion}, "
                f"registrado por {mov.created_by or '—'}."
            )
        else:
            descripcion = (
                f"El {mov.fecha_movimiento.strftime('%d/%m/%Y')} se registró un movimiento de "
                f"{cantidad} unidades de {nombre_producto}."
            )

        movimientos_out.append(
            {
                "movimiento_id": mov.id,
                "fecha_movimiento": mov.fecha_movimiento,
                "fecha_caducidad": getattr(mov, "fecha_caducidad", None),
                "cantidad": cantidad,
                "origen_tipo": mov.origen_tipo,
                "destino_tipo": mov.destino_tipo,
                "zona_origen": det.zona_origen,
                "zona_destino": det.zona_destino,
                "tamano_origen": det.tamano_origen,
                "tamano_destino": det.tamano_destino,
                "distrito_destino": mov.distrito_destino,
                "barrio_destino": mov.barrio_destino,
                "direccion_destino": mov.direccion_destino,
                "created_by": mov.created_by,
                "descripcion": descripcion,
            }
        )

    return {
        "uuid_lote": lote.uuid_lote,
        "producto_id": lote.producto_id,
        "producto_nombre": _producto_display(producto, lote.producto_id),
        "cantidad_inicial": lote.cantidad_inicial,
        "fecha_entrada": lote.fecha_entrada,
        "movimientos": movimientos_out,
        "inventario_actual": [
            {
                "zona": inv.zona,
                "tamano": inv.tamano,
                "cantidad_disponible": inv.cantidad_disponible,
            }
            for inv in inventario_actual
        ],
    }


# =============================
# REPORTES - DISTRIBUCION
# =============================
@app.get("/reportes/distribucion")
def reporte_distribucion(
    producto: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin", "manager", "tecnico", "gestor_vivero"])),
):
    producto = (producto or "").strip()
    if not producto:
        raise HTTPException(status_code=400, detail="Debes indicar el nombre del producto")

    prod = (
        db.query(Producto)
        .filter(
            or_(
                Producto.nombre_cientifico.ilike(f"%{producto}%"),
                Producto.nombre_natural.ilike(f"%{producto}%"),
            )
        )
        .order_by(Producto.nombre_cientifico.asc())
        .first()
    )

    if not prod:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    rows = (
        db.query(
            InventarioLote.zona,
            InventarioLote.tamano,
            func.sum(InventarioLote.cantidad_disponible).label("cantidad"),
        )
        .filter(
            InventarioLote.producto_id == prod.id,
            InventarioLote.cantidad_disponible > 0,
        )
        .group_by(InventarioLote.zona, InventarioLote.tamano)
        .order_by(InventarioLote.zona.asc(), InventarioLote.tamano.asc())
        .all()
    )

    distribucion = [
        {
            "zona": zona,
            "tamano": tamano,
            "cantidad": int(cantidad or 0),
        }
        for zona, tamano, cantidad in rows
    ]

    stock_total = sum(int(r["cantidad"]) for r in distribucion)

    return {
        "producto_id": prod.id,
        "producto_nombre": _producto_display(prod, prod.id),
        "stock_total": stock_total,
        "distribucion": distribucion,
    }


# =============================
# REPORTES - STOCK BAJO
# =============================
@app.get("/reportes/stock-bajo")
def reporte_stock_bajo(
    margen_pct: int = 20,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin", "manager", "gestor_vivero"])),
):
    productos = db.query(Producto).order_by(Producto.nombre_cientifico.asc()).all()

    stock_rows = (
        db.query(
            InventarioLote.producto_id,
            func.sum(InventarioLote.cantidad_disponible).label("stock_total"),
        )
        .filter(InventarioLote.cantidad_disponible > 0)
        .group_by(InventarioLote.producto_id)
        .all()
    )

    stock_map = {producto_id: int(stock_total or 0) for producto_id, stock_total in stock_rows}

    bajo_minimo = []
    proximos = []

    for p in productos:
        stock_actual = int(stock_map.get(p.id, 0))
        stock_minimo = int(p.stock_minimo or 0)

        if stock_minimo <= 0:
            continue

        umbral_alerta = int(round(stock_minimo * (1 + (max(1, margen_pct) / 100))))

        row = {
            "producto_id": p.id,
            "producto_nombre": _producto_display(p, p.id),
            "stock_actual": stock_actual,
            "stock_minimo": stock_minimo,
            "umbral_alerta": umbral_alerta,
        }

        if stock_actual < stock_minimo:
            bajo_minimo.append(row)
        elif stock_actual <= umbral_alerta:
            proximos.append(row)

    bajo_minimo.sort(key=lambda x: (x["stock_actual"] - x["stock_minimo"], x["producto_nombre"]))
    proximos.sort(key=lambda x: (x["stock_actual"] - x["stock_minimo"], x["producto_nombre"]))

    return {
        "margen_pct": margen_pct,
        "bajo_minimo": bajo_minimo,
        "proximos": proximos,
    }


# =============================
# REPORTES - MOVIMIENTOS EXTERNOS
# =============================
@app.get("/reportes/movimientos-externos")
def reporte_movimientos_externos(
    fecha_desde: str | None = None,
    fecha_hasta: str | None = None,
    distrito: str | None = None,
    barrio: str | None = None,
    direccion: str | None = None,
    categoria: str | None = None,
    subcategoria: str | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin", "manager", "tecnico", "empresa_externa", "gestor_vivero"])),
):
    q = (
        db.query(Movimiento, Producto)
        .join(Producto, Producto.id == Movimiento.producto_id)
        .filter(func.lower(Movimiento.origen_tipo) == "vivero")
        .filter(
            or_(
                func.lower(Movimiento.destino_tipo) != "vivero",
                Movimiento.distrito_destino.isnot(None),
                Movimiento.barrio_destino.isnot(None),
                Movimiento.direccion_destino.isnot(None),
            )
        )
    )

    if fecha_desde:
        try:
            dt_desde = datetime.strptime(fecha_desde, "%Y-%m-%d")
            q = q.filter(Movimiento.fecha_movimiento >= dt_desde)
        except ValueError:
            raise HTTPException(status_code=400, detail="fecha_desde inválida")

    if fecha_hasta:
        try:
            dt_hasta = datetime.strptime(fecha_hasta, "%Y-%m-%d")
            dt_hasta = dt_hasta.replace(hour=23, minute=59, second=59)
            q = q.filter(Movimiento.fecha_movimiento <= dt_hasta)
        except ValueError:
            raise HTTPException(status_code=400, detail="fecha_hasta inválida")

    if distrito:
        q = q.filter(Movimiento.distrito_destino.ilike(f"%{distrito.strip()}%"))

    if barrio:
        q = q.filter(Movimiento.barrio_destino.ilike(f"%{barrio.strip()}%"))

    if direccion:
        q = q.filter(Movimiento.direccion_destino.ilike(f"%{direccion.strip()}%"))

    if categoria:
        q = q.filter(func.lower(Producto.categoria) == categoria.strip().lower())

    if subcategoria:
        q = q.filter(func.lower(Producto.subcategoria) == subcategoria.strip().lower())

    rows = q.order_by(Movimiento.fecha_movimiento.desc(), Movimiento.id.desc()).all()

    return [
        {
            "movimiento_id": mov.id,
            "fecha_movimiento": mov.fecha_movimiento,
            "producto_id": mov.producto_id,
            "producto_nombre": _producto_display(prod, mov.producto_id),
            "producto_categoria": getattr(prod, "categoria", None),
            "producto_subcategoria": getattr(prod, "subcategoria", None),
            "cantidad": mov.cantidad,
            "origen_tipo": mov.origen_tipo,
            "destino_tipo": mov.destino_tipo,
            "zona_origen": mov.zona_origen,
            "zona_destino": mov.zona_destino,
            "tamano_origen": mov.tamano_origen,
            "tamano_destino": mov.tamano_destino,
            "distrito_destino": mov.distrito_destino,
            "barrio_destino": mov.barrio_destino,
            "direccion_destino": mov.direccion_destino,
            "created_by": mov.created_by,
        }
        for mov, prod in rows
    ]
    
    
# =========================
# INVENTARIO POR ZONA
# =========================
def _normalize_zona_id(value: str | None) -> str:
    # Normalización tolerante: lowercase, sin tildes ni separadores, y sin
    # los prefijos "zona"/"zonazona" que añade el editor de mapa. Permite que
    # "Almacén", "almacen", "Zona-Almacen" y "zona_almacén" colapsen al
    # mismo valor canónico al comparar contra inventario_lote.zona.
    raw = (value or "").strip().lower()
    raw = unicodedata.normalize("NFKD", raw)
    raw = "".join(c for c in raw if not unicodedata.combining(c))
    raw = raw.replace("_", "").replace("-", "").replace(" ", "")
    if raw.startswith("zonazona"):
        raw = raw[len("zonazona"):]
    if raw.startswith("zona"):
        raw = raw[len("zona"):]
    return raw


def _num_clean(n) -> float | int:
    """Devuelve int si el valor es entero (unidades) o float redondeado si no
    (kg/litros/m³). Mantiene limpia la respuesta del mapa."""
    f = float(n)
    r = round(f, 3)
    return int(r) if abs(r - round(r)) < 1e-9 else r


@app.get("/zonas/{zona_id}/items")
def get_zona_items(zona_id: str, db: Session = Depends(get_db)):
    zona_norm = _normalize_zona_id(zona_id)

    # El stock de la zona se calcula DESDE LOS MOVIMIENTOS (misma lógica que el
    # modal de movimientos en el frontend), no desde InventarioLote, para que el
    # mapa y la lista de movimientos siempre concuerden: se suma lo que entra a
    # la zona (movimientos con destino Vivero y zona_destino = esta) y se resta
    # lo que sale (origen Vivero y zona_origen = esta). El inventario del vivero
    # es pequeño, así que recorrer los movimientos en Python es barato.
    movimientos = db.query(Movimiento).all()

    # (producto_id, tamaño) -> cantidad neta en esta zona.
    agg: dict[tuple[int, str], float] = {}
    for m in movimientos:
        cant = float(getattr(m, "cantidad", 0) or 0)
        if cant == 0:
            continue
        producto_id = getattr(m, "producto_id", None)
        if producto_id is None:
            continue

        destino = _norm_str(getattr(m, "destino_tipo", None))
        origen = _norm_str(getattr(m, "origen_tipo", None))
        zona_destino = getattr(m, "zona_destino", None)
        zona_origen = getattr(m, "zona_origen", None)
        tam_destino = (getattr(m, "tamano_destino", None) or "").strip()
        tam_origen = (getattr(m, "tamano_origen", None) or "").strip()

        if destino == "vivero" and zona_destino and tam_destino and _normalize_zona_id(zona_destino) == zona_norm:
            key = (producto_id, tam_destino)
            agg[key] = agg.get(key, 0.0) + cant
        if origen == "vivero" and zona_origen and tam_origen and _normalize_zona_id(zona_origen) == zona_norm:
            key = (producto_id, tam_origen)
            agg[key] = agg.get(key, 0.0) - cant

    # Solo productos con stock neto positivo.
    prod_ids = {pid for (pid, _t), q in agg.items() if q > 1e-9}
    prod_rows: dict[int, Producto] = {}
    if prod_ids:
        for prod in db.query(Producto).filter(Producto.id.in_(prod_ids)).all():
            prod_rows[prod.id] = prod

    productos: dict[int, dict] = {}
    for (producto_id, tamano), qty in agg.items():
        if qty <= 1e-9:
            continue
        prod = prod_rows.get(producto_id)
        if producto_id not in productos:
            productos[producto_id] = {
                "producto_id": producto_id,
                "nombre_cientifico": getattr(prod, "nombre_cientifico", None),
                "nombre_natural": getattr(prod, "nombre_natural", None),
                "categoria": getattr(prod, "categoria", None),
                "subcategoria": getattr(prod, "subcategoria", None),
                "es_interno": bool(getattr(prod, "es_interno", False)),
                "cantidad": 0.0,
                "tamanos_map": {},
            }
        tam = tamano or "N/A"
        productos[producto_id]["cantidad"] += qty
        productos[producto_id]["tamanos_map"][tam] = (
            productos[producto_id]["tamanos_map"].get(tam, 0.0) + qty
        )

    items = []
    for item in productos.values():
        tamanos = [
            {"tamano": tamano, "cantidad": _num_clean(cantidad)}
            for tamano, cantidad in sorted(item["tamanos_map"].items(), key=lambda x: x[0])
        ]
        items.append(
            {
                "producto_id": item["producto_id"],
                "nombre_cientifico": item["nombre_cientifico"],
                "nombre_natural": item["nombre_natural"],
                "categoria": item["categoria"],
                "subcategoria": item["subcategoria"],
                "es_interno": item["es_interno"],
                "cantidad": _num_clean(item["cantidad"]),
                "tamanos": tamanos,
            }
        )

    items.sort(key=lambda x: (x.get("nombre_cientifico") or x.get("nombre_natural") or "").lower())

    return {
        "zona": zona_id,
        "zona_normalizada": zona_norm,
        "total_productos": len(items),
        # True si TODOS los productos de la zona son internos (para el checkbox
        # "Marcar como interna"). Si la zona está vacía, es False.
        "todos_internos": bool(items) and all(it.get("es_interno") for it in items),
        "items": items,
    }


class ZonaInternaRequest(BaseModel):
    interno: bool


@app.post("/zonas/{zona_id}/marcar-interna")
def marcar_zona_interna(
    zona_id: str,
    payload: ZonaInternaRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin"])),
):
    """Marca (o desmarca) como INTERNOS todos los productos con stock en la zona.
    Los productos internos no los ve ni puede pedir la empresa externa."""
    zona_norm = _normalize_zona_id(zona_id)
    movimientos = db.query(Movimiento).all()

    # Neto por (producto, tamaño) en la zona (misma lógica que get_zona_items).
    agg: dict[tuple, float] = {}
    for m in movimientos:
        cant = float(getattr(m, "cantidad", 0) or 0)
        if cant == 0:
            continue
        pid = getattr(m, "producto_id", None)
        if pid is None:
            continue
        destino = _norm_str(getattr(m, "destino_tipo", None))
        origen = _norm_str(getattr(m, "origen_tipo", None))
        zd = getattr(m, "zona_destino", None)
        zo = getattr(m, "zona_origen", None)
        td = (getattr(m, "tamano_destino", None) or "").strip()
        to = (getattr(m, "tamano_origen", None) or "").strip()
        if destino == "vivero" and zd and td and _normalize_zona_id(zd) == zona_norm:
            agg[(pid, td)] = agg.get((pid, td), 0.0) + cant
        if origen == "vivero" and zo and to and _normalize_zona_id(zo) == zona_norm:
            agg[(pid, to)] = agg.get((pid, to), 0.0) - cant

    prod_ids = sorted({pid for (pid, _t), q in agg.items() if q > 1e-9})
    if not prod_ids:
        return {"ok": True, "actualizados": 0, "interno": bool(payload.interno), "producto_ids": []}

    # OJO: los bulk .update() NO pasan por el auto-filtro de tenant.py, así que
    # acotamos a mano por ayuntamiento. (Los prod_ids ya vienen de movimientos
    # filtrados, pero añadimos el filtro por seguridad.)
    _cid = tenant.get_session_cliente(db)
    q_upd = db.query(Producto).filter(Producto.id.in_(prod_ids))
    if _cid is not None:
        q_upd = q_upd.filter(Producto.cliente_id == _cid)
    actualizados = q_upd.update(
        {Producto.es_interno: bool(payload.interno)}, synchronize_session=False
    )
    db.commit()
    return {
        "ok": True,
        "actualizados": int(actualizados or 0),
        "interno": bool(payload.interno),
        "producto_ids": prod_ids,
    }


# =============================
# GESTIÓN DE USUARIOS (ADMIN)
# =============================
# `admin_vivero`: administrador del vivero de un ayuntamiento (gestiona usuarios,
# productos y el mapa de SU ayuntamiento). `admin` es el super-admin global.
ALLOWED_ROLES = {"superadmin", "admin", "admin_vivero", "manager", "tecnico", "gestor_vivero", "empresa_externa", "proveedor"}
ALLOWED_STATUSES_FOR_UPDATE = {"activo", "inactivo", "bloqueado", "pendiente"}


class AdminUserCreate(BaseModel):
    username: str
    email: str
    rol: str
    status: Optional[str] = "pendiente"
    # Solo lo usa el admin global para asignar el usuario a un ayuntamiento. El
    # admin_vivero lo ignora: sus usuarios se atan automáticamente a su cliente.
    cliente_id: Optional[int] = None


class AdminUserUpdate(BaseModel):
    email: Optional[str] = None
    rol: Optional[str] = None
    status: Optional[str] = None


def _user_admin_dict(u: Usuario) -> dict:
    last_token = None
    return {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "rol": u.rol,
        "status": u.status,
        "cliente_id": u.cliente_id,
        "failed_login_attempts": u.failed_login_attempts or 0,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "updated_at": u.updated_at.isoformat() if u.updated_at else None,
    }


def _normalize_email(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = str(value).strip().lower()
    return cleaned or None


def _validate_email_or_400(email: Optional[str]) -> str:
    cleaned = _normalize_email(email)
    if not cleaned or "@" not in cleaned or "." not in cleaned.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Email inválido.")
    return cleaned


@app.get("/admin/users")
def admin_list_users(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin"])),
):
    users = db.query(Usuario).order_by(Usuario.username.asc()).all()
    return [_user_admin_dict(u) for u in users]


@app.post("/admin/users", status_code=201)
def admin_create_user(
    payload: AdminUserCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin"])),
):
    username = (payload.username or "").strip()
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="El username debe tener al menos 3 caracteres.")

    email = _validate_email_or_400(payload.email)
    rol = (payload.rol or "").strip().lower()
    if rol not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="Rol no válido.")

    status_norm = (payload.status or "pendiente").strip().lower()
    # Solo permitimos crear en 'pendiente' o 'activo'. Activo será raro pero permitido.
    if status_norm not in {"pendiente", "activo"}:
        raise HTTPException(status_code=400, detail="Estado inicial no válido.")

    # --- Ayuntamiento del nuevo usuario ---
    creador_rol = (current_user.rol or "").strip().lower()
    if creador_rol == ROL_ADMIN_GLOBAL:
        # El admin global elige el ayuntamiento (payload.cliente_id o X-Cliente-Id).
        target_cid = payload.cliente_id if payload.cliente_id is not None else tenant.get_session_cliente(db)
        if rol != ROL_ADMIN_GLOBAL:
            if target_cid is None:
                raise HTTPException(
                    status_code=400,
                    detail="Indica el ayuntamiento (cliente_id) del nuevo usuario.",
                )
            existe_cli = db.query(Cliente).filter(Cliente.id == target_cid).first()
            if not existe_cli:
                raise HTTPException(status_code=400, detail="El ayuntamiento indicado no existe.")
        else:
            target_cid = None  # otro admin global no pertenece a ningún ayuntamiento
    else:
        # admin_vivero: siempre en su propio ayuntamiento. No puede crear admins
        # globales ni usuarios de otros ayuntamientos.
        if rol == ROL_ADMIN_GLOBAL:
            raise HTTPException(status_code=403, detail="No puedes crear administradores globales.")
        target_cid = current_user.cliente_id

    # Verificar unicidad GLOBAL (username y email son únicos en toda la BD, no
    # solo dentro del ayuntamiento) → saltamos el auto-filtro por cliente.
    existing_username = (
        db.query(Usuario)
        .filter(func.lower(Usuario.username) == username.lower())
        .execution_options(skip_tenant=True)
        .first()
    )
    if existing_username:
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese nombre.")

    existing_email = (
        db.query(Usuario)
        .filter(func.lower(Usuario.email) == email)
        .execution_options(skip_tenant=True)
        .first()
    )
    if existing_email:
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese email.")

    # Password placeholder hasheado: nunca conocido por nadie. Se reemplaza al activar.
    placeholder = pwd_context.hash(uuid.uuid4().hex)

    user = Usuario(
        username=username,
        email=email,
        password_hash=placeholder,
        status=status_norm,
        rol=rol,
        failed_login_attempts=0,
        cliente_id=target_cid,
    )
    db.add(user)
    db.flush()

    # Generar token de activación + enviar email solo si queda en pendiente
    if status_norm == "pendiente":
        raw_token = account_tokens.issue_token(
            db, user, "activate", created_by=current_user.username
        )
        db.commit()
        try:
            email_service.send_invitation_email(
                to=user.email, username=user.username, token=raw_token
            )
        except Exception as e:  # noqa: BLE001
            print(f"[admin_create_user] Email send failed: {e}")
    else:
        db.commit()

    db.refresh(user)
    return _user_admin_dict(user)


@app.patch("/admin/users/{user_id}")
def admin_update_user(
    user_id: int,
    payload: AdminUserUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin"])),
):
    user = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    if payload.email is not None:
        new_email = _validate_email_or_400(payload.email)
        existing = (
            db.query(Usuario)
            .filter(func.lower(Usuario.email) == new_email, Usuario.id != user.id)
            .execution_options(skip_tenant=True)
            .first()
        )
        if existing:
            raise HTTPException(status_code=409, detail="Otro usuario ya tiene ese email.")
        user.email = new_email

    if payload.rol is not None:
        rol = payload.rol.strip().lower()
        if rol not in ALLOWED_ROLES:
            raise HTTPException(status_code=400, detail="Rol no válido.")
        # Evitar dejar el sistema sin admins
        if user.rol == "admin" and rol != "admin":
            admin_count = db.query(Usuario).filter(
                Usuario.rol == "admin", Usuario.status == "activo", Usuario.id != user.id
            ).count()
            if admin_count == 0:
                raise HTTPException(
                    status_code=400,
                    detail="No puedes quitar el rol de admin al último administrador activo.",
                )
        user.rol = rol

    if payload.status is not None:
        new_status = payload.status.strip().lower()
        if new_status not in ALLOWED_STATUSES_FOR_UPDATE:
            raise HTTPException(status_code=400, detail="Estado no válido.")
        # Si pasamos a activo o inactivo desde bloqueado, reseteamos el contador
        if new_status in {"activo", "inactivo"}:
            user.failed_login_attempts = 0
        # Idem: no dejar al sistema sin admins activos
        if user.rol == "admin" and user.status == "activo" and new_status != "activo":
            admin_count = db.query(Usuario).filter(
                Usuario.rol == "admin", Usuario.status == "activo", Usuario.id != user.id
            ).count()
            if admin_count == 0:
                raise HTTPException(
                    status_code=400,
                    detail="No puedes desactivar al último administrador activo.",
                )
        user.status = new_status

    db.add(user)
    db.commit()
    db.refresh(user)
    return _user_admin_dict(user)


@app.delete("/admin/users/{user_id}")
def admin_delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin"])),
):
    user = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    # No te dejes a ti mismo fuera del sistema.
    if user.id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="No puedes borrar tu propio usuario.",
        )

    # No dejar al sistema sin admins activos.
    if (user.rol or "").lower() == "admin":
        admin_count = db.query(Usuario).filter(
            Usuario.rol == "admin",
            Usuario.status == "activo",
            Usuario.id != user.id,
        ).count()
        if admin_count == 0:
            raise HTTPException(
                status_code=400,
                detail="No puedes borrar al último administrador activo.",
            )

    # Borrado en cascada manual de tokens (FK sin ondelete=CASCADE).
    db.query(AccountToken).filter(AccountToken.user_id == user.id).delete(
        synchronize_session=False
    )
    db.delete(user)
    db.commit()

    return {"ok": True, "deleted_user_id": user_id}


@app.post("/admin/users/{user_id}/resend-invitation")
def admin_resend_invitation(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin"])),
):
    user = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    if (user.status or "").strip().lower() != "pendiente":
        raise HTTPException(
            status_code=400,
            detail="Solo se puede reenviar invitación a usuarios en estado 'pendiente'.",
        )
    if not user.email:
        raise HTTPException(status_code=400, detail="El usuario no tiene email registrado.")

    raw_token = account_tokens.issue_token(db, user, "activate", created_by=current_user.username)
    db.commit()
    try:
        email_service.send_invitation_email(
            to=user.email, username=user.username, token=raw_token
        )
    except Exception as e:  # noqa: BLE001
        print(f"[admin_resend_invitation] Email send failed: {e}")
    return {"ok": True}


@app.post("/admin/users/{user_id}/reset-password")
def admin_reset_password(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin"])),
):
    user = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    if not user.email:
        raise HTTPException(status_code=400, detail="El usuario no tiene email registrado.")

    raw_token = account_tokens.issue_token(db, user, "reset", created_by=current_user.username)
    db.commit()
    try:
        email_service.send_reset_password_email(
            to=user.email, username=user.username, token=raw_token
        )
    except Exception as e:  # noqa: BLE001
        print(f"[admin_reset_password] Email send failed: {e}")
    return {"ok": True}


@app.post("/admin/users/{user_id}/unlock")
def admin_unlock_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin"])),
):
    user = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    if (user.status or "").strip().lower() != "bloqueado":
        raise HTTPException(
            status_code=400,
            detail="Solo se puede desbloquear a usuarios en estado 'bloqueado'.",
        )
    if not user.email:
        raise HTTPException(status_code=400, detail="El usuario no tiene email registrado.")

    raw_token = account_tokens.issue_token(db, user, "unlock", created_by=current_user.username)
    db.commit()
    try:
        email_service.send_unlock_email(
            to=user.email, username=user.username, token=raw_token
        )
    except Exception as e:  # noqa: BLE001
        print(f"[admin_unlock_user] Email send failed: {e}")
    return {"ok": True}


# =============================
# TOKENS PÚBLICOS (sin auth)
# Activación inicial · Reset password · Unlock
# =============================
class ConsumeTokenIn(BaseModel):
    new_password: str


def _validate_password_or_400(pwd: str) -> str:
    if not pwd or len(pwd) < 8:
        raise HTTPException(
            status_code=400,
            detail="La contraseña debe tener al menos 8 caracteres.",
        )
    if len(pwd) > 200:
        raise HTTPException(
            status_code=400,
            detail="La contraseña es demasiado larga.",
        )
    return pwd


class ForgotPasswordIn(BaseModel):
    username: str
    email: str


@app.get("/admin/email-config")
def admin_email_config(current_user: Usuario = Depends(require_global_admin())):
    """Estado de la configuración de correo (sin secretos), para diagnóstico."""
    return email_service.config_status()


@app.post("/admin/email-test")
def admin_email_test(
    to: str,
    current_user: Usuario = Depends(require_global_admin()),
):
    """Envía un correo de prueba al destino indicado y reporta si funcionó."""
    dest = (to or "").strip()
    if not dest:
        raise HTTPException(status_code=400, detail="Indica un email de destino.")
    try:
        email_service.send_test_email(to=dest)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Fallo al enviar el correo de prueba: {e}")
    return {"ok": True, "driver": email_service.config_status().get("driver"), "to": dest}


@app.post("/auth/forgot-password")
def auth_forgot_password(payload: ForgotPasswordIn, db: Session = Depends(get_db)):
    """
    Endpoint público (sin auth) para solicitar reset de contraseña desde el login.
    Si username + email coinciden con un usuario activo, envía un email con enlace.
    Si no coinciden, ignora silenciosamente la petición.

    En todos los casos devuelve 200 OK con el mismo mensaje genérico para no
    filtrar información sobre qué usuarios/emails existen en el sistema.
    """
    GENERIC_RESPONSE = {
        "ok": True,
        "message": (
            "Si los datos coinciden con una cuenta válida, recibirás un email "
            "con instrucciones para restablecer tu contraseña."
        ),
    }

    username = (payload.username or "").strip()
    email = (payload.email or "").strip().lower()

    if not username or not email:
        return GENERIC_RESPONSE

    user = (
        db.query(Usuario)
        .filter(
            func.lower(Usuario.username) == username.lower(),
            func.lower(Usuario.email) == email,
        )
        .first()
    )

    if not user:
        return GENERIC_RESPONSE

    # Solo procesamos si el usuario está en un estado en el que un reset tiene sentido.
    status_norm = (user.status or "").strip().lower()
    if status_norm not in {"activo", "bloqueado"}:
        return GENERIC_RESPONSE

    try:
        raw_token = account_tokens.issue_token(db, user, "reset", created_by="self-service")
        db.commit()
        email_service.send_reset_password_email(
            to=user.email, username=user.username, token=raw_token
        )
    except Exception as e:  # noqa: BLE001
        # Tampoco filtramos el error al cliente.
        print(f"[auth_forgot_password] Error procesando solicitud: {e}")

    return GENERIC_RESPONSE


@app.get("/auth/token/{token}")
def auth_token_validate(token: str, db: Session = Depends(get_db)):
    """
    Valida un token de activación/reset/unlock y devuelve metadatos seguros para
    pintar el formulario en el frontend. NO devuelve datos sensibles.
    """
    try:
        record = account_tokens.lookup_token(db, token)
    except account_tokens.TokenValidationError as e:
        raise HTTPException(status_code=400, detail={"code": e.code, "message": e.message})

    user = db.query(Usuario).filter(Usuario.id == record.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail={"code": "invalid", "message": "Token inválido."})

    return {
        "purpose": record.purpose,
        "username": user.username,
        "expires_at": record.expires_at.isoformat() + "Z",
    }


@app.post("/auth/token/{token}/consume")
def auth_token_consume(
    token: str,
    payload: ConsumeTokenIn,
    db: Session = Depends(get_db),
):
    """
    Consume un token y fija la nueva contraseña del usuario asociado.
    Operación atómica: marca el token como usado, actualiza password, ajusta status.
    """
    try:
        record = account_tokens.lookup_token(db, token)
    except account_tokens.TokenValidationError as e:
        raise HTTPException(status_code=400, detail={"code": e.code, "message": e.message})

    user = db.query(Usuario).filter(Usuario.id == record.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail={"code": "invalid", "message": "Token inválido."})

    new_password = _validate_password_or_400(payload.new_password)

    user.password_hash = pwd_context.hash(new_password)

    # Cualquier propósito deja al usuario activo y con contador de fallos a 0.
    user.status = "activo"
    user.failed_login_attempts = 0

    account_tokens.consume_token(db, record)
    db.add(user)
    db.commit()

    return {"ok": True, "purpose": record.purpose}


# =============================
# CONFIGURACIÓN DE ZONAS DEL MAPA
# =============================
class ZonaPolygonIn(BaseModel):
    id: str
    apiId: Optional[str] = None
    api_id: Optional[str] = None  # acepta ambos por flexibilidad
    nombre: str
    color: str
    puntos: str


def _serialize_zona(z: ZonaPolygon) -> dict:
    return {
        "id": z.id,
        "apiId": z.api_id,
        "nombre": z.nombre,
        "color": z.color,
        "puntos": z.puntos,
    }


@app.get("/zonas-config")
def get_zonas_config(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Devuelve la configuración de zonas del mapa DEL AYUNTAMIENTO ACTIVO.

    (En el vivero original era público; en viver-app requiere sesión para poder
    filtrar las zonas por ayuntamiento — el auto-filtro de tenant.py usa el
    cliente_id fijado en la Session al autenticar.)

    Si el ayuntamiento aún no tiene zonas configuradas, devuelve []. El frontend
    tiene un fallback al fichero estático `zonasConfig.js` en ese caso.
    """
    rows = db.query(ZonaPolygon).order_by(ZonaPolygon.sort_order.asc(), ZonaPolygon.id.asc()).all()
    return [_serialize_zona(z) for z in rows]


@app.put("/zonas-config")
def put_zonas_config(
    payload: list[ZonaPolygonIn],
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_roles(["admin"])),
):
    """
    Reemplaza la configuración de zonas completa. Solo admin.

    Estrategia: borrado + insert en bloque, dentro de una transacción.
    Para los volúmenes esperados (decenas de zonas) es la opción más simple
    y robusta. El sort_order se asigna por la posición en el array enviado.
    """
    if not isinstance(payload, list):
        raise HTTPException(status_code=400, detail="Se esperaba un array de zonas.")

    # Validaciones mínimas
    seen_ids = set()
    for idx, z in enumerate(payload):
        zid = (z.id or "").strip()
        if not zid:
            raise HTTPException(status_code=400, detail=f"Zona en posición {idx} sin id.")
        if zid in seen_ids:
            raise HTTPException(status_code=400, detail=f"Id duplicado: {zid}")
        seen_ids.add(zid)
        if not (z.nombre or "").strip():
            raise HTTPException(status_code=400, detail=f"Zona {zid} sin nombre.")
        if not (z.puntos or "").strip():
            raise HTTPException(status_code=400, detail=f"Zona {zid} sin puntos.")

    # El mapa/zonas pertenecen a un ayuntamiento concreto. Necesitamos saber
    # cuál para acotar el borrado y estampar el cliente_id en las nuevas zonas.
    _cid = tenant.get_session_cliente(db)
    if _cid is None:
        raise HTTPException(
            status_code=400,
            detail="Selecciona un ayuntamiento antes de editar sus zonas.",
        )

    # Reemplazo atómico: vaciamos y reinsertamos SOLO las de este ayuntamiento.
    # OJO: los bulk .delete() NO pasan por el auto-filtro de tenant.py, por eso
    # se filtra a mano por cliente_id (si no, borraría las de todos).
    db.query(ZonaPolygon).filter(ZonaPolygon.cliente_id == _cid).delete(synchronize_session=False)
    now = datetime.utcnow()
    for idx, z in enumerate(payload):
        api_id = (z.api_id or z.apiId or z.id).strip()
        db.add(
            ZonaPolygon(
                id=z.id.strip(),
                cliente_id=_cid,
                api_id=api_id,
                nombre=z.nombre.strip(),
                color=(z.color or "#cccccc").strip(),
                puntos=z.puntos.strip(),
                sort_order=idx,
                updated_at=now,
                updated_by=current_user.username,
            )
        )
    db.commit()

    rows = db.query(ZonaPolygon).order_by(ZonaPolygon.sort_order.asc(), ZonaPolygon.id.asc()).all()
    return [_serialize_zona(z) for z in rows]


# =============================
# COPIA DE SEGURIDAD / RESTAURACIÓN (solo admin)
# =============================
# Orden de dependencias (padres → hijos). Para borrar se recorre al revés.
_BACKUP_MODELS = [
    # El ayuntamiento va primero: es el padre al que referencian todos los demás.
    Cliente,
    Usuario,
    Producto,
    CaducidadConfig,
    ZonaPolygon,
    Lote,
    InventarioLote,
    Pedido,
    PedidoItem,
    Movimiento,
    MovimientoLoteDetalle,
    AccountToken,
]


def _jsonable(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, bytes):
        # Datos binarios (p.ej. la imagen del mapa, BYTEA) → base64 para que
        # sobrevivan intactos en el JSON de copia de seguridad.
        import base64
        return {"__b64__": base64.b64encode(value).decode("ascii")}
    return value


def _coerce_col(col, value):
    """Convierte el valor del JSON al tipo de la columna al restaurar."""
    if value is None:
        return None
    tname = col.type.__class__.__name__.lower()
    # Binario codificado en base64 (ver _jsonable).
    if isinstance(value, dict) and "__b64__" in value:
        import base64
        try:
            return base64.b64decode(value["__b64__"])
        except (ValueError, TypeError):
            return None
    if "largebinary" in tname or "bytea" in tname or "blob" in tname:
        if isinstance(value, str):
            return value.encode("utf-8")
    try:
        if "datetime" in tname or tname == "timestamp":
            return datetime.fromisoformat(value) if isinstance(value, str) else value
        if tname == "date":
            return date.fromisoformat(value) if isinstance(value, str) else value
        if "numeric" in tname or "float" in tname or "decimal" in tname:
            return float(value)
        if "integer" in tname or "biginteger" in tname or tname == "int":
            return int(value)
        if "boolean" in tname:
            if isinstance(value, bool):
                return value
            return str(value).strip().lower() in ("1", "true", "t", "yes", "si", "sí")
    except (ValueError, TypeError):
        return value
    return value


@app.get("/admin/backup")
def admin_backup(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_global_admin()),
):
    """Descarga TODA la base de datos (todos los ayuntamientos) como JSON."""
    # Copia global: desactivamos el filtro por ayuntamiento en esta Session.
    set_session_cliente(db, None)
    data = {
        "_meta": {
            "version": 1,
            "generated_at": datetime.utcnow().isoformat(),
            "generated_by": getattr(current_user, "username", None),
            "app": "ViverApp",
        },
        "tables": {},
    }
    for model in _BACKUP_MODELS:
        cols = [c.key for c in sa_inspect(model).mapper.column_attrs]
        rows = db.query(model).all()
        data["tables"][model.__tablename__] = [
            {c: _jsonable(getattr(r, c)) for c in cols} for r in rows
        ]

    payload = json.dumps(data, ensure_ascii=False, default=str, indent=2)
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"viverapp_backup_{ts}.json"
    return Response(
        content=payload,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/admin/restore")
async def admin_restore(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_global_admin()),
):
    """Restaura la base de datos completa desde un fichero de copia de seguridad.
    ATENCIÓN: reemplaza TODOS los datos actuales (de todos los ayuntamientos)
    por los del fichero."""
    # Operación global: desactivamos el filtro por ayuntamiento para que el
    # borrado masivo y las inserciones abarquen toda la BD.
    set_session_cliente(db, None)
    raw = await file.read()
    try:
        data = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="El fichero no es una copia de seguridad válida (JSON).")

    tables = data.get("tables")
    if not isinstance(tables, dict):
        raise HTTPException(status_code=400, detail="El fichero no tiene el formato de copia de seguridad esperado.")

    try:
        # 1) Borrar todo (hijos → padres).
        for model in reversed(_BACKUP_MODELS):
            db.query(model).delete()
        db.flush()

        # 2) Insertar (padres → hijos).
        resumen = {}
        for model in _BACKUP_MODELS:
            filas = tables.get(model.__tablename__, []) or []
            cols_map = {c.key: c for c in sa_inspect(model).mapper.columns}
            for fila in filas:
                kwargs = {}
                for k, v in fila.items():
                    col = cols_map.get(k)
                    if col is None:
                        continue
                    kwargs[k] = _coerce_col(col, v)
                db.add(model(**kwargs))
            db.flush()
            resumen[model.__tablename__] = len(filas)

        db.commit()
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        db.rollback()
        raise HTTPException(status_code=400, detail=f"No se pudo restaurar la copia: {e}")

    # 3) Reajustar las secuencias (Postgres), best-effort y en su propia
    #    transacción para que un fallo aquí no eche atrás la restauración.
    for model in _BACKUP_MODELS:
        tbl = model.__tablename__
        try:
            db.execute(text(
                f"SELECT setval(pg_get_serial_sequence('{tbl}', 'id'), "
                f"COALESCE((SELECT MAX(id) FROM {tbl}), 1))"
            ))
            db.commit()
        except Exception:
            db.rollback()

    return {"ok": True, "restaurado": resumen}
