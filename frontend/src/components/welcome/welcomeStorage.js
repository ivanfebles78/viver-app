/**
 * Preferencia de «mostrar la bienvenida al iniciar».
 *
 * Vive aparte del componente para que `WelcomeModal.jsx` exporte SÓLO un
 * componente: mezclar componentes y constantes en el mismo módulo rompe el
 * Fast Refresh de Vite, que entonces recarga la página entera en cada edición
 * en vez de conservar el estado.
 */

export const WELCOME_SEEN_KEY = "viverapp_welcome_seen";
export const WELCOME_SHOW_ON_START_KEY = "viverapp_welcome_show_on_start";

/**
 * ¿Se abre la bienvenida al arrancar?
 *
 * La primera vez sí, siempre. A partir de ahí manda lo que el usuario haya
 * marcado. Si `localStorage` no está disponible se devuelve `true`: es
 * preferible enseñarla de más que dejar a alguien sin saber qué es esto.
 */
export function shouldShowWelcomeOnStart() {
  try {
    if (window.localStorage.getItem(WELCOME_SEEN_KEY) !== "true") return true;
    return window.localStorage.getItem(WELCOME_SHOW_ON_START_KEY) === "true";
  } catch {
    return true;
  }
}

/** Guarda la preferencia y marca la bienvenida como vista. */
export function recordarPreferencia(showOnStart) {
  try {
    window.localStorage.setItem(WELCOME_SEEN_KEY, "true");
    window.localStorage.setItem(WELCOME_SHOW_ON_START_KEY, showOnStart ? "true" : "false");
  } catch {
    // Sin `localStorage` se pierde la preferencia, pero el modal se cierra
    // igualmente: no se bloquea al usuario por no poder recordar un ajuste.
  }
}

/** Preferencia guardada, para sincronizar la casilla al reabrir. */
export function leerPreferencia() {
  try {
    return window.localStorage.getItem(WELCOME_SHOW_ON_START_KEY) === "true";
  } catch {
    return false;
  }
}
