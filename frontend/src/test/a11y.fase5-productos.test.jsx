/**
 * ACCESIBILIDAD AUTOMÁTICA — Productos.
 *
 * axe-core sobre los estados representativos y varios roles, con
 * `color-contrast` desactivado explícitamente porque jsdom no compone capas.
 * Cada caso comprueba antes que hay contenido que examinar, y el bloque final
 * demuestra que axe corre de verdad.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";

const outletContext = { me: { username: "u", rol: "admin" } };

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig()),
  useOutletContext: () => outletContext,
}));

vi.mock("../api/api", () => ({
  getProductos: vi.fn(),
  createPedido: vi.fn(),
  updateProductoInterno: vi.fn(),
  createProducto: vi.fn(),
  updateProducto: vi.fn(),
  deleteProducto: vi.fn(),
  importarProductos: vi.fn(),
}));

import * as api from "../api/api";
import Productos from "../pages/Productos";

const REGLAS_DESACTIVADAS = {
  // jsdom no compone capas: el contraste se verifica en navegador.
  "color-contrast": { enabled: false },
  /*
   * `region` exige que TODO el contenido esté dentro de un landmark. Lo aporta
   * `AppShell` con su `<main>`, no esta pantalla — pero las pruebas la montan
   * suelta, sin shell, así que la regla dispara un falso positivo. Se
   * desactiva aquí y se comprueba en navegador que la página real sí tiene sus
   * landmarks.
   */
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

const PRODUCTOS = [
  {
    id: 1,
    nombre_cientifico: "Dracaena draco",
    nombre_natural: "Drago",
    categoria: "Árbol",
    subcategoria: "Autóctono",
    stock: 120,
    stock_minimo: 20,
    precio: 34.5,
    es_interno: false,
  },
  {
    id: 2,
    nombre_cientifico: "Phoenix canariensis",
    nombre_natural: "Palmera canaria",
    categoria: "Palmera",
    subcategoria: "Canaria",
    stock: 0,
    stock_minimo: 10,
    precio: null,
    es_interno: true,
  },
];

beforeEach(() => {
  outletContext.me = { username: "u", rol: "admin" };
  api.getProductos.mockResolvedValue(PRODUCTOS);
  api.deleteProducto.mockResolvedValue({});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const abrirGestion = async (user) => {
  await user.click(screen.getByRole("button", { name: /gestionar productos/i }));
  return screen.findByRole("dialog");
};

describe("a11y · Productos", () => {
  it("por defecto, con el catálogo poblado", async () => {
    const { container } = render(<Productos />);
    await screen.findByText("Dracaena draco");
    sinViolaciones(await analizar(container));
  });

  it("mientras carga", async () => {
    api.getProductos.mockReturnValue(new Promise(() => {}));
    const { container } = render(<Productos />);
    await screen.findByRole("heading", { level: 1 });
    sinViolaciones(await analizar(container));
  });

  it("sin productos", async () => {
    api.getProductos.mockResolvedValue([]);
    const { container } = render(<Productos />);
    await screen.findByRole("heading", { level: 1 });
    sinViolaciones(await analizar(container));
  });

  it("con un error de carga", async () => {
    api.getProductos.mockRejectedValue({ response: { data: { detail: "503" } } });
    const { container } = render(<Productos />);
    await screen.findByText(/503/);
    sinViolaciones(await analizar(container));
  });

  it("con la gestión del catálogo abierta", async () => {
    const user = userEvent.setup();
    render(<Productos />);
    await screen.findByText("Dracaena draco");
    const dlg = await abrirGestion(user);
    expect(within(dlg).getAllByRole("button", { name: /^eliminar$/i }).length).toBeGreaterThan(0);
    sinViolaciones(await analizar(document.body));
  });

  it("con la confirmación de borrado abierta", async () => {
    const user = userEvent.setup();
    render(<Productos />);
    await screen.findByText("Dracaena draco");
    const dlg = await abrirGestion(user);
    await user.click(within(dlg).getAllByRole("button", { name: /^eliminar$/i })[0]);
    await screen.findByRole("alertdialog");
    sinViolaciones(await analizar(document.body));
  });

  it("en la pestaña de alta de producto", async () => {
    const user = userEvent.setup();
    render(<Productos />);
    await screen.findByText("Dracaena draco");
    const dlg = await abrirGestion(user);
    await user.click(within(dlg).getByRole("tab", { name: /nuevo producto/i }));
    sinViolaciones(await analizar(document.body));
  });

  it("en la pestaña de importación", async () => {
    const user = userEvent.setup();
    render(<Productos />);
    await screen.findByText("Dracaena draco");
    const dlg = await abrirGestion(user);
    await user.click(within(dlg).getByRole("tab", { name: /importar/i }));
    sinViolaciones(await analizar(document.body));
  });

  it("con el modal de pedir más abierto", async () => {
    const user = userEvent.setup();
    render(<Productos />);
    await screen.findByText("Dracaena draco");
    await user.click(screen.getAllByRole("button", { name: /pedir m[áa]s/i })[0]);
    sinViolaciones(await analizar(document.body));
  });

  it("como empresa externa, sin acciones de gestión", async () => {
    outletContext.me = { username: "u", rol: "empresa_externa" };
    const { container } = render(<Productos />);
    await screen.findByText("Dracaena draco");
    sinViolaciones(await analizar(container));
  });

  it("como técnico", async () => {
    outletContext.me = { username: "u", rol: "tecnico" };
    const { container } = render(<Productos />);
    await screen.findByText("Dracaena draco");
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
    const ids = (await analizar(container)).map((v) => v.id);
    expect(ids).toContain("button-name");
  });
});
