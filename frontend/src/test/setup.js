import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Cada prueba parte de un DOM limpio y de un localStorage limpio. Sin esto, una
// prueba que escribe el token de sesión deja autenticada a la siguiente, y los
// fallos aparecen o desaparecen según el orden de ejecución.
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
