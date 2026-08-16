import { cn } from "../../ui";

/**
 * DISTRIBUCIÓN PARTE-TODO.
 *
 * Sustituye a los tres gráficos de anillo del panel. La razón es de densidad y
 * de lectura, y merece explicarse porque es un cambio de FORMA, no de dato:
 *
 *   - Un anillo para tres o cuatro valores ocupa 180px de alto para comunicar
 *     lo que una barra y una lista comunican en 24px por fila. El panel tenía
 *     tres anillos en línea y, por debajo de 900px, no cabían.
 *   - Comparar dos sectores de un anillo exige juzgar ángulos. Comparar dos
 *     barras alineadas a la misma izquierda es inmediato.
 *   - Los anillos anteriores se distinguían SOLO por color (SC 1.4.1). Aquí
 *     cada fila lleva etiqueta, valor y porcentaje: el color acompaña, no
 *     comunica. Funciona en blanco y negro y al imprimir.
 *
 * Se conservan exactamente los mismos números que mostraba el anillo.
 *
 * Los colores salen de --chart-1…8 EN ORDEN. El sistema resolvió ese orden
 * para maximizar la separación de luminancia entre series contiguas en los dos
 * modos, así que reordenarlos por gusto rompería justo lo que los hace
 * distinguibles.
 */

/** Serie categórica del sistema de diseño, en su orden resuelto. */
const SERIES = [
  "var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)",
  "var(--chart-5)", "var(--chart-6)", "var(--chart-7)", "var(--chart-8)",
];

/** Color de una fila: el explícito si lo hay, si no el de la serie por índice. */
function colorDe(item, indice) {
  return item.color || SERIES[indice % SERIES.length];
}

/**
 * @param {string} title       Encabezado de la sección.
 * @param {Array}  items       [{ label, value, color?, status? }]
 * @param {number} total       Denominador. Si se omite, la suma de los valores.
 * @param {string} unit        Nombre de la unidad, para el resumen.
 * @param {string} emptyLabel  Qué decir cuando no hay datos.
 */
export default function ProportionBar({ title, items = [], total, unit, emptyLabel = "Sin datos", className }) {
  const suma = items.reduce((acc, i) => acc + Number(i.value || 0), 0);
  const denominador = typeof total === "number" && total > 0 ? total : suma;

  if (denominador <= 0) {
    return (
      <div className={cn("flex flex-col gap-3", className)}>
        {title && <h3 className="text-h5 font-[var(--font-weight-semibold)]">{title}</h3>}
        <p className="text-body-sm text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  }

  const pct = (v) => (Number(v || 0) / denominador) * 100;
  /** Un decimal, con coma: es la convención en español. */
  const pctTexto = (v) => pct(v).toFixed(1).replace(".", ",");

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {title && <h3 className="text-h5 font-[var(--font-weight-semibold)]">{title}</h3>}

      {/*
        La barra apilada es un resumen VISUAL; el detalle accesible está en la
        lista de abajo, así que aquí se oculta al árbol de accesibilidad para no
        anunciar dos veces lo mismo.
      */}
      <div
        aria-hidden="true"
        className="flex h-2 w-full overflow-hidden rounded-[var(--radius-full)] bg-[var(--muted)]"
      >
        {items.map((item, i) => (
          <span
            // La etiqueta puede repetirse —dos zonas homónimas en municipios
            // distintos, por ejemplo—; el índice sobre una lista ya ordenada de
            // forma determinista, no.
            key={`${i}-${item.label}`}
            style={{ width: `${pct(item.value)}%`, background: colorDe(item, i) }}
            className="h-full"
          />
        ))}
      </div>

      <dl className="flex flex-col">
        {items.map((item, i) => (
          <div
            key={`${i}-${item.label}`}
            className="flex items-center gap-3 border-b border-border py-1.5 last:border-b-0"
          >
            <span
              aria-hidden="true"
              style={{ background: colorDe(item, i) }}
              className="size-2.5 shrink-0 rounded-[var(--radius-xs)]"
            />
            <dt className="min-w-0 flex-1 truncate text-body-sm">{item.label}</dt>
            <dd className="tabular text-body-sm font-[var(--font-weight-medium)]">{item.value}</dd>
            <dd className="tabular w-14 text-right text-caption text-muted-foreground">
              {pctTexto(item.value)}%
            </dd>
          </div>
        ))}
      </dl>

      {unit && (
        <p className="text-caption text-muted-foreground">
          Total: <span className="tabular">{denominador}</span> {unit}
        </p>
      )}
    </div>
  );
}
