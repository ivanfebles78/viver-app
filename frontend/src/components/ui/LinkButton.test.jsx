/**
 * Pruebas del enlace con aspecto de botón.
 *
 * Además de probar el componente, este archivo DOCUMENTA el defecto de aguas
 * arriba que lo justifica (UF-1): si algún día `Button asChild` empieza a
 * funcionar, la prueba correspondiente fallará y avisará de que el rodeo ya no
 * es necesario por ese motivo.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { Button } from "../../ui";
import LinkButton from "./LinkButton";

const pintar = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("LinkButton", () => {
  it("es un ENLACE, no un botón", () => {
    /*
     * Un <button> que navega no se abre en pestaña nueva, no ofrece menú
     * contextual y los lectores de pantalla lo anuncian como «botón», que es
     * una promesa distinta de la que cumple.
     */
    pintar(<LinkButton to="/productos">Ver productos</LinkButton>);
    const el = screen.getByRole("link", { name: "Ver productos" });
    expect(el.tagName).toBe("A");
    expect(el).toHaveAttribute("href", "/productos");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("aplica las clases del sistema, no unas propias", () => {
    // El objetivo es que sea indistinguible de un Button: si dejara de usar
    // buttonVariants, se separaría visualmente en la siguiente versión.
    const { container } = pintar(<LinkButton to="/x" variant="primary">Ir</LinkButton>);
    const enlace = container.querySelector("a");
    render(<Button variant="primary">Ir</Button>);
    const boton = screen.getByRole("button", { name: "Ir" });

    // Comparten las clases de variante y tamaño.
    const clasesEnlace = new Set(enlace.className.split(/\s+/));
    for (const c of boton.className.split(/\s+/)) {
      if (c) expect(clasesEnlace.has(c)).toBe(true);
    }
  });

  it("propaga los atributos, para poder abrirlo en pestaña nueva", () => {
    pintar(
      <LinkButton to="/x" target="_blank" rel="noreferrer">
        Ir
      </LinkButton>
    );
    expect(screen.getByRole("link", { name: "Ir" })).toHaveAttribute("target", "_blank");
  });
});

describe("UF-1 · el defecto de aguas arriba sigue ahí", () => {
  it("`Button asChild` lanza, incluso con un único hijo", () => {
    /*
     * Reproducción mínima del defecto documentado en
     * docs/upstream-findings.md. `Button` emite siempre
     * `{loading && <spinner/>}` antes de children, así que el Slot de Radix
     * recibe `[false, hijo]` y React.Children.only() falla.
     *
     * Si esta prueba empieza a fallar, es una BUENA noticia: significa que el
     * paquete se ha corregido. Entonces hay que actualizar el documento de
     * hallazgos, no borrar la prueba en silencio.
     */
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        <MemoryRouter>
          <Button asChild>
            <a href="/x">ir</a>
          </Button>
        </MemoryRouter>
      )
    ).toThrow(/Slot failed to slot onto its children/);
    err.mockRestore();
  });
});
