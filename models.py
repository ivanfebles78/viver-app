from sqlalchemy import Column, Integer, String, Date, DateTime, Boolean, ForeignKey, Text, Numeric, LargeBinary
from sqlalchemy.orm import relationship
from datetime import datetime
from db import Base


# =========================
# CLIENTES (AYUNTAMIENTOS / ENTIDADES)  ── raíz del multi-tenant
# =========================
# Cada ayuntamiento es un "cliente". TODO el resto de datos (usuarios,
# productos, pedidos, movimientos, zonas del mapa, etc.) cuelga de un
# cliente_id, de modo que cada entidad solo ve lo suyo. Santa Cruz de
# Tenerife es el cliente id=1 (el vivero original).
class Cliente(Base):
    __tablename__ = "clientes"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(150), nullable=False)          # p.ej. "Ayuntamiento de Santa Cruz de Tenerife"
    slug = Column(String(60), unique=True, index=True, nullable=False)  # p.ej. "santa-cruz"
    activo = Column(Boolean, nullable=False, default=True)

    # Datos de contacto / branding opcionales del ayuntamiento.
    cif = Column(String(20), nullable=True)
    direccion = Column(String(255), nullable=True)
    email_contacto = Column(String(255), nullable=True)
    telefono = Column(String(30), nullable=True)

    # Imagen del mapa del vivero, subida por el admin_vivero de este cliente.
    # Se guarda en la propia BD (bytea) — Railway tiene disco efímero.
    mapa_imagen = Column(LargeBinary, nullable=True)
    mapa_mimetype = Column(String(60), nullable=True)
    mapa_updated_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


# =========================
# USUARIOS
# =========================
class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    # El super-admin global tiene cliente_id NULL (ve todos los ayuntamientos y
    # elige uno de la lista). El resto de roles siempre pertenecen a un cliente.
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=True, index=True)

    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=True)
    password_hash = Column(String(255), nullable=False)

    status = Column(String(20), nullable=False, default="activo")
    rol = Column(String(20), nullable=False, default="manager")

    failed_login_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    cliente = relationship("Cliente")


# =========================
# PRODUCTOS
# =========================
class Producto(Base):
    __tablename__ = "productos"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=True, index=True)
    nombre_natural = Column(String(255), nullable=True)
    nombre_cientifico = Column(String(255), nullable=False)

    categoria = Column(String(100), nullable=False)
    subcategoria = Column(String(100), nullable=False)

    stock_minimo = Column(Integer, default=0)
    es_interno = Column(Boolean, nullable=False, default=False)
    # Precio unitario en euros (coste de referencia del producto). Opcional.
    precio = Column(Numeric(10, 2), nullable=True)


class CaducidadConfig(Base):
    __tablename__ = "caducidad_reglas"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=True, index=True)
    categoria = Column(String(100), nullable=False, index=True)
    # subcategoria y tamano pueden ser NULL = comodín (aplica a cualquiera)
    subcategoria = Column(String(100), nullable=True, index=True)
    tamano = Column(String(20), nullable=True, index=True)
    dias_caducidad = Column(Integer, nullable=True)
    activo = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


# =========================
# LOTES (UUID DE ENTRADA)
# =========================
class Lote(Base):
    __tablename__ = "lotes"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=True, index=True)
    uuid_lote = Column(String(50), unique=True, index=True, nullable=False)

    producto_id = Column(Integer, ForeignKey("productos.id"), nullable=False)

    tamano_inicial = Column(String(20), nullable=True)
    cantidad_inicial = Column(Numeric(12, 3), nullable=False)

    origen_tipo = Column(String(30), nullable=True)
    origen_referencia = Column(String(255), nullable=True)

    zona_inicial = Column(String(20), nullable=True)

    fecha_entrada = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String(50), nullable=True)

    producto = relationship("Producto")


# =========================
# INVENTARIO POR LOTE / ZONA / TAMAÑO
# =========================
class InventarioLote(Base):
    __tablename__ = "inventario_lote"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=True, index=True)

    uuid_lote = Column(String(50), index=True, nullable=False)
    producto_id = Column(Integer, ForeignKey("productos.id"), nullable=False)

    zona = Column(String(20), nullable=True)
    tamano = Column(String(20), nullable=True)

    cantidad_disponible = Column(Numeric(12, 3), nullable=False)
    fecha_disponibilidad = Column(Date, nullable=True)

    producto = relationship("Producto")


# =========================
# PEDIDOS
# =========================
class Pedido(Base):
    __tablename__ = "pedidos"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=True, index=True)
    estado = Column(String(30), nullable=False, default="RESERVA", index=True)
    tipo = Column(String(20), nullable=False, default="salida", index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    created_by = Column(String(150), nullable=True)
    solicitante_username = Column(String(150), nullable=True)
    nota = Column(Text, nullable=True)

    distrito_destino = Column(String(150), nullable=True)
    barrio_destino = Column(String(150), nullable=True)
    direccion_destino = Column(String(255), nullable=True)

    aprobado_por = Column(String(150), nullable=True)
    aprobado_at = Column(DateTime, nullable=True)

    denegado_por = Column(String(150), nullable=True)
    denegado_at = Column(DateTime, nullable=True)
    motivo_denegacion = Column(Text, nullable=True)

    served_at = Column(DateTime, nullable=True)
    served_by = Column(String(150), nullable=True)

    # Caducidad del propio pedido (p.ej. empresa_externa: 15 días)
    fecha_caducidad = Column(Date, nullable=True)

    items = relationship(
        "PedidoItem",
        back_populates="pedido",
        cascade="all, delete-orphan",
    )

    movimientos = relationship(
        "Movimiento",
        back_populates="pedido",
    )


class PedidoItem(Base):
    __tablename__ = "pedido_items"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=True, index=True)
    pedido_id = Column(Integer, ForeignKey("pedidos.id", ondelete="CASCADE"), nullable=False, index=True)
    producto_id = Column(Integer, ForeignKey("productos.id"), nullable=False, index=True)
    tamano = Column(String(30), nullable=True)
    cantidad = Column(Numeric(12, 3), nullable=False)
    cantidad_servida = Column(Numeric(12, 3), nullable=False, default=0)

    # Destino por línea (para pedidos con varios destinos: la empresa externa
    # puede repartir el material entre distintas direcciones). Si es NULL, se
    # usa el destino a nivel de pedido (pedidos internos de un solo destino).
    distrito_destino = Column(String(150), nullable=True)
    barrio_destino = Column(String(150), nullable=True)
    direccion_destino = Column(String(255), nullable=True)

    # Per-item approval state (RESERVA | APROBADO | DENEGADO).  The pedido's
    # aggregate `estado` is derived from these — see `recompute_pedido_estado`
    # in main.py.
    estado_item = Column(
        String(20),
        nullable=False,
        default="RESERVA",
        server_default="RESERVA",
        index=True,
    )

    pedido = relationship("Pedido", back_populates="items")
    producto = relationship("Producto")

    movimientos = relationship(
        "Movimiento",
        back_populates="pedido_item",
    )

# =========================
# MOVIMIENTOS
# =========================
class Movimiento(Base):
    __tablename__ = "movimientos"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=True, index=True)

    pedido_id = Column(Integer, ForeignKey("pedidos.id"), nullable=True)
    pedido_item_id = Column(Integer, ForeignKey("pedido_items.id"), nullable=True)

    producto_id = Column(Integer, ForeignKey("productos.id"), nullable=False)

    tipo_movimiento = Column(String(20), nullable=False)

    # UUID o lista de UUIDs asociados al movimiento.
    # Si el movimiento sólo afecta a un lote, habrá un único UUID.
    # Si afecta a varios lotes, se almacenan separados por coma.
    uuid_lote = Column(String(255), nullable=True, index=True)

    origen_tipo = Column(String(30), nullable=False)
    destino_tipo = Column(String(30), nullable=False)

    zona_origen = Column(String(20), nullable=True)
    zona_destino = Column(String(20), nullable=True)

    tamano_origen = Column(String(20), nullable=True)
    tamano_destino = Column(String(20), nullable=True)

    cantidad = Column(Numeric(12, 3), nullable=False)

    distrito_destino = Column(String(100), nullable=True)
    barrio_destino = Column(String(100), nullable=True)
    direccion_destino = Column(String(255), nullable=True)
    cp_destino = Column(String(20), nullable=True)

    observaciones = Column(Text, nullable=True)
    es_prestamo = Column(Boolean, default=False, nullable=False)
    es_devolucion = Column(Boolean, default=False, nullable=False)
    prestamo_referencia_id = Column(Integer, ForeignKey("movimientos.id"), nullable=True)
    devuelto = Column(Boolean, default=False, nullable=False)
    fecha_devolucion = Column(DateTime, nullable=True)

    fecha_movimiento = Column(DateTime, default=datetime.utcnow)
    fecha_caducidad = Column(Date, nullable=True)
    dias_caducidad_aplicados = Column(Integer, nullable=True)
    fecha_disponibilidad = Column(Date, nullable=True)
    created_by = Column(String(50), nullable=True)

    producto = relationship("Producto")
    detalles = relationship("MovimientoLoteDetalle", back_populates="movimiento")

    pedido = relationship("Pedido", back_populates="movimientos")
    pedido_item = relationship("PedidoItem", back_populates="movimientos")


# =========================
# CONFIGURACIÓN DE ZONAS DEL MAPA
# =========================
class ZonaPolygon(Base):
    __tablename__ = "zona_polygons"

    # id lógico que usa el frontend (ej: "zona-3a"). PK COMPUESTA con cliente_id,
    # porque dos ayuntamientos distintos pueden tener una zona con el mismo id
    # lógico. El auto-filtro por cliente_id (ver tenant.py) devuelve siempre la
    # zona del ayuntamiento correcto.
    id = Column(String(40), primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), primary_key=True, nullable=False, index=True)
    api_id = Column(String(20), nullable=False)
    nombre = Column(String(100), nullable=False)
    color = Column(String(20), nullable=False, default="#cccccc")
    puntos = Column(Text, nullable=False)

    # Orden de aparición en el listado (admite reordenación futura).
    sort_order = Column(Integer, nullable=False, default=0)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    updated_by = Column(String(50), nullable=True)


# =========================
# TOKENS DE CUENTA (activación, reset password, unlock)
# =========================
class AccountToken(Base):
    __tablename__ = "account_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)

    # SHA-256 del token entregado al usuario. Nunca guardamos el token en claro.
    token_hash = Column(String(128), unique=True, nullable=False, index=True)

    # "activate" | "reset" | "unlock"
    purpose = Column(String(20), nullable=False, index=True)

    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_by = Column(String(50), nullable=True)

    user = relationship("Usuario")


# =========================
# DETALLE MOVIMIENTO-LOTE
# =========================
class MovimientoLoteDetalle(Base):
    __tablename__ = "movimiento_lote_detalle"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=True, index=True)

    movimiento_id = Column(Integer, ForeignKey("movimientos.id", ondelete="CASCADE"), nullable=False)
    uuid_lote = Column(String(50), index=True, nullable=False)
    producto_id = Column(Integer, ForeignKey("productos.id"), nullable=False)

    zona_origen = Column(String(20), nullable=True)
    zona_destino = Column(String(20), nullable=True)

    tamano_origen = Column(String(20), nullable=True)
    tamano_destino = Column(String(20), nullable=True)

    cantidad = Column(Numeric(12, 3), nullable=False)

    movimiento = relationship("Movimiento", back_populates="detalles")
    producto = relationship("Producto")