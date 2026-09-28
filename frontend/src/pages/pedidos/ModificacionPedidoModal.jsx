import { useMemo, useState } from "react";

import { Button, Dialog, DialogContent, Field, Input } from "../../ui";
import { Alert } from "../../components/ui/feedback";
import { formatCantidad } from "../../utils/numero";
import { solicitarModificacionPedido } from "../../api/api";

/**
 * SOLICITUD DE MODIFICACIÓN DE UN PEDIDO YA APROBADO.
 *
 * Un técnico/gestor propone cambios sobre las líneas de un pedido aprobado:
 * cambiar cantidades, quitar líneas o añadir productos nuevos. La solicitud va
 * al responsable (Aprobaciones), que la aprueba o deniega línea a línea. Mientras
 * exista una solicitud pendiente el pedido queda "congelado" (no servible).
 */

const TAMANOS = ["Semillero", "M12", "M20", "M35"];

const nombreLinea = (it) =>
  it.producto_nombre_cientifico || it.producto_nombre_natural || it.producto_nombre || `Producto #${it.producto_id}`;

const nombreProducto = (p) =>
  p?.nombre_cientifico || p?.producto_nombre_cientifico || p?.nombre || p?.nombre_natural || `Producto #${p?.id}`;

const numCtrl =
  "h-[var(--control-height-sm)] w-24 min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-right tabular text-body-sm outline-none focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-solid focus-visible:outline-ring";
const selCtrl =
  "h-[var(--control-height-sm)] min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-body-sm outline-none focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-solid focus-visible:outline-ring";

export default function ModificacionPedidoModal({ open, pedido, productos, onClose, onDone }) {
  const lineas = useMemo(() => (pedido?.items || []).filter((it) => Number(it.cantidad || 0) >= 0), [pedido]);

  const [nuevaCantidad, setNuevaCantidad] = useState({}); // { [itemId]: valor }
  const [quitar, setQuitar] = useState({}); // { [itemId]: bool }
  const [nuevos, setNuevos] = useState([]); // [{ producto_id, tamano, cantidad }]
  const [addProducto, setAddProducto] = useState("");
  const [addTamano, setAddTamano] = useState("");
  const [addCantidad, setAddCantidad] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const productosOrdenados = useMemo(
    () =>
      [...(productos || [])].sort((a, b) => String(nombreProducto(a)).localeCompare(String(nombreProducto(b)), "es")),
    [productos]
  );

  const cantidadDe = (it) => {
    const raw = nuevaCantidad[it.id];
    return raw === undefined || raw === "" ? Number(it.cantidad || 0) : Number(String(raw).replace(",", "."));
  };

  const anadirNuevo = () => {
    setError("");
    const pid = Number(addProducto);
    const cant = Number(String(addCantidad).replace(",", "."));
    if (!pid) {
      setError("Elige un producto para añadir.");
      return;
    }
    if (!addTamano) {
      setError("Elige el tamaño del producto a añadir.");
      return;
    }
    if (!cant || cant <= 0) {
      setError("Indica una cantidad mayor que 0 para el producto a añadir.");
      return;
    }
    setNuevos((prev) => [...prev, { producto_id: pid, tamano: addTamano, cantidad: cant }]);
    setAddProducto("");
    setAddTamano("");
    setAddCantidad("");
  };

  const quitarNuevo = (idx) => setNuevos((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    setError("");
    const cambios = [];
    for (const it of lineas) {
      const servida = Number(it.cantidad_servida || 0);
      if (quitar[it.id]) {
        if (servida > 0) {
          setError(`No puedes quitar «${nombreLinea(it)}»: ya tiene ${formatCantidad(servida)} servidas.`);
          return;
        }
        cambios.push({ tipo: "remove", pedido_item_id: it.id, producto_id: it.producto_id, cantidad_propuesta: 0 });
        continue;
      }
      const nueva = cantidadDe(it);
      if (Number.isNaN(nueva) || nueva < 0) {
        setError(`La cantidad de «${nombreLinea(it)}» no es válida.`);
        return;
      }
      if (nueva === Number(it.cantidad || 0)) continue; // sin cambio
      if (nueva < servida) {
        setError(`«${nombreLinea(it)}» no puede quedar por debajo de lo ya servido (${formatCantidad(servida)}).`);
        return;
      }
      cambios.push({ tipo: "update", pedido_item_id: it.id, producto_id: it.producto_id, cantidad_propuesta: nueva });
    }
    for (const n of nuevos) {
      cambios.push({ tipo: "add", producto_id: n.producto_id, tamano: n.tamano, cantidad_propuesta: n.cantidad });
    }
    if (cambios.length === 0) {
      setError("No has indicado ningún cambio.");
      return;
    }
    setBusy(true);
    try {
      await solicitarModificacionPedido(pedido.id, { cambios, nota: nota.trim() || null });
      onDone?.();
      onClose();
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || "No se pudo enviar la solicitud de modificación.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(a) => !a && onClose()}>
      <DialogContent
        title={`Solicitar cambio · pedido #${pedido?.id ?? ""}`}
        description="Propón cambios sobre este pedido aprobado. La solicitud irá al responsable; el pedido quedará congelado (no servible) hasta que se decida."
        closeLabel="Cerrar"
        size="lg"
      >
        <div className="flex max-h-[70dvh] flex-col gap-4 overflow-y-auto">
          {error ? (
            <Alert tone="error" onDismiss={() => setError("")}>
              {error}
            </Alert>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-body-sm">
              <thead>
                <tr className="text-left text-caption uppercase text-muted-foreground">
                  <th className="p-2">Producto</th>
                  <th className="p-2">Tamaño</th>
                  <th className="p-2 text-right">Actual</th>
                  <th className="p-2 text-right">Servido</th>
                  <th className="p-2 text-right">Nueva cantidad</th>
                  <th className="p-2 text-center">Quitar</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((it) => {
                  const isQuitar = !!quitar[it.id];
                  return (
                    <tr key={it.id} className="border-t border-[var(--border)]">
                      <td className="p-2">{nombreLinea(it)}</td>
                      <td className="p-2">{it.tamano || "—"}</td>
                      <td className="tabular p-2 text-right">{formatCantidad(it.cantidad)}</td>
                      <td className="tabular p-2 text-right">{formatCantidad(it.cantidad_servida)}</td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          min={String(it.cantidad_servida || 0)}
                          step="0.01"
                          value={nuevaCantidad[it.id] ?? String(it.cantidad ?? "")}
                          disabled={isQuitar}
                          onChange={(e) => setNuevaCantidad((m) => ({ ...m, [it.id]: e.target.value }))}
                          aria-label={`Nueva cantidad de ${nombreLinea(it)}`}
                          className={numCtrl + (isQuitar ? " opacity-50" : "")}
                        />
                      </td>
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={isQuitar}
                          onChange={(e) => setQuitar((m) => ({ ...m, [it.id]: e.target.checked }))}
                          aria-label={`Quitar ${nombreLinea(it)} del pedido`}
                          className="size-4 accent-[var(--danger)]"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Añadir productos nuevos al pedido. */}
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] p-3">
            <div className="mb-2 text-body-sm font-[var(--font-weight-semibold)]">Añadir producto nuevo</div>
            <div className="flex flex-wrap items-end gap-2">
              <select
                value={addProducto}
                onChange={(e) => setAddProducto(e.target.value)}
                aria-label="Producto a añadir"
                className={selCtrl + " flex-1"}
              >
                <option value="">Elige producto…</option>
                {productosOrdenados.map((p) => (
                  <option key={p.id} value={p.id}>
                    {nombreProducto(p)}
                  </option>
                ))}
              </select>
              <select
                value={addTamano}
                onChange={(e) => setAddTamano(e.target.value)}
                aria-label="Tamaño del producto a añadir"
                className={selCtrl}
              >
                <option value="">Tamaño…</option>
                {TAMANOS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                value={addCantidad}
                onChange={(e) => setAddCantidad(e.target.value)}
                placeholder="Cant."
                aria-label="Cantidad del producto a añadir"
                className={numCtrl}
              />
              <Button type="button" variant="secondary" size="sm" onClick={anadirNuevo}>
                + Añadir
              </Button>
            </div>

            {nuevos.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-1">
                {nuevos.map((n, idx) => {
                  const p = productos?.find((x) => x.id === n.producto_id);
                  return (
                    <li
                      key={`${n.producto_id}-${n.tamano}-${idx}`}
                      className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-body-sm"
                    >
                      <span>
                        {nombreProducto(p)} · {n.tamano} · {formatCantidad(n.cantidad)}
                      </span>
                      <button
                        type="button"
                        onClick={() => quitarNuevo(idx)}
                        className="text-caption font-[var(--font-weight-semibold)] text-[var(--danger-subtle-foreground)]"
                      >
                        Quitar
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          <Field label="Nota (opcional)">
            <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Motivo del cambio para el responsable" />
          </Field>

          <div className="flex flex-col-reverse gap-2 border-t border-[var(--border)] pt-4 sm:flex-row sm:justify-end sm:gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button type="button" variant="primary" onClick={submit} disabled={busy} loading={busy}>
              Enviar solicitud
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
