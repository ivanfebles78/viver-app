/**
 * ACCESIBILIDAD AUTOMÁTICA — Aprobaciones.
 *
 * axe-core sobre los estados representativos y varios roles. `color-contrast`
 * se desactiva porque jsdom no compone capas, y `region` porque los landmarks
 * los aporta `AppShell`, que estas pruebas no montan. Ambos se verifican en
 * navegador. El bloque final demuestra que axe corre de verdad.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";

const outletContext = { me: { username: "jefa", rol: "manager" } };

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig()),
  useOutletContext: () => outletContext,
}));

vi.mock("../api/api", () => ({
  getPedidos: vi.fn(),
  aprobarPedido: vi.fn(),
  denegarPedido: vi.fn(),
  decidirPedido: vi.fn(),
  descargarPedidoPdf: vi.fn(),
}));

import * as api from "../api/api";
import Aprobaciones from "../pages/Aprobaciones";

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

const linea = (id, estado_item, extra = {}) => ({
  id,
  estado_item,
  producto_id: 500 + id,
  producto_nombre_cientifico: `Producto ${id}`,
  tamano: "M20",
  cantidad: 100,
  cantidad_servida: 0,
  ...extra,
});

const PEDIDOS = [
  {
    id: 1,
    estado: "RESERVA",
    tipo: "suministro",
    created_at: "2026-05-10T09:00:00",
    solicitante_username: "medina",
    distrito_destino: "Centro-Ifara",
    items: [linea(1, "RESERVA")],
  },
  {
    id: 2,
    estado: "APROBADO_PARCIAL",
    tipo: "reposicion",
    created_at: "2026-05-09T09:00:00",
    solicitante_username: "ute_jardines",
    nota: "Reparto en dos fases",
    items: [linea(11, "RESERVA"), linea(12, "APROBADO"), linea(13, "DENEGADO")],
  },
  {
    id: 3,
    estado: "DENEGADO",
    tipo: "suministro",
    created_at: "2026-05-08T09:00:00",
    solicitante: "tecnico_norte",
    items: [linea(21, "DENEGADO")],
  },
];

beforeEach(() => {
  outletContext.me = { username: "jefa", rol: "manager" };
  api.getPedidos.mockResolvedValue(PEDIDOS);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const abrirDetalle = async (user, id) => {
  const fila = (await screen.findByText(`#${id}`)).closest("tr");
  await user.click(within(fila).getByRole("button", { name: /detalle/i }));
  return screen.findByRole("dialog");
};

describe("a11y · Aprobaciones", () => {
  it("por defecto, con la lista poblada", async () => {
    const { container } = render(<Aprobaciones />);
    await screen.findByText("#1");
    sinViolaciones(await analizar(container));
  });

  it("mientras carga", async () => {
    api.getPedidos.mockReturnValue(new Promise(() => {}));
    const { container } = render(<Aprobaciones />);
    await screen.findByRole("heading", { level: 1 });
    sinViolaciones(await analizar(container));
  });

  it("sin pedidos", async () => {
    api.getPedidos.mockResolvedValue([]);
    const { container } = render(<Aprobaciones />);
    await screen.findByText(/no hay pedidos/i);
    sinViolaciones(await analizar(container));
  });

  it("con un error de carga", async () => {
    api.getPedidos.mockRejectedValue({ response: { data: { detail: "503" } } });
    const { container } = render(<Aprobaciones />);
    await screen.findByText(/503/);
    sinViolaciones(await analizar(container));
  });

  it("con el detalle abierto y decisión pendiente", async () => {
    const user = userEvent.setup();
    render(<Aprobaciones />);
    await screen.findByText("#1");
    const dlg = await abrirDetalle(user, 2);
    expect(within(dlg).getAllByRole("button", { name: /^aprobar$/i }).length).toBeGreaterThan(0);
    sinViolaciones(await analizar(document.body));
  });

  it("con una decisión marcada y el motivo visible", async () => {
    const user = userEvent.setup();
    render(<Aprobaciones />);
    await screen.findByText("#1");
    const dlg = await abrirDetalle(user, 2);
    await user.click(within(dlg).getAllByRole("button", { name: /^denegar$/i })[0]);
    expect(within(dlg).getByLabelText(/motivo de denegación/i)).toBeInTheDocument();
    sinViolaciones(await analizar(document.body));
  });

  it("con el detalle de un pedido ya denegado", async () => {
    const user = userEvent.setup();
    render(<Aprobaciones />);
    await screen.findByText("#1");
    await abrirDetalle(user, 3);
    sinViolaciones(await analizar(document.body));
  });

  it("con la confirmación de aprobación abierta", async () => {
    const user = userEvent.setup();
    render(<Aprobaciones />);
    const fila = (await screen.findByText("#1")).closest("tr");
    await user.click(within(fila).getByRole("button", { name: /^aprobar$/i }));
    await screen.findByRole("alertdialog");
    sinViolaciones(await analizar(document.body));
  });

  it("como técnico, sin controles de decisión", async () => {
    outletContext.me = { username: "t", rol: "tecnico" };
    const { container } = render(<Aprobaciones />);
    await screen.findByText("#1");
    sinViolaciones(await analizar(container));
  });

  it("como admin", async () => {
    outletContext.me = { username: "a", rol: "admin" };
    const { container } = render(<Aprobaciones />);
    await screen.findByText("#1");
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
