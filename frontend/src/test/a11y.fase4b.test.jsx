/**
 * ACCESIBILIDAD AUTOMÁTICA — Informes.
 *
 * Mismo criterio que en las fases anteriores: axe-core sobre la pantalla en
 * varios estados y con varios roles, con `color-contrast` desactivado de forma
 * explícita porque jsdom no compone capas. Cada caso comprueba antes que hay
 * contenido que examinar.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";

const outletContext = { me: { username: "u", rol: "admin" } };

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig()),
  useOutletContext: () => outletContext,
}));

vi.mock("../api/api", () => ({
  getDistribucionReporte: vi.fn(),
  getMovimientosExternosReporte: vi.fn(),
  getTrazabilidadReporte: vi.fn(),
  getProductos: vi.fn(),
  getMovimientos: vi.fn(),
  getPedidos: vi.fn(),
}));

vi.mock("../pages/informes.pdf", () => ({ exportReportToPdf: vi.fn() }));

import * as api from "../api/api";
import Informes from "../pages/Informes";

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

beforeEach(() => {
  outletContext.me = { username: "u", rol: "admin" };
  api.getProductos.mockResolvedValue([]);
  api.getMovimientos.mockResolvedValue([]);
  api.getPedidos.mockResolvedValue([]);
  api.getTrazabilidadReporte.mockResolvedValue(null);
  api.getDistribucionReporte.mockResolvedValue(null);
  api.getMovimientosExternosReporte.mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a11y · Informes", () => {
  it("estado inicial, como administrador", async () => {
    const { container } = render(<Informes />);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByRole("button", { name: /^Trazabilidad$/i })).toBeInTheDocument();
    sinViolaciones(await analizar(container));
  });

  it("con un informe generado y su tabla", async () => {
    const user = userEvent.setup();
    api.getTrazabilidadReporte.mockResolvedValue({
      uuid_lote: "lote-aaa",
      producto_nombre: "Dracaena draco",
      cantidad_inicial: 100,
      fecha_entrada: "2026-01-15T10:00:00Z",
      movimientos: [
        {
          fecha_movimiento: "2026-02-20T09:30:00Z",
          cantidad: 30,
          origen_tipo: "Vivero",
          destino_tipo: "UTE",
          descripcion: "Salida",
        },
      ],
      inventario_actual: [{ zona: "3a", tamano: "M20", cantidad_disponible: 40 }],
    });

    const { container } = render(<Informes />);
    await screen.findByRole("heading", { level: 1 });
    await user.type(screen.getAllByRole("textbox")[0], "lote-aaa");
    await user.click(screen.getByRole("button", { name: /generar informe/i }));

    await screen.findByRole("table");
    sinViolaciones(await analizar(container));
  });

  it("con un aviso de error visible", async () => {
    const user = userEvent.setup();
    const { container } = render(<Informes />);
    await screen.findByRole("heading", { level: 1 });
    // Buscar sin UUID produce el aviso.
    await user.click(screen.getByRole("button", { name: /generar informe/i }));
    await screen.findByRole("alert");
    sinViolaciones(await analizar(container));
  });

  it("con la pantalla de «sin permisos»", async () => {
    outletContext.me = { username: "u", rol: "rol_inventado" };
    const { container } = render(<Informes />);
    await screen.findByRole("alert");
    sinViolaciones(await analizar(container));
  });

  it("como empresa externa, con un solo informe visible", async () => {
    outletContext.me = { username: "u", rol: "empresa_externa" };
    const { container } = render(<Informes />);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByRole("button", { name: /movimientos externos/i })).toBeInTheDocument();
    sinViolaciones(await analizar(container));
  });

  it("como técnico", async () => {
    outletContext.me = { username: "u", rol: "tecnico" };
    const { container } = render(<Informes />);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByRole("button", { name: /inventario vivero/i })).toBeInTheDocument();
    sinViolaciones(await analizar(container));
  });

  it("en el informe de estadísticas, con sus gráficas", async () => {
    const user = userEvent.setup();
    const { container } = render(<Informes />);
    await screen.findByRole("heading", { level: 1 });
    await user.click(screen.getByRole("button", { name: /^Estadísticas$/i }));
    // Las gráficas son SVG: interesa que no ensucien el árbol de accesibilidad.
    sinViolaciones(await analizar(container));
  });
});

describe("a11y · la comprobación detecta de verdad", () => {
  it("un campo sin etiqueta se detecta", async () => {
    const { container } = render(<input type="text" />);
    expect((await analizar(container)).map((v) => v.id)).toContain("label");
  });
});
