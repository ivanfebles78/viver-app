/**
 * ACCESIBILIDAD AUTOMÁTICA — componentes de la Fase 8.
 *
 * `color-contrast` se desactiva porque jsdom no compone capas y `region`
 * porque los landmarks los aporta `AppShell`, que estas pruebas no montan;
 * ambos se verifican en navegador. El bloque final demuestra que axe corre.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";

vi.mock("../api/api", () => ({
  changePassword: vi.fn(),
  getClientes: vi.fn(),
  getActiveClienteId: vi.fn(() => null),
  setActiveClienteId: vi.fn(),
  getZonaItems: vi.fn(),
  marcarZonaInterna: vi.fn(),
  getZonasConfig: vi.fn(),
  updateZonasConfig: vi.fn(),
}));

vi.mock("../utils/plantImages", () => ({
  usePlantImage: () => "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
  usePlantsWithImage: () => new Set(),
}));

import * as api from "../api/api";
import CambiarPasswordModal from "../components/common/CambiarPasswordModal";
import ClienteSelector from "../components/common/ClienteSelector";
import WelcomeModal from "../components/welcome/WelcomeModal";
import VerPlanta from "../components/VerPlanta";
import ZonaMapDialog from "../components/shell/ZonaMapDialog";

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

beforeEach(() => {
  api.changePassword.mockResolvedValue({});
  api.getClientes.mockResolvedValue([
    { id: 1, nombre: "Ayuntamiento de Santa Cruz de Tenerife" },
    { id: 2, nombre: "Ayuntamiento de La Laguna" },
  ]);
  api.getZonasConfig.mockResolvedValue([]);
  api.getZonaItems.mockResolvedValue({
    items: [
      { producto_id: 1, nombre_cientifico: "Dracaena draco", nombre_natural: "Drago", cantidad: 10, tamanos: [{ tamano: "M20", cantidad: 10 }] },
    ],
    todos_internos: false,
  });
  api.marcarZonaInterna.mockResolvedValue({});
  window.localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a11y · CambiarPasswordModal", () => {
  it("con el formulario vacío", async () => {
    render(<CambiarPasswordModal open onClose={vi.fn()} />);
    await screen.findByLabelText(/contraseña actual/i);
    sinViolaciones(await analizar(document.body));
  });

  it("con un error de validación", async () => {
    const user = userEvent.setup();
    render(<CambiarPasswordModal open onClose={vi.fn()} />);
    await user.type(screen.getByLabelText(/contraseña actual/i), "x");
    await user.type(screen.getByLabelText(/^nueva contraseña$/i), "corta");
    await user.type(screen.getByLabelText(/repetir/i), "corta");
    await user.click(screen.getByRole("button", { name: /cambiar contraseña/i }));
    await screen.findByRole("alert");
    sinViolaciones(await analizar(document.body));
  });

  it("tras el éxito", async () => {
    const user = userEvent.setup();
    render(<CambiarPasswordModal open onClose={vi.fn()} />);
    await user.type(screen.getByLabelText(/contraseña actual/i), "actual-1234");
    await user.type(screen.getByLabelText(/^nueva contraseña$/i), "nueva-12345");
    await user.type(screen.getByLabelText(/repetir/i), "nueva-12345");
    await user.click(screen.getByRole("button", { name: /cambiar contraseña/i }));
    await screen.findByText(/actualizada correctamente/i);
    sinViolaciones(await analizar(document.body));
  });
});

describe("a11y · ClienteSelector", () => {
  it("con ayuntamientos cargados", async () => {
    const { container } = render(<ClienteSelector visible />);
    await screen.findByRole("option", { name: /Santa Cruz/i });
    sinViolaciones(await analizar(container));
  });

  it("con un error de carga", async () => {
    api.getClientes.mockRejectedValue(new Error("boom"));
    const { container } = render(<ClienteSelector visible />);
    await screen.findByRole("alert");
    sinViolaciones(await analizar(container));
  });
});

describe("a11y · WelcomeModal", () => {
  it("abierto", async () => {
    render(<WelcomeModal open onClose={vi.fn()} />);
    await screen.findByRole("heading", { name: /bienvenido a viverapp/i });
    sinViolaciones(await analizar(document.body));
  });
});

describe("a11y · VerPlanta", () => {
  it("como icono", async () => {
    const { container } = render(<VerPlanta nombreCientifico="Dracaena draco" />);
    sinViolaciones(await analizar(container));
  });

  it("como enlace sobre el nombre", async () => {
    const { container } = render(
      <VerPlanta nombreCientifico="Dracaena draco" variant="link">
        Dracaena draco
      </VerPlanta>
    );
    sinViolaciones(await analizar(container));
  });

  it("con la imagen abierta", async () => {
    const user = userEvent.setup();
    render(<VerPlanta nombreCientifico="Dracaena draco" variant="button" />);
    await user.click(screen.getByRole("button", { name: /ver imagen/i }));
    await screen.findByRole("dialog");
    sinViolaciones(await analizar(document.body));
  });
});

describe("a11y · ZonaMapDialog · panel de inventario", () => {
  const elegirZona = async (user) => {
    const zonas = await screen.findAllByRole("button", { name: /consultar inventario/i });
    await user.click(zonas[0]);
  };

  it("con inventario cargado", async () => {
    const user = userEvent.setup();
    render(<ZonaMapDialog open onClose={vi.fn()} isAdmin />);
    await elegirZona(user);
    await screen.findByText("Dracaena draco");
    sinViolaciones(await analizar(document.body));
  });

  it("mientras carga el inventario", async () => {
    api.getZonaItems.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<ZonaMapDialog open onClose={vi.fn()} isAdmin />);
    await elegirZona(user);
    await screen.findByRole("status");
    sinViolaciones(await analizar(document.body));
  });

  it("con la confirmación de zona interna abierta", async () => {
    const user = userEvent.setup();
    render(<ZonaMapDialog open onClose={vi.fn()} isAdmin />);
    await elegirZona(user);
    await screen.findByText("Dracaena draco");
    await user.click(screen.getByRole("checkbox", { name: /interna/i }));
    const dlg = await screen.findByRole("alertdialog");
    expect(dlg).toBeInTheDocument();
    sinViolaciones(await analizar(document.body));
  });

  it("con una zona sin inventario", async () => {
    api.getZonaItems.mockResolvedValue({ items: [] });
    const user = userEvent.setup();
    render(<ZonaMapDialog open onClose={vi.fn()} isAdmin />);
    await elegirZona(user);
    await screen.findByText(/no se encontraron productos/i);
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
