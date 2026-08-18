/**
 * ACCESIBILIDAD AUTOMÁTICA — grupo del mapa del vivero.
 *
 * Cubre el editor de zonas y el mapa de la página del vivero. `color-contrast`
 * se desactiva porque jsdom no compone capas y `region` porque los landmarks
 * los aporta `AppShell`; ambos se verifican en navegador. El bloque final
 * demuestra que axe corre de verdad.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";

vi.mock("../api/api", () => ({
  getMe: vi.fn(),
  getZonaItems: vi.fn(),
  fetchMapaImagenUrl: vi.fn(),
  uploadMapaImagen: vi.fn(),
  getZonasConfig: vi.fn(),
  updateZonasConfig: vi.fn(),
}));

import * as api from "../api/api";
import ZoneEditor from "../components/vivero/ZoneEditor";
import MapaVivero from "../components/vivero/MapaVivero";

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

const ZONAS = [
  { id: "zona-1", apiId: "1", nombre: "Zona 1", color: "#F4E2C1", puntos: "0,0 100,0 100,100 0,100" },
  { id: "zona-9b", apiId: "9b", nombre: "Zona 9 B", color: "#E8D947", puntos: "200,200 300,200 300,300" },
];

beforeEach(() => {
  api.getMe.mockResolvedValue({ rol: "admin" });
  api.getZonasConfig.mockResolvedValue(ZONAS);
  api.fetchMapaImagenUrl.mockResolvedValue(null);
  api.getZonaItems.mockResolvedValue({
    items: [
      { nombre_cientifico: "Dracaena draco", cantidad: 40, tamano: "M20" },
      { nombre_cientifico: "Dracaena draco", cantidad: 10, tamano: "M35" },
    ],
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a11y · ZoneEditor", () => {
  const pintar = () => render(<ZoneEditor zonas={ZONAS} onSave={vi.fn()} onCancel={vi.fn()} />);

  it("por defecto", async () => {
    const { container } = pintar();
    sinViolaciones(await analizar(container));
  });

  it("sin zona seleccionada", async () => {
    const user = userEvent.setup();
    const { container } = pintar();
    await user.selectOptions(screen.getByLabelText(/zona/i, { selector: "select" }), "");
    sinViolaciones(await analizar(container));
  });

  it("con el diálogo de alta abierto", async () => {
    const user = userEvent.setup();
    pintar();
    await user.click(screen.getByRole("button", { name: /añadir zona/i }));
    await screen.findByRole("dialog");
    sinViolaciones(await analizar(document.body));
  });

  it("con un error de validación visible", async () => {
    const user = userEvent.setup();
    pintar();
    await user.click(screen.getByRole("button", { name: /añadir zona/i }));
    const dlg = await screen.findByRole("dialog");
    await user.type(within(dlg).getByRole("textbox"), "9b");
    await user.click(within(dlg).getByRole("button", { name: /crear/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    sinViolaciones(await analizar(document.body));
  });

  it("con la confirmación de borrado abierta", async () => {
    const user = userEvent.setup();
    pintar();
    await user.click(screen.getByRole("button", { name: /eliminar zona/i }));
    await screen.findByRole("alertdialog");
    sinViolaciones(await analizar(document.body));
  });

  it("mientras guarda", async () => {
    const { container } = render(
      <ZoneEditor zonas={ZONAS} onSave={vi.fn()} onCancel={vi.fn()} saving />
    );
    sinViolaciones(await analizar(container));
  });
});

describe("a11y · MapaVivero", () => {
  it("con el plano cargado", async () => {
    const { container } = render(<MapaVivero />);
    await screen.findByRole("button", { name: /consultar inventario de Zona 1/i });
    sinViolaciones(await analizar(container));
  });

  it("con el inventario de una zona abierto", async () => {
    const user = userEvent.setup();
    render(<MapaVivero />);
    const zona = await screen.findByRole("button", { name: /consultar inventario de Zona 1/i });
    await user.click(zona);
    await screen.findByRole("dialog");
    sinViolaciones(await analizar(document.body));
  });

  it("con una zona sin stock", async () => {
    api.getZonaItems.mockResolvedValue({ items: [] });
    const user = userEvent.setup();
    render(<MapaVivero />);
    await user.click(await screen.findByRole("button", { name: /consultar inventario de Zona 1/i }));
    await screen.findByText(/no hay stock/i);
    sinViolaciones(await analizar(document.body));
  });

  it("con un error al cargar la zona", async () => {
    api.getZonaItems.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<MapaVivero />);
    await user.click(await screen.findByRole("button", { name: /consultar inventario de Zona 1/i }));
    await screen.findByText(/no se pudo cargar/i);
    sinViolaciones(await analizar(document.body));
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
