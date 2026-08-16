/**
 * Pruebas de la barra de proporción.
 *
 * Sustituye a los anillos del panel, así que lo que se protege aquí es que
 * siga comunicando lo mismo SIN depender del color, y que los dos estilos en
 * línea que necesita —el ancho del segmento y el color de la serie— nunca
 * lleven un valor visual en crudo.
 */

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import ProportionBar from "./ProportionBar";

const ITEMS = [
  { label: "Árboles", value: 2 },
  { label: "Palmeras", value: 1 },
  { label: "Suculentas", value: 1 },
];

describe("ProportionBar", () => {
  it("muestra etiqueta, valor y porcentaje de cada serie", () => {
    const { container } = render(<ProportionBar title="Categorías" items={ITEMS} unit="productos" />);
    const lista = container.querySelector("dl");

    expect(within(lista).getByText("Árboles")).toBeInTheDocument();
    expect(within(lista).getByText("2")).toBeInTheDocument();
    // 2 de 4 = 50 %. El porcentaje se calcula, no se pasa.
    expect(within(lista).getByText("50,0%")).toBeInTheDocument();
  });

  it("el color NUNCA es el único canal: hay texto para cada serie", () => {
    // SC 1.4.1. Los anillos anteriores solo se distinguían por tono.
    const { container } = render(<ProportionBar items={ITEMS} />);
    for (const item of ITEMS) {
      expect(screen.getByText(item.label)).toBeInTheDocument();
    }
    // La barra apilada es decorativa: el detalle accesible está en la lista.
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it("los estilos en línea solo llevan tokens y valores calculados", () => {
    /*
     * Esta prueba es la contrapartida de la excepción anotada en el
     * guardarraíl de tokens: el ancho y el color TIENEN que ir en línea porque
     * se calculan en tiempo de ejecución, pero el color debe salir siempre de
     * la escala --chart-*, nunca de un hex escrito a mano.
     */
    const { container } = render(<ProportionBar items={ITEMS} />);
    const conEstilo = [...container.querySelectorAll("[style]")];
    expect(conEstilo.length).toBeGreaterThan(0);

    for (const el of conEstilo) {
      const style = el.getAttribute("style");
      // Ningún color literal.
      expect(style, style).not.toMatch(/#[0-9a-fA-F]{3,8}/);
      expect(style, style).not.toMatch(/\brgba?\(/);
      // Todo color declarado es una variable del sistema.
      if (/background/.test(style)) {
        expect(style, style).toMatch(/var\(--chart-[1-8]\)/);
      }
    }
  });

  it("usa la escala --chart-* en orden, sin reordenarla", () => {
    // El orden de la serie está resuelto para separar luminancias entre series
    // contiguas; reordenarlo rompería justo eso.
    const { container } = render(<ProportionBar items={ITEMS} />);
    const fondos = [...container.querySelectorAll("[style*='background']")].map((el) =>
      el.getAttribute("style").match(/var\(--chart-(\d)\)/)?.[1]
    );
    // Barra + leyenda: cada serie aparece dos veces, en el mismo orden.
    expect(fondos.slice(0, 3)).toEqual(["1", "2", "3"]);
  });

  it("calcula los porcentajes sobre el total indicado, no sobre la suma", () => {
    // El panel calcula la caducidad solo sobre los lotes CON fecha; el resto
    // se cuenta aparte. Si el denominador fuera siempre la suma, el porcentaje
    // mentiría.
    render(<ProportionBar items={[{ label: "Vigentes", value: 1 }]} total={4} />);
    expect(screen.getByText("25,0%")).toBeInTheDocument();
  });

  it("usa la coma decimal, que es la convención en español", () => {
    render(<ProportionBar items={[{ label: "A", value: 1 }, { label: "B", value: 2 }]} />);
    expect(screen.getByText("33,3%")).toBeInTheDocument();
  });

  it("muestra un mensaje explicativo cuando no hay datos", () => {
    render(<ProportionBar title="Categorías" items={[]} emptyLabel="Todavía no hay productos." />);
    expect(screen.getByText("Todavía no hay productos.")).toBeInTheDocument();
  });

  it("no divide por cero cuando todos los valores son 0", () => {
    render(<ProportionBar items={[{ label: "A", value: 0 }]} emptyLabel="Sin datos" />);
    expect(screen.getByText("Sin datos")).toBeInTheDocument();
  });

  it("las cifras se alinean con figuras tabulares", () => {
    const { container } = render(<ProportionBar items={ITEMS} />);
    expect(container.querySelectorAll(".tabular").length).toBeGreaterThan(0);
  });
});
