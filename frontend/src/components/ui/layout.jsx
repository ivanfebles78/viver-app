import { cn } from "../../ui";

/**
 * PRIMITIVAS DE COMPOSICIÓN DE PÁGINA.
 *
 * Solo lo que ViverApp usa de verdad. `PageHeader`, `EmptyState`, `ErrorState`,
 * `Kpi`, `Card` y `Tabs` ya vienen del paquete de DevCon8 y no se duplican
 * aquí; esto cubre los huecos que el paquete no llena y que las pantallas
 * resuelven hoy con `<div style={{…}}>`.
 *
 * Ninguno de estos componentes declara un color, un radio ni una sombra: son
 * decisiones de DISPOSICIÓN. Por eso son tan cortos — y por eso merecen
 * existir, porque la disposición repetida a mano es justo lo que ha divergido
 * entre pantallas.
 */

/**
 * Cabecera de una sección DENTRO de una página.
 *
 * Ocupa el hueco de jerarquía que la aplicación no tenía: hoy solo existen
 * `h1` y `h2`, así que un bloque como "Lista de pedidos" se pinta como un
 * `<div>` a 18px y peso 900 que no es un encabezado para nadie que navegue por
 * estructura.
 */
export function SectionHeader({ title, description, actions, as: Tag = "h2", id, className }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-6 gap-y-2", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <Tag id={id} className="text-h4 font-[var(--font-weight-semibold)] text-foreground">
          {title}
        </Tag>
        {description && <p className="text-body-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Barra de acciones.
 *
 * `justify="between"` separa un grupo izquierdo de uno derecho; con un solo
 * hijo, alinea a la derecha, que es el caso habitual.
 */
export function Toolbar({ children, justify = "end", className }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        justify === "between" && "justify-between",
        justify === "end" && "justify-end",
        justify === "start" && "justify-start",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Barra de filtros.
 *
 * El patrón que hoy rompe la aplicación en móvil: Pedidos declara
 * `gridTemplateColumns: "140px 170px 180px 170px 1fr auto"` — 660px de columnas
 * fijas antes de la flexible, así que por debajo de ~800px se desborda.
 *
 * Aquí las columnas se adaptan con `auto-fit` y un mínimo, de modo que la
 * misma barra pasa de seis columnas a una sin ninguna media query escrita a
 * mano. Se renderiza como <search>, que es el landmark correcto para un
 * conjunto de controles de búsqueda y filtrado.
 */
export function FilterBar({ children, actions, minColumn = "180px", label = "Filtros", className }) {
  return (
    <search
      // `role="search"` explícito además del elemento: <search> es de 2023 y
      // el soporte de lectores de pantalla todavía es desigual, así que el rol
      // implícito no basta durante la transición.
      role="search"
      aria-label={label}
      className={cn("flex flex-col gap-3", className)}
    >
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${minColumn}, 100%), 1fr))` }}
      >
        {children}
      </div>
      {actions && <Toolbar justify="end">{actions}</Toolbar>}
    </search>
  );
}

/**
 * Pie de acciones de un formulario.
 *
 * La acción primaria va la ÚLTIMA, que es la convención de plataforma que ya
 * sigue `DialogContent` de DevCon8. En móvil se apilan a ancho completo, donde
 * dos botones pequeños uno al lado del otro son un objetivo táctil incómodo.
 */
export function FormActions({ children, className }) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 pt-2",
        "sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3",
        "[&>*]:w-full sm:[&>*]:w-auto",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Región con desbordamiento horizontal controlado.
 *
 * Para el contenido ancho que no se puede reflujar. La regla del sistema de
 * diseño es que desplace SU CONTENEDOR y nunca la página: un scroll horizontal
 * a nivel de documento saca de pantalla la cabecera y la navegación.
 *
 * `min-w-0` es imprescindible: como hijo de un flex, este contenedor asume
 * `min-width: auto` y se niega a encogerse por debajo del ancho intrínseco de
 * su contenido, así que el `overflow-x` nunca llega a activarse y desborda la
 * página entera.
 */
export function ScrollRegion({ children, label, className }) {
  return (
    <div
      // tabIndex=0 hace la región desplazable con el teclado. Sin él, quien no
      // usa ratón no puede llegar al contenido que queda fuera (SC 2.1.1).
      tabIndex={0}
      role="region"
      aria-label={label}
      className={cn(
        "min-w-0 overflow-x-auto",
        "outline-none focus-visible:outline-[length:var(--focus-ring-width)]",
        "focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2",
        className
      )}
    >
      {children}
    </div>
  );
}
