import { Link } from "react-router-dom";

/**
 * Adaptador entre React Router y `@devcon8/ui`.
 *
 * El paquete de UI no importa ningún router a propósito: recibe un
 * `linkComponent` con la forma `{ href, className, children, aria-current }`.
 * Eso es exactamente lo que hace que el shell de DevCon8 sea utilizable fuera
 * de Next.js, y todo lo que ViverApp necesita para reutilizarlo es traducir
 * `href` a `to`.
 *
 * Deliberadamente NO se usa `NavLink`: el estado activo lo resuelve la
 * navegación de DevCon8 a partir de `currentPath` y lo comunica con
 * `aria-current`. Tener dos fuentes de verdad para "página actual" es cómo se
 * acaba con un elemento resaltado y otro anunciado.
 */
export default function AppLink({ href, children, ...rest }) {
  return (
    <Link to={href} {...rest}>
      {children}
    </Link>
  );
}
