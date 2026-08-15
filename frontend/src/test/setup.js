import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

/*
 * Huecos de jsdom.
 *
 * jsdom no implementa estas APIs, pero el shell de DevCon8 y Radix las usan de
 * forma legítima. Sin ellas las pruebas fallan por el entorno, no por el
 * código — y ese es el peor tipo de fallo, porque parece un fallo real.
 *
 * Se definen aquí, una sola vez, en lugar de repetirlas en cada fichero.
 */

// El proveedor de tema consulta la preferencia del sistema.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

// Radix mide sus flotantes (menús, tooltips, sheets) con ResizeObserver.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Los menús de Radix desplazan el elemento activo a la vista al navegar con
// el teclado.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// Radix comprueba la captura de puntero al abrir overlays.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

// Cada prueba parte de un DOM limpio y de un localStorage limpio. Sin esto, una
// prueba que escribe el token de sesión deja autenticada a la siguiente, y los
// fallos aparecen o desaparecen según el orden de ejecución.
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllTimers();
  // El shell arranca un intervalo de 30 s para refrescar los avisos; sin
  // limpiarlo, sigue vivo entre pruebas y dispara peticiones contra dobles ya
  // restaurados.
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-theme");
});
