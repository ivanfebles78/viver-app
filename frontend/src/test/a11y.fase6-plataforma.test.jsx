/**
 * ACCESIBILIDAD AUTOMÁTICA — Plataforma.
 *
 * `color-contrast` se desactiva porque jsdom no compone capas y `region`
 * porque los landmarks los aporta `AppShell`, que estas pruebas no montan;
 * ambos se verifican en navegador. El bloque final demuestra que axe corre.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";

vi.mock("../api/api", () => ({
  getSuperadminStats: vi.fn(),
  enrollAyuntamiento: vi.fn(),
  setActiveClienteId: vi.fn(),
  updateCliente: vi.fn(),
  importClienteData: vi.fn(),
}));

import * as api from "../api/api";
import Plataforma from "../pages/Plataforma";

const REGLAS_DESACTIVADAS = {
  "color-contrast": { enabled: false },
  region: { enabled: false },
};

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

const STATS = {
  resumen: {
    ayuntamientos_total: 2,
    ayuntamientos_activos: 1,
    usuarios_total: 35,
    productos_total: 120,
    pedidos_total: 40,
    movimientos_total: 900,
  },
  facturacion: {
    ingreso_mensual_estimado: 398,
    ingreso_anual_estimado: 4776,
    ayuntamientos_facturables: 2,
    cuota_mensual_por_defecto: 199,
  },
  evolucion_altas: [
    { mes: "2026-01", acumulado: 1 },
    { mes: "2026-02", acumulado: 2 },
  ],
  por_cliente: [
    { id: 1, nombre: "Ayuntamiento de Santa Cruz de Tenerife", slug: "santa-cruz", activo: true, usuarios: 24, productos: 100, pedidos: 30, movimientos: 700, cuota_mensual: 199, cuota_personalizada: false },
    { id: 2, nombre: "Ayuntamiento de La Laguna", slug: "la-laguna", activo: false, usuarios: 11, productos: 20, pedidos: 10, movimientos: 200, cuota_mensual: 150, cuota_personalizada: true },
  ],
};

beforeEach(() => {
  api.getSuperadminStats.mockResolvedValue(STATS);
  api.importClienteData.mockResolvedValue({ importado: { productos: 12 } });
  api.updateCliente.mockResolvedValue({});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a11y · Plataforma", () => {
  it("por defecto, con estadísticas cargadas", async () => {
    const { container } = render(<Plataforma />);
    await screen.findByText(/Santa Cruz de Tenerife/);
    sinViolaciones(await analizar(container));
  });

  it("mientras carga", async () => {
    api.getSuperadminStats.mockReturnValue(new Promise(() => {}));
    const { container } = render(<Plataforma />);
    await screen.findByRole("heading", { level: 1 });
    sinViolaciones(await analizar(container));
  });

  it("con un error de carga", async () => {
    api.getSuperadminStats.mockRejectedValue({ response: { data: { detail: "503" } } });
    const { container } = render(<Plataforma />);
    await screen.findByText(/503/);
    sinViolaciones(await analizar(container));
  });

  it("sin altas registradas, la gráfica vacía", async () => {
    api.getSuperadminStats.mockResolvedValue({ ...STATS, evolucion_altas: [] });
    const { container } = render(<Plataforma />);
    await screen.findByText(/Aún no hay altas/);
    sinViolaciones(await analizar(container));
  });

  it("con el editor de cuota abierto", async () => {
    const user = userEvent.setup();
    const { container } = render(<Plataforma />);
    const fila = (await screen.findByText("Ayuntamiento de La Laguna")).closest("tr");
    await user.click(within(fila).getByRole("button", { name: /cuota/i }));
    expect(within(fila).getByRole("spinbutton")).toBeInTheDocument();
    sinViolaciones(await analizar(container));
  });

  it("con la confirmación de importación abierta", async () => {
    const user = userEvent.setup();
    render(<Plataforma />);
    const fila = (await screen.findByText("Ayuntamiento de La Laguna")).closest("tr");
    await user.upload(
      within(fila).getByLabelText(/importar/i),
      new File(["{}"], "copia.json", { type: "application/json" })
    );
    await screen.findByRole("alertdialog");
    sinViolaciones(await analizar(document.body));
  });

  it("con el formulario de alta relleno", async () => {
    const user = userEvent.setup();
    const { container } = render(<Plataforma />);
    await screen.findByText(/Santa Cruz de Tenerife/);
    await user.type(screen.getByLabelText(/nombre del ayuntamiento/i), "Arico");
    await user.type(screen.getByLabelText(/usuario admin/i), "admin_arico");
    sinViolaciones(await analizar(container));
  });
});

describe("a11y · la comprobación detecta de verdad", () => {
  it("un campo sin etiqueta se detecta", async () => {
    const { container } = render(<input type="text" />);
    expect((await analizar(container)).map((v) => v.id)).toContain("label");
  });

  it("un botón sin nombre accesible se detecta", async () => {
    const { container } = render(<button type="button" />);
    expect((await analizar(container)).map((v) => v.id)).toContain("button-name");
  });
});
