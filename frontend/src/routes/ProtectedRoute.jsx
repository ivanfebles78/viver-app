import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getStoredToken } from "../api/api";

/**
 * Guarda de AUTENTICACIÓN: sin sesión no se entra.
 *
 * La AUTORIZACIÓN por rol (qué rutas puede ver cada rol) sigue resolviéndose en
 * el shell, ahora contra `app/permissions.js`. No se ha movido aquí a propósito:
 * hacerlo cambiaría el momento en que se produce la redirección — antes de
 * montar en lugar de después — y esta fase no puede alterar comportamiento.
 * Queda anotado como candidato para una fase posterior.
 */

/**
 * ¿Es el token almacenado utilizable?
 *
 * `localStorage` solo guarda cadenas, así que un `setItem(k, undefined)` en
 * cualquier punto del código deja literalmente `"undefined"` guardado — un
 * valor que es *truthy* y que dejaba pasar la guarda. El usuario entraba, cada
 * llamada devolvía 401 y el interceptor le expulsaba: un bucle de login que
 * parece un fallo del backend.
 */
function hasUsableSession() {
  const token = getStoredToken();
  if (typeof token !== "string") return false;
  const trimmed = token.trim();
  if (trimmed === "") return false;
  if (trimmed === "undefined" || trimmed === "null") return false;
  return true;
}

export default function ProtectedRoute() {
  const location = useLocation();

  if (!hasUsableSession()) {
    // Se conserva el destino pretendido para que una fase posterior pueda
    // devolver al usuario donde iba tras iniciar sesión. Hoy Login no lo lee,
    // así que el comportamiento observable no cambia.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <Outlet />;
}
