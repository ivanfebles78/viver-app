/**
 * RANKING ORDENADO — semántica y uso del color.
 *
 * Contrapartida de la excepción anotada en el guardarraíl de tokens: la
 * anchura de la barra TIENE que ir en línea porque se calcula al pintar, pero
 * ningún color puede escribirse a mano. Y, sobre todo, el color no puede ser
 * el único canal: el tono cambia entre rankings para distinguirlos de un
 * vistazo, así que hay que fijar que quitarlo no le quita información a nadie.
 */

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import RankingList from "./RankingList";

const ITEMS = [
  { id: 1, label: "Phoenix canariensis", sublabel: "41 pedidos", value: 372, percent: 12.5 },
  { id: 2, label: "Dracaena draco", sublabel: "38 pedidos", value: 361, percent: 12.1 },
  { id: 3, label: "Lavandula", sublabel: "22 pedidos", value: 180, percent: 6 },
];

const clases = (container) =>
  [...container.querySelectorAll("*")].map((el) => el.getAttribute("class") || "").join(" ");

describe("RankingList · el color nunca es el único canal", () => {
  it("cada fila lleva su puesto, su nombre, su cuota y su cantidad en texto", () => {
    render(<RankingList items={ITEMS} unit="uds." />);

    const filas = screen.getAllByRole("listitem");
    expect(filas).toHaveLength(3);

    // El puesto lo comunica la <ol>; además está dibujado.
    expect(filas[0].textContent).toContain("1");
    expect(filas[0].textContent).toContain("Phoenix canariensis");
    expect(filas[0].textContent).toContain("12,5%");
    expect(filas[0].textContent).toContain("372");
    expect(filas[0].textContent).toContain("uds.");
  });

  it("es una lista ordenada: el orden es el dato", () => {
    const { container } = render(<RankingList items={ITEMS} />);
    expect(container.querySelector("ol")).not.toBeNull();
  });

  it("las barras están ocultas al lector de pantalla, porque duplican el texto", () => {
    const { container } = render(<RankingList items={ITEMS} />);
    for (const barra of container.querySelectorAll("[style*='width']")) {
      expect(barra.closest("[aria-hidden='true']")).not.toBeNull();
    }
  });

  it("cambiar de tono no cambia ni una palabra de lo que se lee", () => {
    const azul = render(<RankingList items={ITEMS} unit="uds." />).container.textContent;
    const verde = render(<RankingList items={ITEMS} unit="uds." tono="verde" />).container
      .textContent;

    expect(verde).toBe(azul);
  });
});

describe("RankingList · los colores salen del sistema de diseño", () => {
  it("no hay ningún color literal, ni en estilo ni en clases", () => {
    const { container } = render(<RankingList items={ITEMS} tono="verde" />);

    for (const el of container.querySelectorAll("[style]")) {
      const style = el.getAttribute("style");
      expect(style, style).not.toMatch(/#[0-9a-fA-F]{3,8}/);
      expect(style, style).not.toMatch(/\brgba?\(/);
      // Lo único que se calcula al pintar es la anchura.
      expect(style, style).toMatch(/^width:/);
    }

    const todas = clases(container);
    expect(todas).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(todas).not.toMatch(/\brgba?\(/);
  });

  it("cada tono usa un color distinto de la escala --chart-*", () => {
    const azul = clases(render(<RankingList items={ITEMS} tono="azul" />).container);
    const verde = clases(render(<RankingList items={ITEMS} tono="verde" />).container);

    expect(azul).toContain("var(--chart-1)");
    expect(verde).toContain("var(--chart-4)");
    // Si los dos rankings acabaran del mismo color, dejarían de distinguirse.
    expect(verde).not.toContain("var(--chart-1)");
  });

  it("un tono desconocido cae en el azul, no en un color inventado", () => {
    const raro = clases(render(<RankingList items={ITEMS} tono="fucsia" />).container);
    expect(raro).toContain("var(--chart-1)");
  });

  it("el acento del puesto es el mismo tono, no otro color", () => {
    const { container } = render(<RankingList items={ITEMS} tono="verde" />);
    const puesto = within(container).getAllByRole("listitem")[0].firstElementChild;

    expect(puesto.getAttribute("class")).toContain("var(--chart-4)");
    // Es un apunte del tono, no una superficie: va mezclado con transparente.
    expect(puesto.getAttribute("class")).toContain("color-mix");
  });

  it("la cifra del puesto se queda en el color de texto atenuado", () => {
    // Teñirla con el acento la dejaría en 3,74:1 sobre el fondo casi blanco, y
    // el texto pequeño necesita 4,5:1.
    const { container } = render(<RankingList items={ITEMS} tono="verde" />);
    const puesto = within(container).getAllByRole("listitem")[0].firstElementChild;

    expect(puesto.getAttribute("class")).toContain("text-muted-foreground");
  });
});

describe("RankingList · estado vacío", () => {
  it("no pinta una lista vacía, explica que no hay nada", () => {
    render(<RankingList items={[]} emptyLabel="Todavía no hay datos." />);
    expect(screen.getByText("Todavía no hay datos.")).toBeTruthy();
  });
});
