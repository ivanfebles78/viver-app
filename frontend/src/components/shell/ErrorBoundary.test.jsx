/**
 * Pruebas del límite de error.
 *
 * Se rompe una pantalla hija a propósito, que es la única forma de comprobar
 * esto. React escribe el fallo en `console.error` aunque el límite lo capture,
 * así que se silencia durante estas pruebas para que el resultado se lea.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ErrorBoundary from "./ErrorBoundary";

/** Pantalla que revienta al renderizar, como haría un campo ausente del backend. */
function PantallaRota({ mensaje = "Cannot read properties of undefined (reading 'map')" }) {
  throw new Error(mensaje);
}

let errorSpy;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

describe("ErrorBoundary", () => {
  it("captura el fallo en lugar de dejar la pantalla en blanco", () => {
    render(
      <ErrorBoundary resetKey="/plataforma">
        <PantallaRota />
      </ErrorBoundary>
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("No hemos podido mostrar esta pantalla")).toBeInTheDocument();
  });

  it("NO expone el mensaje técnico de la excepción", () => {
    /*
     * Esta es la prueba de privacidad, y en una aplicación multi-tenant del
     * sector público no es un detalle: el mensaje puede arrastrar fragmentos
     * de la respuesta del backend — nombres, correos, identificadores de otro
     * ayuntamiento.
     */
    render(
      <ErrorBoundary resetKey="/x">
        <PantallaRota mensaje="500: usuario ana.perez@laguna.es del cliente_id 7 no encontrado" />
      </ErrorBoundary>
    );
    expect(document.body.textContent).not.toContain("ana.perez@laguna.es");
    expect(document.body.textContent).not.toContain("cliente_id");
    expect(document.body.textContent).not.toContain("500:");
  });

  it("muestra una referencia de incidencia para soporte", () => {
    render(
      <ErrorBoundary resetKey="/x">
        <PantallaRota />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Referencia para soporte/)).toBeInTheDocument();
    // Identificador corto y legible por teléfono, no un volcado de pila.
    const codigo = screen.getByText(/^[A-Z0-9]{6}$/);
    expect(codigo).toBeInTheDocument();
  });

  it("registra el diagnóstico completo en consola, no en la interfaz", () => {
    render(
      <ErrorBoundary resetKey="/plataforma">
        <PantallaRota mensaje="detalle interno" />
      </ErrorBoundary>
    );
    const registrado = errorSpy.mock.calls.some(
      (args) => typeof args[0] === "string" && args[0].includes("[ViverApp] Fallo al renderizar")
    );
    expect(registrado).toBe(true);
  });

  it("ofrece reintentar y vuelve a renderizar el hijo si ya funciona", async () => {
    const user = userEvent.setup();
    let debeFallar = true;
    function Inestable() {
      if (debeFallar) throw new Error("fallo transitorio");
      return <p>CONTENIDO RECUPERADO</p>;
    }

    render(
      <ErrorBoundary resetKey="/x">
        <Inestable />
      </ErrorBoundary>
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    debeFallar = false;
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("CONTENIDO RECUPERADO")).toBeInTheDocument();
  });

  it("cambiar de ruta limpia el error — navegar es la vía de escape", () => {
    let debeFallar = true;
    function Inestable() {
      if (debeFallar) throw new Error("fallo de esta ruta");
      return <p>OTRA PANTALLA</p>;
    }

    const { rerender } = render(
      <ErrorBoundary resetKey="/plataforma">
        <Inestable />
      </ErrorBoundary>
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    debeFallar = false;
    rerender(
      <ErrorBoundary resetKey="/dashboard">
        <Inestable />
      </ErrorBoundary>
    );
    expect(screen.getByText("OTRA PANTALLA")).toBeInTheDocument();
  });

  it("deja pasar el contenido cuando no hay fallo", () => {
    render(
      <ErrorBoundary resetKey="/x">
        <p>TODO BIEN</p>
      </ErrorBoundary>
    );
    expect(screen.getByText("TODO BIEN")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ofrece una salida de navegación además del reintento", () => {
    render(
      <ErrorBoundary resetKey="/x">
        <PantallaRota />
      </ErrorBoundary>
    );
    expect(screen.getByRole("button", { name: /Ir al panel de control/ })).toBeInTheDocument();
  });
});
