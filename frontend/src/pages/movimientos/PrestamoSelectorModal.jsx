import { Button, Dialog, DialogContent, EmptyState } from "../../ui";
import { formatFechaCanaria } from "../../utils/fecha";
import { buildLabelDestino } from "../movimientos.logic";

/*
 * SELECTOR DE PRÉSTAMO ACTIVO.
 *
 * Lista los préstamos con cantidad pendiente de devolver. El cálculo de
 * pendiente lo hace el asistente y llega ya resuelto en `_pendiente`.
 *
 * Antes vivía dentro del `return` del asistente como un `div` fijo más. Sacarlo
 * a su propio componente lo hace legible y le da trampa de foco y Escape.
 */

export default function PrestamoSelectorModal({ open, prestamos, onClose, onSelect }) {
  return (
    <Dialog open={open} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent
        title="Préstamos activos"
        description="Elige el préstamo que se está devolviendo."
        closeLabel="Cerrar"
        size="lg"
      >
        <div className="flex flex-col gap-3">
          {prestamos.length === 0 ? (
            <EmptyState
              title="No hay préstamos activos"
              description="No queda material prestado pendiente de devolución."
            />
          ) : (
            <ul className="flex max-h-96 flex-col overflow-y-auto rounded-[var(--radius-md)] border border-border">
              {prestamos.map((m) => (
                <li key={m.id} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => onSelect(m)}
                    className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="text-body-sm font-[var(--font-weight-medium)]">
                      Préstamo #{m.id} · {formatFechaCanaria(m.fecha_movimiento)}
                    </span>
                    <span className="tabular text-caption text-muted-foreground">
                      Prestado: {m._prestado} · Devuelto: {m._devuelto} · Pendiente: {m._pendiente}
                    </span>
                    <span className="text-caption text-muted-foreground">{buildLabelDestino(m)}</span>
                  </button>
                </li>
              ))}
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
