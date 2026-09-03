/**
 * ACCESIBILIDAD Y SEMÁNTICA — analítica del panel.
 *
 * Los tres widgets de demanda son gráficos, y un gráfico dibujado con cajas no
 * es legible por sí mismo. Así que aquí no basta con que axe no proteste: se
 * comprueba además que el DATO está de verdad en el árbol de accesibilidad y
 * que la lectura no depende del color.
 *
 * Sobre axe: detecta del orden de un tercio de los problemas reales. Sirve para
 * que no se cuelen regresiones mecánicas, no para declarar conformidad. La
 * revisión con teclado y lector de pantalla se hace aparte.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axe from "axe-core";

vi.mock("../api/api", () => ({
  getMe: vi.fn(),
  getProductos: vi.fn(),
  getPedidos: vi.fn(),
  getDashboardAnalytics: vi.fn(),
}));

import * as api from "../api/api";
import Dashboard from "../pages/Dashboard";

/* jsdom no pinta: el contraste se verifica en navegador, no aquí. */
const REGLAS_DESACTIVADAS = { "color-contrast": { enabled: false } };

async function analizar(container) {
  const { violations } = await axe.run(container, {
    rules: REGLAS_DESACTIVADAS,
    resultTypes: ["violations"],
  });
  if (violations.length === 0) return;
  const detalle = violations
    .map((v) => `  · [${v.impact}] ${v.id}: ${v.help}\n    ${v.nodes.map((n) => n.html).join("\n    ")}`)
    .join("\n");
  throw new Error(`axe encontró ${violations.length} violación(es):\n${detalle}`);
}

const ANALITICA = {
  productos_demandados: {
    items: [
      { producto_id: 1, nombre: "Phoenix canariensis", unidades: 372, pedidos: 41, porcentaje: 12.5 },
      { producto_id: 2, nombre: "Dracaena draco", unidades: 361, pedidos: 1, porcentaje: 12.1 },
    ],
    total_unidades: 2976,
    productos_distintos: 87,
  },
  destinos_frecuentes: {
    items: [
      { barrio: "Añaza", distrito: "Suroeste", envios: 48, unidades: 512, porcentaje: 24.5 },
      { barrio: "Taco", distrito: null, envios: 9, unidades: 60, porcentaje: 4.6 },
    ],
    total_envios: 196,
    destinos_distintos: 34,
    envios_sin_destino: 7,
  },
  pedidos_por_dia: {
    dias: [
      { iso: 1, dia: "Lunes", total: 42, ocurrencias: 20, media: 2.1 },
      { iso: 2, dia: "Martes", total: 76, ocurrencias: 20, media: 3.8 },
      { iso: 3, dia: "Miércoles", total: 24, ocurrencias: 20, media: 1.2 },
      { iso: 4, dia: "Jueves", total: 60, ocurrencias: 20, media: 3.0 },
      { iso: 5, dia: "Viernes", total: 50, ocurrencias: 20, media: 2.5 },
    ],
    total_pedidos: 252,
    pedidos_fin_de_semana: 3,
    pedidos_sin_fecha: 0,
    desde: "2026-01-05",
    hasta: "2026-05-29",
    dias_mas_pedidos: ["Martes"],
    dias_menos_pedidos: ["Miércoles"],
  },
};

const VACIA = {
  productos_demandados: { items: [], total_unidades: 0, productos_distintos: 0 },
  destinos_frecuentes: { items: [], total_envios: 0, destinos_distintos: 0, envios_sin_destino: 0 },
  pedidos_por_dia: {
    dias: [], total_pedidos: 0, pedidos_fin_de_semana: 0, pedidos_sin_fecha: 0,
    desde: null, hasta: null, dias_mas_pedidos: [], dias_menos_pedidos: [],
  },
};

function montar() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getMe.mockResolvedValue({ id: 1, rol: "admin_vivero" });
  api.getProductos.mockResolvedValue([]);
  api.getPedidos.mockResolvedValue([]);
  api.getDashboardAnalytics.mockResolvedValue(ANALITICA);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a11y · analítica del panel", () => {
  it("no tiene violaciones con datos en los tres widgets", async () => {
    const { container } = montar();

    // Sin esto, un análisis sobre una pantalla vacía pasaría por bueno.
    await screen.findByRole("heading", { name: "Demanda" });
    await screen.findByRole("heading", { name: "Productos más demandados" });
    await screen.findByRole("heading", { name: "Destinos más frecuentes" });
    await screen.findByRole("heading", { name: "Pedidos por día de la semana" });

    await analizar(container);
  });

  it("no tiene violaciones con los tres widgets vacíos", async () => {
    api.getDashboardAnalytics.mockResolvedValue(VACIA);
    const { container } = montar();

    await screen.findByRole("heading", { name: "Demanda" });
    // Dos widgets comparten el prefijo del mensaje vacío; se afina cada uno.
    await screen.findByText(/con los que calcular la demanda/);
    await screen.findByText(/un barrio de destino registrado/);
    await screen.findByText(/Todavía no hay pedidos recibidos de lunes a viernes/);

    await analizar(container);
  });
});

describe("semántica · los rankings son listas ordenadas", () => {
  it("la posición la comunica la lista, no solo el número dibujado", async () => {
    montar();
    const fila = await screen.findByText("Phoenix canariensis");
    const lista = fila.closest("ol");

    expect(lista).not.toBeNull();
    expect(within(lista).getAllByRole("listitem")).toHaveLength(2);
    // El primer puesto es el primer <li>: el orden ES el dato.
    expect(within(lista).getAllByRole("listitem")[0].textContent).toContain(
      "Phoenix canariensis"
    );
  });

  it("el nombre, la cuota y la cantidad están en texto", async () => {
    montar();
    await screen.findByText("Phoenix canariensis");

    // El porcentaje se escribe con coma decimal, como el resto de la app.
    expect(screen.getByText(/12,5%/)).toBeTruthy();
    expect(screen.getByText(/372/)).toBeTruthy();
  });

  it("el singular y el plural de «pedido» concuerdan", async () => {
    montar();
    await screen.findByText("41 pedidos");
    expect(screen.getByText("1 pedido")).toBeTruthy();
  });

  it("el distrito acompaña al barrio cuando existe, y no se inventa cuando no", async () => {
    montar();
    await screen.findByText("Añaza");

    expect(screen.getByText("Suroeste")).toBeTruthy();
    // "Taco" no tiene distrito: no debe aparecer ningún texto inventado.
    expect(screen.queryByText("null")).toBeNull();
    expect(screen.queryByText("undefined")).toBeNull();
  });

  it("los envíos sin barrio se declaran en vez de esconderse", async () => {
    montar();
    await screen.findByText(/sin barrio registrado/);
  });
});

describe("semántica · el gráfico de días es legible sin verlo", () => {
  it("expone los datos en una tabla equivalente con cabeceras", async () => {
    montar();
    await screen.findByRole("heading", { name: "Pedidos por día de la semana" });

    const tabla = screen.getByRole("table", { name: /Media de pedidos recibidos por día/ });
    // Los cinco días laborables, cada uno como cabecera de su fila.
    for (const dia of ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]) {
      expect(within(tabla).getByRole("rowheader", { name: dia })).toBeTruthy();
    }
    expect(within(tabla).getAllByRole("columnheader")).toHaveLength(4);
  });

  it("el pie dice en palabras qué día recibe más y cuál menos", async () => {
    montar();
    const pie = await screen.findByText(/Más pedidos:/);

    expect(pie.textContent).toContain("Martes");
    expect(pie.textContent).toContain("Menos pedidos:");
    expect(pie.textContent).toContain("Miércoles");
  });

  it("con empate nombra todos los días empatados", async () => {
    api.getDashboardAnalytics.mockResolvedValue({
      ...ANALITICA,
      pedidos_por_dia: {
        ...ANALITICA.pedidos_por_dia,
        dias_mas_pedidos: ["Lunes", "Martes"],
        dias_menos_pedidos: ["Jueves", "Viernes"],
      },
    });
    montar();

    const pie = await screen.findByText(/Más pedidos:/);
    expect(pie.textContent).toContain("Lunes y Martes");
    expect(pie.textContent).toContain("Jueves y Viernes");
  });

  it("la tabla equivalente no desborda la página", async () => {
    // Una <table> con la clase sr-only puesta en ella misma ignora el
    // `width: 1px` y ensancha el documento. Debe ir DENTRO de un contenedor.
    montar();
    const tabla = await screen.findByRole("table", { name: /Media de pedidos recibidos por día/ });

    expect(tabla.classList.contains("sr-only")).toBe(false);
    expect(tabla.parentElement.classList.contains("sr-only")).toBe(true);
  });
});

describe("permisos · quién ve la analítica", () => {
  it("no se pide siquiera para la empresa externa", async () => {
    api.getMe.mockResolvedValue({ id: 9, rol: "empresa_externa" });
    montar();

    await screen.findByRole("heading", { name: "Panel de control" });
    expect(api.getDashboardAnalytics).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Demanda" })).toBeNull();
  });

  it("no se pide siquiera para el proveedor", async () => {
    api.getMe.mockResolvedValue({ id: 9, rol: "proveedor" });
    montar();

    await screen.findByRole("heading", { name: "Panel de control" });
    expect(api.getDashboardAnalytics).not.toHaveBeenCalled();
  });

  it("sí se pide para un rol con el histórico completo", async () => {
    api.getMe.mockResolvedValue({ id: 1, rol: "gestor_vivero" });
    montar();

    await screen.findByRole("heading", { name: "Demanda" });
    expect(api.getDashboardAnalytics).toHaveBeenCalled();
  });
});

describe("robustez · un fallo de la analítica no tumba el panel", () => {
  it("avisa y deja el resto de la pantalla en pie", async () => {
    api.getDashboardAnalytics.mockRejectedValue({
      response: { data: { detail: "Servicio no disponible" } },
    });
    montar();

    await screen.findByText(/Analítica: Servicio no disponible/);
    // El panel sigue ahí.
    expect(screen.getByRole("heading", { name: "Panel de control" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Demanda" })).toBeNull();
  });
});
