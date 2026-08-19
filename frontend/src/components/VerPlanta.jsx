import { useState } from "react";

import { usePlantImage } from "../utils/plantImages";
import { Button, Dialog, DialogContent } from "../ui";

/**
 * VER IMAGEN DE LA PLANTA.
 *
 * Tres formas de invocarlo, con la misma regla de fondo: **si no hay imagen no
 * se ofrece nada**, para no prometer algo que al pulsar no aparece.
 *
 *   · `icon`   — botón pequeño para las celdas de una tabla.
 *   · `button` — botón con texto, para una ficha.
 *   · `link`   — el propio nombre del producto es lo pulsable. Sin imagen se
 *                devuelven los hijos tal cual, sin ningún adorno.
 *
 * `stopPropagation` evita disparar el `onClick` de la fila que lo contiene.
 *
 * El contenedor era un `div position:fixed` hecho a mano —sin trampa de foco,
 * sin Escape y sin devolver el foco al cerrarse—; ahora es el `Dialog` del
 * sistema, que hace las tres cosas.
 */
export default function VerPlanta({
  nombreCientifico,
  nombreNatural,
  variant = "icon",
  stopPropagation = true,
  children,
}) {
  const url = usePlantImage(nombreCientifico);
  const [open, setOpen] = useState(false);

  const titulo = nombreCientifico || nombreNatural || "Planta";

  const handleOpen = (e) => {
    if (stopPropagation && e) e.stopPropagation();
    setOpen(true);
  };

  const modal = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        title={titulo}
        description={nombreNatural && nombreNatural !== titulo ? nombreNatural : "Imagen de la planta."}
        closeLabel="Cerrar"
        size="lg"
      >
        <div className="flex justify-center">
          <img
            src={url}
            alt={`Fotografía de ${titulo}`}
            className="max-h-[70dvh] max-w-full rounded-[var(--radius-md)]"
          />
        </div>
      </DialogContent>
    </Dialog>
  );

  /* Modo enlace: el nombre del producto es lo pulsable, sólo si hay imagen. */
  if (variant === "link") {
    if (!url) return <>{children}</>;
    return (
      <>
        {/*
         * Es un botón de verdad, no un `span` con `role`: así hereda el foco,
         * el Enter y el Espacio del navegador. El subrayado indica que se puede
         * pulsar sin depender del color.
         */}
        <button
          type="button"
          onClick={handleOpen}
          title="Ver imagen de la planta"
          className="cursor-pointer bg-transparent p-0 text-start text-[color:var(--primary)] underline decoration-2 underline-offset-2 outline-none focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-solid focus-visible:outline-ring"
        >
          {children}
        </button>
        {modal}
      </>
    );
  }

  // Sin imagen no se ofrece el control: pulsarlo no mostraría nada.
  if (!url) return null;

  const esBoton = variant === "button";
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size={esBoton ? "md" : "sm"}
        onClick={handleOpen}
        title="Ver imagen de la planta"
        aria-label={esBoton ? undefined : `Ver imagen de ${titulo}`}
      >
        {esBoton ? "Ver imagen" : "Imagen"}
      </Button>
      {modal}
    </>
  );
}
