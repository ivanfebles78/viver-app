import { Link } from "react-router-dom";

import { buttonVariants, cn } from "../../ui";

/**
 * ENLACE CON ASPECTO DE BOTÓN.
 *
 * Existe por un DEFECTO DE AGUAS ARRIBA documentado en
 * `docs/upstream-findings.md`: `Button` de `@devcon8/ui` no funciona con
 * `asChild`. Renderiza siempre `{loading && <spinner/>}` antes de sus hijos,
 * así que el `Slot` de Radix recibe SIEMPRE dos hijos —`false` y el elemento— y
 * lanza «Slot failed to slot onto its children», incluso con un único hijo.
 *
 * No se parchea el paquete vendorizado. Aquí se aplican sus mismas clases con
 * `buttonVariants` sobre un `<Link>` de React Router, que además es lo
 * semánticamente correcto: **navegar es un enlace, no un botón**. Un `<button>`
 * que navega no se puede abrir en una pestaña nueva, no ofrece menú
 * contextual y se anuncia como «botón» en lugar de «enlace».
 *
 * Cuando el defecto se corrija aguas arriba, este componente puede seguir
 * existiendo por la razón semántica, o sustituirse por `<Button asChild>`.
 */
export default function LinkButton({
  to,
  variant = "secondary",
  size = "md",
  className,
  children,
  ...rest
}) {
  return (
    <Link to={to} className={cn(buttonVariants({ variant, size }), className)} {...rest}>
      {children}
    </Link>
  );
}
