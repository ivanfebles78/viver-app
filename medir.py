import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from models import Base, Cliente, InventarioLote, Pedido, PedidoItem, Producto

URL = os.environ["TEST_DATABASE_URL"]
e = create_engine(URL)
Base.metadata.create_all(bind=e)
S = sessionmaker(bind=e)
s = S()
for t in (PedidoItem, Pedido, InventarioLote, Producto):
    s.query(t).delete()
s.query(Cliente).delete()
s.add(Cliente(id=1, nombre="P", slug="p", activo=True)); s.commit()

for i in range(30):
    p = Producto(cliente_id=1, nombre_cientifico=f"P{i}", nombre_natural=f"P{i}",
                 categoria="Planta", subcategoria="Mata", stock_minimo=0)
    s.add(p); s.commit(); s.refresh(p)
    s.add(InventarioLote(cliente_id=1, uuid_lote=f"l{i}", producto_id=p.id,
                         zona="A", tamano="M12", cantidad_disponible=10)); s.commit()
    ped = Pedido(cliente_id=1, estado="RESERVA", tipo="salida"); s.add(ped); s.commit(); s.refresh(ped)
    s.add(PedidoItem(cliente_id=1, pedido_id=ped.id, producto_id=p.id, tamano="M12",
                     cantidad=2, cantidad_servida=0, estado_item="RESERVA")); s.commit()

from main import get_productos
class U: rol = "admin"

s.expire_all()
q = []
def contar(conn, cur, st, par, ctx, many): q.append(st)
event.listen(s.get_bind(), "before_cursor_execute", contar)
filas = get_productos(db=s, user=U())
event.remove(s.get_bind(), "before_cursor_execute", contar)
print("FILAS:", len(filas), "CONSULTAS:", len(q))
