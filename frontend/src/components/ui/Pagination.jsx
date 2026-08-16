import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "../../ui";

/**
 * PAGINACIÓN POR NÚMERO DE PÁGINA.
 *
 * `DataTable` de DevCon8 trae paginación por CURSOR (anterior/siguiente), que
 * es lo que encaja con su API de plataforma. ViverApp no: AdminUsuarios,
 * Pedidos e Informes pagina en cliente sobre un array ya cargado y muestra
 * "página 2 de 7". Cambiar eso sería un cambio de comportamiento, no de
 * estilo, así que aquí se implementa lo que la aplicación realmente hace.
 *
 * El sistema de diseño sí especifica el componente (`component.pagination`),
 * solo que el paquete todavía no lo publica. Se construye contra esa
 * especificación: tamaño de control `sm`, fondo y color de selección para la
 * página activa, y el cambio de página anunciado por región viva.
 *
 * Candidato claro a subir aguas arriba.
 */

/** Ventana de páginas alrededor de la actual, con elipsis. */
function ventana(actual, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (actual <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (actual >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", actual - 1, actual, actual + 1, "…", total];
}

export default function Pagination({
  page,
  pageCount,
  onPageChange,
  /** Total de elementos, para el resumen textual. */
  totalItems,
  itemNoun = "resultado",
  itemNounPlural = "resultados",
  className,
}) {
  if (pageCount <= 1 && !totalItems) return null;

  const ir = (n) => onPageChange(Math.min(Math.max(1, n), pageCount));

  return (
    <nav
      aria-label="Paginación"
      className={["flex flex-wrap items-center justify-between gap-3", className].filter(Boolean).join(" ")}
    >
      {/*
        El recuento va en una región viva: al filtrar o cambiar de página, quien
        usa lector de pantalla debe enterarse de cuántos resultados quedan sin
        tener que ir a buscarlo (SC 4.1.3).
      */}
      <p className="text-body-sm text-muted-foreground" role="status" aria-live="polite">
        {typeof totalItems === "number" && (
          <>
            <span className="tabular">{totalItems}</span>{" "}
            {totalItems === 1 ? itemNoun : itemNounPlural}
          </>
        )}
        {pageCount > 1 && (
          <>
            {typeof totalItems === "number" ? " · " : ""}
            Página <span className="tabular">{page}</span> de <span className="tabular">{pageCount}</span>
          </>
        )}
      </p>

      {pageCount > 1 && (
        <ul className="flex items-center gap-1">
          <li>
            <Button
              variant="outline"
              size="icon-sm"
              label="Página anterior"
              disabled={page <= 1}
              onClick={() => ir(page - 1)}
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </Button>
          </li>

          {ventana(page, pageCount).map((n, i) =>
            n === "…" ? (
              <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-body-sm text-muted-foreground">
                …
              </li>
            ) : (
              <li key={n}>
                <Button
                  variant={n === page ? "secondary" : "ghost"}
                  size="icon-sm"
                  // aria-current es lo que anuncia "estás aquí"; el fondo solo
                  // lo comunica a quien ve la pantalla.
                  aria-current={n === page ? "page" : undefined}
                  aria-label={`Página ${n}`}
                  onClick={() => ir(n)}
                  className={n === page ? "tabular font-[var(--font-weight-semibold)]" : "tabular"}
                >
                  {n}
                </Button>
              </li>
            )
          )}

          <li>
            <Button
              variant="outline"
              size="icon-sm"
              label="Página siguiente"
              disabled={page >= pageCount}
              onClick={() => ir(page + 1)}
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </Button>
          </li>
        </ul>
      )}
    </nav>
  );
}
