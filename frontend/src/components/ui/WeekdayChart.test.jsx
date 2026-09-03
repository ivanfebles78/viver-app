/**
 * PEDIDOS POR DÍA — semántica y uso del color.
 *
 * Cada día tiene su color para dar variedad, y eso es justo lo que hay que
 * vigilar: en cuanto un gráfico usa varios tonos, la tentación es dejar que
 * signifiquen algo. Aquí se fija que no significan nada — el gráfico dice lo
 * mismo con los colores quitados — y que salen todos de la escala del sistema.
 */

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import WeekdayChart from "./WeekdayChart";

const DIAS = [
  { iso: 1, dia: "Lunes", total: 42, ocurrencias: 20, media: 2.1 },
  { iso: 2, dia: "Martes", total: 76, ocurrencias: 20, media: 3.8 },
  { iso: 3, dia: "Miércoles", total: 24, ocurrencias: 20, media: 1.2 },
  { iso: 4, dia: "Jueves", total: 60, ocurrencias: 20, media: 3.0 },
  { iso: 5, dia: "Viernes", total: 50, ocurrencias: 20, media: 2.5 },
];

function montar(props = {}) {
  return render(
    <WeekdayChart
      dias={DIAS}
      mas={["Martes"]}
      menos={["Miércoles"]}
      desde="2026-01-05"
      hasta="2026-05-29"
      {...props}
    />
  );
}

const clases = (container) =>
  [...container.querySelectorAll("*")].map((el) => el.getAttribute("class") || "").join(" ");

describe("WeekdayChart · el color no codifica nada", () => {
  it("el día y su media están escritos, no solo dibujados", () => {
    const { container } = montar();
    const texto = container.textContent;

    for (const abrev of ["Lun", "Mar", "Mié", "Jue", "Vie"]) {
      expect(texto).toContain(abrev);
    }
    expect(texto).toContain("2,1");
    expect(texto).toContain("3,8");
  });

  it("el máximo y el mínimo se dicen con palabras, no tiñendo la barra", () => {
    montar();
    const pie = screen.getByText(/Más pedidos:/);

    expect(pie.textContent).toContain("Martes");
    expect(pie.textContent).toContain("Miércoles");
  });

  it("la barra del máximo no lleva un color especial", () => {
    // Si el máximo se distinguiera por color, el color estaría comunicando.
    const { container } = montar();
    const barras = [...container.querySelectorAll("[style*='height']")];
    const colorMartes = barras[1].getAttribute("class");

    // El martes es el máximo y usa el color que le toca por ser martes.
    expect(colorMartes).toContain("var(--chart-6)");
  });

  it("los datos exactos están en una tabla equivalente", () => {
    montar();
    const tabla = screen.getByRole("table", { name: /Media de pedidos recibidos por día/ });

    for (const dia of ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]) {
      expect(within(tabla).getByRole("rowheader", { name: dia })).toBeTruthy();
    }
  });

  it("el dibujo está oculto al lector de pantalla: la tabla ya lo cuenta", () => {
    const { container } = montar();
    for (const barra of container.querySelectorAll("[style*='height']")) {
      expect(barra.closest("[aria-hidden='true']")).not.toBeNull();
    }
  });
});

describe("WeekdayChart · los colores salen del sistema de diseño", () => {
  it("no hay ningún color literal, ni en estilo ni en clases", () => {
    const { container } = montar();

    for (const el of container.querySelectorAll("[style]")) {
      const style = el.getAttribute("style");
      expect(style, style).not.toMatch(/#[0-9a-fA-F]{3,8}/);
      expect(style, style).not.toMatch(/\brgba?\(/);
      // Lo único calculado al pintar es la altura.
      expect(style, style).toMatch(/^height:/);
    }

    const todas = clases(container);
    expect(todas).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(todas).not.toMatch(/\brgba?\(/);
  });

  it("cada día usa un color propio de la escala --chart-*", () => {
    const { container } = montar();
    const usados = [...container.querySelectorAll("[style*='height']")].map((el) =>
      el.getAttribute("class").match(/var\(--chart-(\d)\)/)?.[1]
    );

    expect(usados).toEqual(["1", "6", "7", "8", "5"]);
    // Cinco días, cinco colores: ninguno se repite dentro del gráfico.
    expect(new Set(usados).size).toBe(5);
  });

  it("el miércoles NO usa el ámbar de la escala", () => {
    /*
     * --chart-2 sería el cálido obvio, pero sobre la pista gris se queda en
     * 2,91:1 en modo claro, por debajo del 3:1 de contraste no textual. Si
     * alguien lo "arregla" volviendo al ámbar, esta prueba lo para.
     */
    const { container } = montar();
    expect(clases(container)).not.toContain("var(--chart-2)");
  });

  it("un día fuera de lunes-viernes no inventa un color", () => {
    const { container } = render(
      <WeekdayChart dias={[{ iso: 7, dia: "Domingo", total: 1, ocurrencias: 1, media: 1 }]} />
    );
    const barra = container.querySelector("[style*='height']");

    expect(barra.getAttribute("class")).toContain("var(--chart-1)");
  });
});
