/**
 * ACCESIBILIDAD AUTOMÁTICA — Movimientos.
 *
 * Mismo criterio que en la Fase 3: axe-core sobre la pantalla en todos sus
 * estados, con `color-contrast` desactivado de forma explícita porque jsdom no
 * compone capas. Cada caso comprueba primero que el contenido que dice examinar
 * está en el DOM, para que «sin violaciones» no pueda significar «no había
 * nada que mirar».
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";

vi.mock("../api/api", () => ({
  getMovimientos: vi.fn(),
  getProductos: vi.fn(),
  getPedidos: vi.fn(),
  createMovimiento: vi.fn(),
}));

vi.mock("../components/vivero/zonesStorage", () => ({
  loadZonasFromServer: vi.fn(),
}));

import * as api from "../api/api";
import { loadZonasFromServer } from "../components/vivero/zonesStorage";
import Movimientos from "../pages/Movimientos";

const REGLAS_DESACTIVADAS = { "color-contrast": { enabled: false } };

async function analizar(nodo) {
  const r = await axe.run(nodo, { rules: REGLAS_DESACTIVADAS, resultTypes: ["violations"] });
  return r.violations;
}

function sinViolaciones(violations) {
  if (violations.length === 0) return;
  const detalle = violations
    .map((v) => `  · [${v.impact}] ${v.id}: ${v.help}\n    ${v.nodes.map((n) => n.html).join("\n    ")}`)
    .join("\n");
  throw new Error(`axe encontró ${violations.length} violación(es):\n${detalle}`);
}

const MOVS = [
  {
    id: 1,
    fecha_movimiento: "2026-03-10T09:00:00Z",
    producto_id: 7,
    producto_nombre_cientifico: "Dracaena draco",
    cantidad: 12,
    origen_tipo: "Vivero",
    destino_tipo: "UTE",
    zona_origen: "3a",
    tamano_origen: "M20",
    distrito_destino: "Anaga",
    barrio_destino: "San Andrés",
    direccion_destino: "Calle Mayor 3",
    uuid_lote: "lote-aaa",
    created_by: "maria.perez",
    pedido_id: 55,
    es_prestamo: true,
  },
  {
    id: 2,
    fecha_movimiento: "2026-04-02T11:30:00Z",
    producto_id: 9,
    producto_nombre_cientifico: "Phoenix canariensis",
    cantidad: 4,
    origen_tipo: "Proveedores del vivero",
    destino_tipo: "Vivero",
    zona_destino: "12",
    tamano_destino: "M35",
    uuid_lote: "lote-bbb",
    created_by: "juan.lopez",
  },
];

const PRODUCTOS = [
  { id: 7, nombre_cientifico: "Dracaena draco", nombre_natural: "Drago", categoria: "Árbol" },
  { id: 9, nombre_cientifico: "Phoenix canariensis", nombre_natural: "Palmera canaria", categoria: "Palmera" },
];

beforeEach(() => {
  api.getMovimientos.mockResolvedValue(MOVS);
  api.getProductos.mockResolvedValue(PRODUCTOS);
  api.getPedidos.mockResolvedValue([]);
  api.createMovimiento.mockResolvedValue({});
  loadZonasFromServer.mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a11y · Movimientos", () => {
  it("con datos en la tabla", async () => {
    const { container } = render(<Movimientos />);
    await screen.findByRole("table");
    expect(within(screen.getByRole("table")).getAllByRole("row").length).toBeGreaterThan(1);
    sinViolaciones(await analizar(container));
  });

  it("mientras carga", async () => {
    api.getMovimientos.mockReturnValue(new Promise(() => {}));
    const { container } = render(<Movimientos />);
    expect(screen.getByRole("search", { name: /filtros de movimientos/i })).toBeInTheDocument();
    sinViolaciones(await analizar(container));
  });

  it("sin movimientos", async () => {
    api.getMovimientos.mockResolvedValue([]);
    const { container } = render(<Movimientos />);
    await screen.findByText(/todavía no hay movimientos/i);
    sinViolaciones(await analizar(container));
  });

  it("con un aviso de error visible", async () => {
    api.getPedidos.mockRejectedValue(new Error("503"));
    const { container } = render(<Movimientos />);
    await screen.findByRole("alert");
    sinViolaciones(await analizar(container));
  });

  it("con el detalle abierto", async () => {
    const user = userEvent.setup();
    render(<Movimientos />);
    await screen.findByRole("table");

    await user.click(
      within(screen.getByRole("table")).getByRole("button", { name: /ver el detalle del movimiento 1/i })
    );
    await screen.findByRole("dialog");
    sinViolaciones(await analizar(document.body));
  });

  it("con la cesta abierta", async () => {
    const user = userEvent.setup();
    render(<Movimientos />);
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: /nuevo movimiento/i }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByRole("tablist")).toBeInTheDocument();
    sinViolaciones(await analizar(document.body));
  });

  it("con el asistente abierto en el paso 1", async () => {
    const user = userEvent.setup();
    render(<Movimientos />);
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: /servir pedido/i }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByRole("radiogroup", { name: /tipo de movimiento/i })).toBeInTheDocument();
    sinViolaciones(await analizar(document.body));
  });

  it("con el asistente en el paso 2", async () => {
    const user = userEvent.setup();
    render(<Movimientos />);
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: /servir pedido/i }));
    const dialogo = await screen.findByRole("dialog");
    await user.click(within(dialogo).getByRole("radio", { name: /entrada al vivero/i }));
    // La entrada exige elegir procedencia antes de continuar.
    expect(within(dialogo).getByLabelText(/^origen/i)).toBeInTheDocument();
    sinViolaciones(await analizar(document.body));
  });
});

describe("a11y · la comprobación detecta de verdad", () => {
  it("un campo sin etiqueta se detecta", async () => {
    const { container } = render(<input type="text" />);
    expect((await analizar(container)).map((v) => v.id)).toContain("label");
  });
});
