import { useMemo, useState } from "react";

import { Button, Dialog, DialogContent, EmptyState } from "../../ui";
import SearchField from "../../components/ui/SearchField";
import { safeArray } from "../movimientos.logic";

/*
 * SELECTOR DE PEDIDO APROBADO.
 *
 * El filtro es el MISMO que en main: solo `APROBADO` y `APROBADO_PARCIAL`, y la
 * búsqueda recorre id, solicitante, dirección y las líneas del pedido.
 *
 * Presentación nueva: `Dialog` en vez de un `div` fijo, y una lista de botones
 * en vez de `div`s con `onClick` — antes no se podía elegir un pedido con el
 * teclado.
 */

export default function PedidoSelectorModal({ open, pedidos, onClose, onSelect }) {
  const [texto, setTexto] = useState("");

  const pedidosFiltrados = useMemo(() => {
    const t = texto.trim().toLowerCase();
    const SERVICEABLE = new Set(["APROBADO", "APROBADO_PARCIAL"]);
    return safeArray(pedidos)
      .filter((p) => SERVICEABLE.has(String(p?.estado || "").toUpperCase()))
      .filter((p) => {
        if (!t) return true;
        const base = [
          p?.id,
          p?.solicitante_username,
          p?.distrito_destino,
          p?.barrio_destino,
          p?.direccion_destino,
          ...safeArray(p?.items).map(
            (it) => `${it?.producto_nombre || ""} ${it?.tamano || ""} ${it?.cantidad || ""}`
          ),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return base.includes(t);
      });
  }, [pedidos, texto]);

  return (
    <Dialog open={open} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent
        title="Pedidos aprobados"
        description="Al asociar un pedido se rellenan producto, cantidad y destino."
        closeLabel="Cerrar"
        size="lg"
      >
        <div className="flex flex-col gap-3">
          <SearchField
            label="Buscar pedido"
            hideLabel={false}
            value={texto}
            onChange={setTexto}
            placeholder="Número, solicitante, dirección o producto"
          />

          {pedidosFiltrados.length === 0 ? (
            <EmptyState
              title="No hay pedidos que coincidan"
              description={
                texto
                  ? "Prueba con otro término de búsqueda."
                  : "No hay pedidos aprobados pendientes de servir."
              }
            />
          ) : (
            <ul className="flex max-h-96 flex-col overflow-y-auto rounded-[var(--radius-md)] border border-border">
              {pedidosFiltrados.map((p) => {
                const destino = [p?.distrito_destino, p?.barrio_destino, p?.direccion_destino]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={p.id} className="border-b border-border last:border-b-0">
                    {/* Un botón de verdad: antes era un div con onClick y no se
                        podía llegar con el teclado. */}
                    <button
                      type="button"
                      onClick={() => onSelect(p)}
                      className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <span className="text-body-sm font-[var(--font-weight-medium)]">
                        Pedido #{p.id}
                        {p.solicitante_username ? ` · ${p.solicitante_username}` : ""}
                      </span>
                      {destino && (
                        <span className="text-caption text-muted-foreground">{destino}</span>
                      )}
                      <span className="tabular text-caption text-muted-foreground">
                        {safeArray(p?.items).length} línea
                        {safeArray(p?.items).length === 1 ? "" : "s"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
