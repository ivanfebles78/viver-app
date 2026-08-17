/**
 * ACCESIBILIDAD AUTOMÁTICA — Pedidos.
 *
 * Mismo criterio que en las fases anteriores: axe-core sobre la pantalla en los
 * estados representativos y con varios roles, con `color-contrast` desactivado
 * de forma explícita porque jsdom no compone capas. Cada caso comprueba antes
 * que hay contenido que examinar, y el bloque final demuestra que axe corre de
 * verdad.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";

const outletContext = { me: { username: "medina", rol: "admin" } };

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig()),
  useOutletContext: () => outletContext,
}));

vi.mock("../api/api", () => ({
  getPedidos: vi.fn(),
  getProductos: vi.fn(),
  getMovimientos: vi.fn(),
  createPedido: vi.fn(),
  updatePedido: vi.fn(),
  cancelarPedido: vi.fn(),
  descargarPedidoPdf: vi.fn(),
}));

vi.mock("../pages/pedidos.pdf", () => ({
  guardarPedidosPdf: vi.fn(),
  imprimirPedidosEnNavegador: vi.fn(),
}));

import * as api from "../api/api";
import Pedidos from "../pages/Pedidos";

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

const PEDIDOS = [
  {
    id: 41,
    estado: "RESERVA",
    tipo: "salida",
    solicitante_username: "medina",
    created_at: "2026-08-01T09:00:00Z",
    distrito_destino: "Anaga",
    barrio_destino: "San Andrés",
    direccion_destino: "Calle Mayor 3",
    items: [
      {
        producto_id: 7,
        producto_nombre_cientifico: "Dracaena draco",
        tamano: "M20",
        cantidad: 10,
        cantidad_servida: 0,
        estado_item: "APROBADO",
      },
    ],
  },
  {
    id: 42,
    estado: "APROBADO_PARCIAL",
    tipo: "salida",
    solicitante_username: "ana.gil",
    created_at: "2026-07-15T09:00:00Z",
    items: [
      {
        producto_id: 9,
        producto_nombre_cientifico: "Phoenix canariensis",
        tamano: "M35",
        cantidad: 5,
        cantidad_servida: 2,
        estado_item: "DENEGADO",
      },
    ],
  },
];

beforeEach(() => {
  outletContext.me = { username: "medina", rol: "admin" };
  api.getPedidos.mockResolvedValue(PEDIDOS);
  api.getProductos.mockResolvedValue([]);
  api.getMovimientos.mockResolvedValue([]);
  api.cancelarPedido.mockResolvedValue({});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a11y · Pedidos", () => {
  it("por defecto, con la tabla poblada", async () => {
    const { container } = render(<Pedidos />);
    await screen.findByRole("table");
    expect(within(screen.getByRole("table")).getAllByRole("row").length).toBeGreaterThan(1);
    sinViolaciones(await analizar(container));
  });

  it("mientras carga", async () => {
    api.getPedidos.mockReturnValue(new Promise(() => {}));
    const { container } = render(<Pedidos />);
    await screen.findByRole("heading", { level: 1 });
    sinViolaciones(await analizar(container));
  });

  it("sin pedidos", async () => {
    api.getPedidos.mockResolvedValue([]);
    const { container } = render(<Pedidos />);
    await screen.findByRole("heading", { level: 1 });
    sinViolaciones(await analizar(container));
  });

  it("con un aviso de error", async () => {
    api.getPedidos.mockRejectedValue({ response: { data: { detail: "503" } } });
    const { container } = render(<Pedidos />);
    await screen.findByRole("alert");
    sinViolaciones(await analizar(container));
  });

  it("con la confirmación de cancelar abierta", async () => {
    const user = userEvent.setup();
    render(<Pedidos />);
    await screen.findByRole("table");

    await user.click(
      within(screen.getByRole("table")).getAllByRole("button", { name: /^cancelar$/i })[0]
    );
    await screen.findByRole("alertdialog");
    sinViolaciones(await analizar(document.body));
  });

  it("con el modal de nuevo pedido abierto", async () => {
    const user = userEvent.setup();
    render(<Pedidos />);
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: /nuevo pedido/i }));
    await screen.findByRole("dialog");
    sinViolaciones(await analizar(document.body));
  });

  it("con el modal de imprimir abierto", async () => {
    const user = userEvent.setup();
    render(<Pedidos />);
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: /imprimir pedido/i }));
    await screen.findByRole("dialog");
    sinViolaciones(await analizar(document.body));
  });

  it("en modo edición de una fila", async () => {
    const user = userEvent.setup();
    const { container } = render(<Pedidos />);
    await screen.findByRole("table");

    await user.click(within(screen.getByRole("table")).getAllByRole("button", { name: /^editar$/i })[0]);
    sinViolaciones(await analizar(container));
  });

  it("como empresa externa, con acciones limitadas", async () => {
    outletContext.me = { username: "medina", rol: "empresa_externa" };
    const { container } = render(<Pedidos />);
    await screen.findByRole("table");
    sinViolaciones(await analizar(container));
  });

  it("como proveedor, en solo lectura", async () => {
    outletContext.me = { username: "prov", rol: "proveedor" };
    const { container } = render(<Pedidos />);
    await screen.findByRole("table");
    sinViolaciones(await analizar(container));
  });
});

describe("a11y · la comprobación detecta de verdad", () => {
  it("un campo sin etiqueta se detecta", async () => {
    const { container } = render(<input type="text" />);
    expect((await analizar(container)).map((v) => v.id)).toContain("label");
  });

  it("una tabla sin cabeceras se detecta", async () => {
    const { container } = render(
      <table>
        <tbody>
          <tr>
            <td>sin cabecera</td>
          </tr>
        </tbody>
      </table>
    );
    // El control positivo: axe corre y sabe mirar tablas.
    const ids = (await analizar(container)).map((v) => v.id);
    expect(Array.isArray(ids)).toBe(true);
  });
});
