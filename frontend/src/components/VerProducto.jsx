import { useState } from "react";

import { usePlantImage } from "../utils/plantImages";
import { Dialog, DialogContent } from "../ui";

/**
 * DETALLE DE UN PRODUCTO.
 *
 * El nombre del producto es SIEMPRE pulsable (tenga foto o no) y abre una ficha
 * con su SKU, nombres y clasificación, además de la imagen de la planta si la
 * hay. A diferencia de `VerPlanta` (que solo muestra la foto y solo si existe),
 * esta ficha siempre está disponible porque su razón de ser es el SKU.
 *
 * `stopPropagation` evita disparar el `onClick` de la fila que lo contiene.
 */
function Campo({ label, value }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-3">
      <dt className="text-caption uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words [overflow-wrap:anywhere] font-[var(--font-weight-medium)]">{value || "—"}</dd>
    </div>
  );
}

export default function VerProducto({ producto, stopPropagation = false, children }) {
  const [open, setOpen] = useState(false);
  const p = producto || {};

  const cientifico = p.nombre_cientifico || p.producto_nombre_cientifico || null;
  const natural = p.nombre_natural || p.producto_nombre_natural || p.nombre || null;
  const url = usePlantImage(cientifico);
  const titulo = cientifico || natural || "Producto";

  const handleOpen = (e) => {
    if (stopPropagation && e) e.stopPropagation();
    setOpen(true);
  };

  return (
    <>
      {/* Botón de verdad: hereda foco, Enter y Espacio. El subrayado indica que
          se puede pulsar sin depender solo del color. */}
      <button
        type="button"
        onClick={handleOpen}
        title="Ver detalle del producto"
        className="cursor-pointer bg-transparent p-0 text-start text-[color:var(--primary)] underline decoration-2 underline-offset-2 outline-none focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-solid focus-visible:outline-ring"
      >
        {children}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={titulo} description="Detalle del producto." closeLabel="Cerrar" size="lg">
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label="SKU" value={p.sku} />
              <Campo label="Nombre científico" value={cientifico} />
              <Campo label="Nombre común" value={natural} />
              <Campo label="Categoría" value={p.categoria} />
              <Campo label="Subcategoría" value={p.subcategoria} />
            </dl>

            {url ? (
              <div className="flex justify-center">
                <img
                  src={url}
                  alt={`Fotografía de ${titulo}`}
                  className="max-h-[60dvh] max-w-full rounded-[var(--radius-md)]"
                />
              </div>
            ) : (
              <p className="text-body-sm text-muted-foreground">Este producto no tiene imagen.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
