/**
 * Pruebas de la fila de indicadores.
 *
 * Protege dos decisiones que son fáciles de deshacer sin darse cuenta: que las
 * celdas NO son tarjetas flotantes (§10, contradicción C8 del sistema) y que el
 * estado semántico solo aparece cuando significa algo.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { KpiRow, KpiCell } from "./KpiRow";

describe("KpiRow", () => {
  it("las celdas comparten superficie: sin borde ni sombra propios", () => {
    /*
     * Cuatro rectángulos redondeados con sombra en fila es justo el patrón que
     * hace que un panel parezca generado. El sistema lo resolvió: superficies
     * separadas por reglas.
     */
    const { container } = render(
      <KpiRow>
        <KpiCell label="Productos" value="12" hint="En catálogo" />
      </KpiRow>
    );
    const fila = container.firstChild;
    expect(fila.className).toContain("gap-px");
    expect(fila.className).toContain("bg-border");

    const celda = screen.getByText("Productos").closest("div").parentElement;
    expect(celda.className).not.toMatch(/\bshadow-|\bborder\b/);
  });

  it("muestra etiqueta, valor y pista", () => {
    render(<KpiCell label="Stock total" value="1.234" hint="Unidades en existencias" />);
    expect(screen.getByText("Stock total")).toBeInTheDocument();
    expect(screen.getByText("1.234")).toBeInTheDocument();
    expect(screen.getByText("Unidades en existencias")).toBeInTheDocument();
  });

  it("sin estado, no pinta ninguna insignia", () => {
    // Un 0 en «bajo mínimo» es lo normal; teñirlo sería celebrar la ausencia
    // de problemas y añadir ruido a la lectura.
    const { container } = render(<KpiCell label="Bajo mínimo" value="0" hint="Productos por reponer" />);
    expect(container.textContent).not.toMatch(/requiere|atención/i);
  });

  it("con estado, la insignia lleva TEXTO, no solo color", () => {
    render(
      <KpiCell
        label="Bajo mínimo"
        value="2"
        hint="Productos por reponer"
        status={{ status: "pending", label: "Requiere reposición" }}
      />
    );
    expect(screen.getByText("Requiere reposición")).toBeInTheDocument();
  });

  it("la pista es opcional y no deja hueco cuando falta", () => {
    const { container } = render(<KpiCell label="X" value="1" />);
    expect(container.textContent.trim()).toBe("X1");
  });
});
