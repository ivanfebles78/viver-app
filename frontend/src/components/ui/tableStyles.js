/**
 * CLASES COMPARTIDAS DE TABLA Y FORMULARIO DENSOS.
 *
 * Informes y Pedidos pintan tablas operativas: se consultan a diario, se
 * imprimen, y su densidad está elegida a propósito —una tabla con más aire se
 * lee peor, no mejor—. Ninguna primitiva del sistema cubre ese caso, así que
 * las dos pantallas resuelven el borde, el relleno y la tipografía con clases
 * de token propias.
 *
 * Hasta ahora las declaraban por separado, con el mismo valor exacto en las
 * dos. Eso no es un problema de estilo: es un punto de divergencia silenciosa.
 * Ajustar el relleno de una celda en una pantalla y no en la otra deja dos
 * tablas que se parecen sin ser iguales, y nadie lo nota hasta que se imprimen
 * juntas.
 *
 * Todo lo de aquí se expresa en TOKENS, no en valores crudos: no es una vía
 * para saltarse el sistema de diseño, es la parte del sistema que estas dos
 * pantallas comparten y que el paquete todavía no expone.
 */

/** Contenedor de tarjeta con el relleno de tarjeta del sistema. */
export const CARD_CLS =
  "rounded-[var(--radius-lg)] border border-border bg-card p-[var(--card-padding)]";

/** Celda de cabecera. */
export const TH =
  "border-b border-border px-2.5 py-2 text-left text-caption " +
  "font-[var(--font-weight-medium)] text-muted-foreground";

/** Celda de datos. */
export const TD = "border-b border-border px-2.5 py-2 align-top text-body-sm";

/**
 * Control de formulario en línea, con el mismo anillo de foco que las
 * primitivas del sistema para que un recorrido con teclado no cambie de aspecto
 * a mitad de pantalla.
 */
export const INPUT_CLS =
  "h-[var(--input-height)] w-full rounded-[var(--radius-md)] border border-input bg-background px-3 text-body-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
