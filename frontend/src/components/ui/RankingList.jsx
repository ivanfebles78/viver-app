import { cn } from "../../ui";

/**
 * RANKING ORDENADO.
 *
 * Hermano de `ProportionBar`, y conviene explicar por qué no es él.
 * `ProportionBar` responde a «cómo se reparte el total» y por eso pinta una
 * barra apilada y una `<dl>`: sus filas son las partes de una misma tarta y
 * ninguna es «la primera». Un ranking responde a otra pregunta —«cuáles son
 * los cinco que más»— donde el ORDEN es el dato, el conjunto está recortado al
 * top N y la suma de lo mostrado no es el total.
 *
 * De ahí las tres diferencias:
 *
 *   - Es una `<ol>`. La posición la comunica la propia lista al lector de
 *     pantalla; el número dibujado es su equivalente visual, no la única
 *     fuente. En una `<dl>` no hay noción de orden.
 *   - Cada fila lleva su barra, alineadas todas a la misma izquierda, en vez
 *     de una barra apilada: comparar el 1.º con el 3.º es comparar longitudes
 *     desde el mismo origen.
 *   - Las barras se escalan contra el PRIMERO, no contra el total. Con cuotas
 *     reales del vivero —el más pedido ronda el 12 %— escalar contra el total
 *     dejaría las cinco barras en un hilo indistinguible.
 *
 * El color no comunica: todas las barras comparten tono. Lo que distingue una
 * fila de otra es la posición, la etiqueta y la cifra, que están en texto.
 * Funciona en blanco y negro y al imprimir (SC 1.4.1).
 */

/**
 * @param {Array}  items      [{ id, label, sublabel?, value, percent }]
 * @param {string} unit       Unidad de `value`, para el texto de cada fila.
 * @param {string} emptyLabel Qué decir cuando no hay nada que ordenar.
 */
export default function RankingList({ items = [], unit = "", emptyLabel = "Sin datos", className }) {
  if (items.length === 0) {
    return <p className={cn("text-body-sm text-muted-foreground", className)}>{emptyLabel}</p>;
  }

  const maximo = Math.max(...items.map((i) => Number(i.value) || 0), 0);
  /** Un decimal y coma decimal: es la convención en español. */
  const pctTexto = (v) => (Number(v) || 0).toFixed(1).replace(".", ",");

  return (
    <ol className={cn("flex flex-col", className)}>
      {items.map((item, i) => {
        // Mínimo visible del 2 %: una barra de cero ancho para un valor que no
        // es cero se lee como «no hay dato», que es justo lo contrario.
        const ancho = maximo > 0 ? Math.max((Number(item.value) || 0) / maximo * 100, 2) : 0;

        return (
          <li
            key={item.id ?? `${i}-${item.label}`}
            className="flex items-start gap-3 border-b border-border py-2 last:border-b-0"
          >
            <span
              // El número visible duplica lo que la <ol> ya dice; se oculta al
              // árbol de accesibilidad para no anunciar «1, uno».
              aria-hidden="true"
              className={cn(
                "tabular mt-0.5 flex size-5 shrink-0 items-center justify-center",
                "rounded-[var(--radius-xs)] bg-muted text-caption",
                "font-[var(--font-weight-medium)] text-muted-foreground"
              )}
            >
              {i + 1}
            </span>

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                {/* `break-words`, no `truncate`: los nombres científicos y los
                    barrios largos deben poder leerse enteros a 320px. */}
                <span className="min-w-0 break-words text-body-sm font-[var(--font-weight-medium)]">
                  {item.label}
                </span>
                <span className="tabular shrink-0 text-caption text-muted-foreground">
                  {pctTexto(item.percent)}% ·{" "}
                  <span className="font-[var(--font-weight-medium)] text-foreground">
                    {item.value}
                  </span>
                  {unit ? ` ${unit}` : ""}
                </span>
              </div>

              {item.sublabel && (
                <span className="break-words text-caption text-muted-foreground">{item.sublabel}</span>
              )}

              <div
                aria-hidden="true"
                className="h-1.5 w-full overflow-hidden rounded-[var(--radius-full)] bg-muted"
              >
                <div
                  className="h-full rounded-[var(--radius-full)] bg-[var(--chart-1)]"
                  style={{ width: `${ancho}%` }}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
