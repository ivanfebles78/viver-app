import { Dialog, DialogContent } from "../../ui";
import { Truncated } from "../../components/ui/feedback";
import { formatUsername } from "../../utils/format";
import { formatCantidadConUnidad } from "../../utils/numero";
import { getUnidadMovimiento } from "../../utils/formato";
import { formatFechaCanaria, formatFechaHoraCanaria } from "../../utils/fecha";

/*
 * DETALLE DE UN MOVIMIENTO — solo lectura.
 *
 * Antes era un `div` con `position: fixed` y un fondo semitransparente hecho a
 * mano: sin trampa de foco, sin cerrar con Escape, sin devolver el foco al
 * botón que lo abrió, y con un `onClick` en el fondo que cerraba el diálogo
 * también cuando se arrastraba una selección de texto desde dentro.
 *
 * Ahora es un `Dialog` del sistema, que resuelve las cuatro cosas.
 *
 * Los datos y su orden son EXACTAMENTE los de antes. Una lista de descripción
 * en vez de una rejilla de `div`s: es literalmente una lista de pares
 * término/valor, y así los lectores de pantalla la anuncian como tal.
 */

/** Fila del detalle. `mono` para valores que se copian carácter a carácter. */
function Dato({ label, value, mono = false }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-border py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-3">
      <dt className="text-body-sm text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 break-words text-body-sm ${mono ? "mono" : ""}`}>
        {value || "—"}
      </dd>
    </div>
  );
}

export default function MovimientoDetalleModal({ movimiento, onClose }) {
  const m = movimiento;

  // La dirección solo aparece si hay algo que mostrar, igual que antes.
  const direccion = [m?.direccion_destino, m?.barrio_destino, m?.distrito_destino, m?.cp_destino]
    .filter(Boolean)
    .join(", ");

  return (
    <Dialog open={!!m} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent
        title={m ? `Detalle del movimiento #${m.id}` : "Detalle del movimiento"}
        description={m ? `Registrado por ${formatUsername(m.created_by) || "—"}` : undefined}
        closeLabel="Cerrar"
        size="lg"
      >
        {m && (
          <dl className="flex flex-col">
            <Dato label="Fecha movimiento" value={formatFechaHoraCanaria(m.fecha_movimiento)} />
            {/*
              `tipo_movimiento` en crudo, sin traducir: es lo que hacía la
              versión anterior. La columna «Tipo» de la tabla sí lo traduce; en
              el detalle se muestra el valor almacenado, que es lo que hace
              falta cuando se está depurando un registro concreto.
            */}
            <Dato label="Tipo" value={m.tipo_movimiento || "—"} />
            <Dato
              label="Producto"
              value={m.producto_nombre_cientifico || m.nombre_cientifico || `Producto #${m.producto_id}`}
            />
            <Dato label="Cantidad" value={formatCantidadConUnidad(m.cantidad, getUnidadMovimiento(m))} />
            <Dato
              label="Origen"
              value={`${m.origen_tipo || "—"}${m.zona_origen ? " · Zona " + m.zona_origen : ""}${
                m.tamano_origen ? " · " + m.tamano_origen : ""
              }`}
            />
            <Dato
              label="Destino"
              value={`${m.destino_tipo || "—"}${m.zona_destino ? " · Zona " + m.zona_destino : ""}${
                m.tamano_destino ? " · " + m.tamano_destino : ""
              }`}
            />
            {direccion && <Dato label="Dirección destino" value={direccion} />}
            <Dato
              label="Préstamo"
              value={m.es_prestamo ? "Sí" : m.es_devolucion ? "Devolución" : "No"}
            />
            <Dato
              label="UUID lote"
              mono
              value={m.uuid_lote ? <Truncated className="mono">{m.uuid_lote}</Truncated> : "—"}
            />
            <Dato label="Pedido asociado" value={m.pedido_id ? `#${m.pedido_id}` : "—"} />
            <Dato label="Fecha caducidad" value={formatFechaCanaria(m.fecha_caducidad)} />
            <Dato label="Días caducidad aplicados" value={m.dias_caducidad_aplicados ?? "—"} />
            {m.fecha_disponibilidad && (
              <Dato label="Fecha disponibilidad" value={formatFechaCanaria(m.fecha_disponibilidad)} />
            )}
            <Dato label="Observaciones" value={m.observaciones || m.nota || "—"} />
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
}
