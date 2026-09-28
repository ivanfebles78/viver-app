import { useEffect, useMemo, useState } from "react";

import { Button, Dialog, DialogContent, Field, Input } from "../../ui";
import { Alert } from "../../components/ui/feedback";
import { loadZonasFromServer } from "../../components/vivero/zonesStorage";
import { getZonaLabel } from "../../utils/zonas";
import { formatCantidad } from "../../utils/numero";
import { devolverPedido } from "../../api/api";

/**
 * DEVOLUCIÓN DE MATERIAL DE UN PEDIDO SERVIDO.
 *
 * La empresa externa reintegra lo que le sobró de un pedido ya servido. Cada
 * línea reingresa al MISMO lote del que salió (lo resuelve el backend) con tope
 * = lo servido − lo ya devuelto (`devolvible`). No cambia el estado del pedido.
 */

const nombreLinea = (it) =>
  it.producto_nombre_cientifico || it.producto_nombre_natural || it.producto_nombre || `Producto #${it.producto_id}`;

/** Zona de la que salió la línea (para preseleccionar el destino del reingreso). */
function zonaOrigenDeLinea(it) {
  const movs = Array.isArray(it.movimientos_servicio) ? it.movimientos_servicio : [];
  for (const m of movs) {
    if (m.zona_origen) return String(m.zona_origen);
  }
  return "";
}

export default function DevolucionPedidoModal({ open, pedido, onClose, onDone }) {
  const [zonas, setZonas] = useState([]);
  const [nota, setNota] = useState("");
  const [cantidades, setCantidades] = useState({}); // { [itemId]: valor }
  const [zonaPorItem, setZonaPorItem] = useState({}); // { [itemId]: zonaId }
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const lineas = useMemo(
    () => (pedido?.items || []).filter((it) => Number(it.devolvible || 0) > 0),
    [pedido]
  );

  useEffect(() => {
    if (!open) return;
    setError("");
    setNota("");
    setCantidades({});
    // Preselección de zona de destino = zona de la que salió cada línea.
    const zi = {};
    for (const it of lineas) zi[it.id] = zonaOrigenDeLinea(it);
    setZonaPorItem(zi);
    loadZonasFromServer()
      .then((data) => setZonas(Array.isArray(data) ? data : []))
      .catch(() => setZonas([]));
  }, [open, lineas]);

  const opcionesZona = useMemo(() => {
    // Zonas del ayuntamiento + cualquier zona de origen que no esté ya en la lista.
    const vistas = new Set();
    const out = [];
    for (const z of zonas) {
      const id = String(z.id ?? z.apiId ?? z);
      if (vistas.has(id)) continue;
      vistas.add(id);
      out.push({ value: id, label: z.nombre || getZonaLabel(id) });
    }
    for (const it of lineas) {
      const zo = zonaPorItem[it.id];
      if (zo && !vistas.has(String(zo))) {
        vistas.add(String(zo));
        out.push({ value: String(zo), label: getZonaLabel(zo) });
      }
    }
    return out;
  }, [zonas, lineas, zonaPorItem]);

  const controlCls =
    "h-[var(--control-height-sm)] w-24 min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-right tabular text-body-sm outline-none focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-solid focus-visible:outline-ring";

  const submit = async () => {
    setError("");
    const payloadLineas = [];
    for (const it of lineas) {
      const raw = cantidades[it.id];
      const cant = Number(String(raw ?? "").replace(",", "."));
      if (!raw || cant <= 0) continue;
      if (cant > Number(it.devolvible) + 1e-9) {
        setError(`En «${nombreLinea(it)}» no puedes devolver más de ${formatCantidad(it.devolvible)}.`);
        return;
      }
      const zona = (zonaPorItem[it.id] || "").trim();
      if (!zona) {
        setError(`Elige la zona de destino para «${nombreLinea(it)}».`);
        return;
      }
      payloadLineas.push({ pedido_item_id: it.id, cantidad: cant, zona_destino: zona });
    }
    if (payloadLineas.length === 0) {
      setError("Indica cuánto devolver en al menos una línea.");
      return;
    }
    setBusy(true);
    try {
      await devolverPedido(pedido.id, { lineas: payloadLineas, nota: nota.trim() || null });
      onDone?.();
      onClose();
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || "No se pudo registrar la devolución.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(a) => !a && onClose()}>
      <DialogContent
        title={`Devolver material · pedido #${pedido?.id ?? ""}`}
        description="La empresa externa reintegra lo que le sobró. Cada línea vuelve a su lote de origen; el tope es lo servido menos lo ya devuelto."
        closeLabel="Cerrar"
        size="lg"
      >
        <div className="flex max-h-[70dvh] flex-col gap-4 overflow-y-auto">
          {error ? (
            <Alert tone="error" onDismiss={() => setError("")}>
              {error}
            </Alert>
          ) : null}

          {lineas.length === 0 ? (
            <p className="text-muted-foreground">No queda material devolvible en este pedido.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-body-sm">
                <thead>
                  <tr className="text-left text-caption uppercase text-muted-foreground">
                    <th className="p-2">Producto</th>
                    <th className="p-2">Tamaño</th>
                    <th className="p-2 text-right">Servido</th>
                    <th className="p-2 text-right">Devuelto</th>
                    <th className="p-2 text-right">Devolvible</th>
                    <th className="p-2 text-right">Devolver</th>
                    <th className="p-2">Zona destino</th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((it) => (
                    <tr key={it.id} className="border-t border-[var(--border)]">
                      <td className="p-2">{nombreLinea(it)}</td>
                      <td className="p-2">{it.tamano || "—"}</td>
                      <td className="tabular p-2 text-right">{formatCantidad(it.cantidad_servida)}</td>
                      <td className="tabular p-2 text-right">{formatCantidad(it.cantidad_devuelta)}</td>
                      <td className="tabular p-2 text-right font-[var(--font-weight-medium)]">
                        {formatCantidad(it.devolvible)}
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          max={String(it.devolvible)}
                          value={cantidades[it.id] ?? ""}
                          onChange={(e) => setCantidades((m) => ({ ...m, [it.id]: e.target.value }))}
                          aria-label={`Cantidad a devolver de ${nombreLinea(it)}`}
                          className={controlCls}
                        />
                      </td>
                      <td className="p-2">
                        <select
                          value={zonaPorItem[it.id] || ""}
                          onChange={(e) => setZonaPorItem((m) => ({ ...m, [it.id]: e.target.value }))}
                          aria-label={`Zona destino de ${nombreLinea(it)}`}
                          className="h-[var(--control-height-sm)] min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-body-sm outline-none focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-solid focus-visible:outline-ring"
                        >
                          <option value="">Elige zona</option>
                          {opcionesZona.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Field label="Nota (opcional)">
            <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Motivo o detalle de la devolución" />
          </Field>

          <div className="flex flex-col-reverse gap-2 border-t border-[var(--border)] pt-4 sm:flex-row sm:justify-end sm:gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button type="button" variant="primary" onClick={submit} disabled={busy || lineas.length === 0} loading={busy}>
              Registrar devolución
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
