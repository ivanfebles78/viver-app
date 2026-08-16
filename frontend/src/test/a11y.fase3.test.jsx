/**
 * ACCESIBILIDAD AUTOMÁTICA — pantallas de la Fase 3.
 *
 * axe-core sobre las cuatro pantallas migradas, en TODOS sus estados: carga,
 * error, vacío y con datos. Un análisis sobre una pantalla vacía no demuestra
 * nada, así que cada caso comprueba primero que el contenido que dice examinar
 * está realmente en el DOM.
 *
 * QUÉ NO ES ESTO. axe detecta del orden de un tercio de los problemas reales de
 * accesibilidad: sirve para que no se cuelen regresiones mecánicas —un campo
 * sin etiqueta, un contraste insuficiente, una tabla sin cabeceras—, no para
 * afirmar conformidad. La revisión con teclado y lector de pantalla se hace
 * aparte y se documenta en el informe de fase. No se declara certificación
 * alguna.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import axe from "axe-core";

const navigate = vi.fn();
let paramsToken = "tok";

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig()),
  useNavigate: () => navigate,
  useParams: () => ({ token: paramsToken }),
}));

vi.mock("../api/api", () => ({
  getMe: vi.fn(),
  getProductos: vi.fn(),
  getPedidos: vi.fn(),
  getLote: vi.fn(),
  login: vi.fn(),
  requestPasswordReset: vi.fn(),
  validateAccountToken: vi.fn(),
  consumeAccountToken: vi.fn(),
}));

import * as api from "../api/api";
import Dashboard from "../pages/Dashboard";
import Login from "../pages/Login";
import CuentaToken from "../pages/CuentaToken";
import Lotetracking from "../pages/Lotetracking";

/**
 * Reglas que jsdom no puede evaluar con honestidad.
 *
 * `color-contrast` necesita composición real de capas y fuentes cargadas;
 * jsdom no pinta, así que axe devolvería «incompleto» o falsos positivos. El
 * contraste se verifica en navegador y se recoge en el informe de fase.
 */
const REGLAS_DESACTIVADAS = {
  "color-contrast": { enabled: false },
};

async function analizar(container) {
  const resultado = await axe.run(container, {
    rules: REGLAS_DESACTIVADAS,
    resultTypes: ["violations"],
  });
  return resultado.violations;
}

/** Falla con el detalle completo, no con un «expected 1 to be 0». */
function sinViolaciones(violations) {
  if (violations.length === 0) return;
  const detalle = violations
    .map((v) => `  · [${v.impact}] ${v.id}: ${v.help}\n    ${v.nodes.map((n) => n.html).join("\n    ")}`)
    .join("\n");
  throw new Error(`axe encontró ${violations.length} violación(es):\n${detalle}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getMe.mockResolvedValue({ id: 1, rol: "admin_vivero" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a11y · Panel de control", () => {
  const productos = [
    {
      id: 1, nombre_natural: "Drago", categoria: "Árbol", stock: 2, stock_minimo: 10,
      lotes: [{ uuid: "L1", zona: "A", tamano: "C14", cantidad: 5, fecha_caducidad: "2020-01-01" }],
    },
    { id: 2, nombre_natural: "Palmera", categoria: "Palmera", stock: 80, stock_minimo: 10 },
  ];

  it("con datos, incluidas tablas y barras de proporción", async () => {
    api.getProductos.mockResolvedValue(productos);
    api.getPedidos.mockResolvedValue([{ estado: "RESERVA" }, { estado: "APROBADO" }]);
    const { container } = render(<MemoryRouter><Dashboard /></MemoryRouter>);

    // Comprobar que hay algo que analizar: si no, el análisis pasa por vacío.
    await screen.findByText("Productos");
    expect(screen.getAllByRole("table").length).toBeGreaterThan(0);

    sinViolaciones(await analizar(container));
  });

  it("mientras carga", async () => {
    api.getProductos.mockReturnValue(new Promise(() => {}));
    api.getPedidos.mockResolvedValue([]);
    const { container } = render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(screen.getByText(/cargando el estado del vivero/i)).toBeInTheDocument();
    sinViolaciones(await analizar(container));
  });

  it("con datos parciales y aviso", async () => {
    api.getProductos.mockResolvedValue(productos);
    api.getPedidos.mockRejectedValue(new Error("502"));
    const { container } = render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await screen.findByText(/no se han podido cargar/i);
    sinViolaciones(await analizar(container));
  });

  it("sin nada que requiera atención", async () => {
    api.getProductos.mockResolvedValue([{ id: 1, nombre_natural: "X", stock: 90, stock_minimo: 1 }]);
    api.getPedidos.mockResolvedValue([]);
    const { container } = render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await screen.findByText("Productos");
    sinViolaciones(await analizar(container));
  });
});

describe("a11y · Entrada", () => {
  it("formulario en reposo", async () => {
    const { container } = render(<MemoryRouter><Login /></MemoryRouter>);
    expect(screen.getByLabelText(/usuario/i)).toBeInTheDocument();
    sinViolaciones(await analizar(container));
  });

  it("con un error de credenciales visible", async () => {
    const user = userEvent.setup();
    api.login.mockRejectedValue({ response: { data: { detail: "Credenciales incorrectas" } } });
    const { container } = render(<MemoryRouter><Login /></MemoryRouter>);

    await user.type(screen.getByLabelText(/usuario/i), "a");
    await user.type(screen.getByLabelText(/^contraseña/i), "b");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));
    await screen.findByRole("alert");

    sinViolaciones(await analizar(container));
  });

  it("con el diálogo de restablecer abierto", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Login /></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: /olvidado tu contraseña/i }));
    const dialogo = await screen.findByRole("dialog");
    // El diálogo se monta en un portal: se analiza donde realmente está.
    sinViolaciones(await analizar(dialogo.closest("body") ? document.body : dialogo));
  });
});

describe("a11y · Cuenta por token", () => {
  it("formulario", async () => {
    api.validateAccountToken.mockResolvedValue({ purpose: "activate", username: "maria" });
    const { container } = render(<MemoryRouter><CuentaToken /></MemoryRouter>);
    await screen.findByText(/activa tu cuenta/i);
    expect(screen.getByLabelText(/nueva contraseña/i)).toBeInTheDocument();
    sinViolaciones(await analizar(container));
  });

  it("enlace no válido", async () => {
    api.validateAccountToken.mockRejectedValue(new Error("caducado"));
    const { container } = render(<MemoryRouter><CuentaToken /></MemoryRouter>);
    await screen.findByText(/no es válido/i);
    sinViolaciones(await analizar(container));
  });

  it("éxito", async () => {
    const user = userEvent.setup();
    api.validateAccountToken.mockResolvedValue({ purpose: "reset", username: "m" });
    api.consumeAccountToken.mockResolvedValue({});
    const { container } = render(<MemoryRouter><CuentaToken /></MemoryRouter>);
    await screen.findByText(/restablece tu contraseña/i);
    await user.type(screen.getByLabelText(/nueva contraseña/i), "contrasena-larga");
    await user.type(screen.getByLabelText(/confirma/i), "contrasena-larga");
    await user.click(screen.getByRole("button", { name: /guardar la nueva/i }));
    await screen.findByRole("status");
    sinViolaciones(await analizar(container));
  });
});

describe("a11y · Seguimiento de lote", () => {
  it("estado inicial", async () => {
    const { container } = render(<MemoryRouter><Lotetracking /></MemoryRouter>);
    expect(screen.getByLabelText(/identificador del lote/i)).toBeInTheDocument();
    sinViolaciones(await analizar(container));
  });

  it("con la tabla de movimientos", async () => {
    const user = userEvent.setup();
    api.getLote.mockResolvedValue({
      uuid: "3f2a91c4-8b17-4e5d-9a2f-71c6e0d4b8aa",
      cantidad_inicial: 1200,
      movimientos: [
        {
          fecha: "2026-01-15T10:00:00Z", origen: "Semillero", destino: "Zona A",
          zona_origen: "S1", zona_destino: "A3",
          tamano_origen: "C7", tamano_destino: "C14", cantidad: 500,
        },
      ],
    });
    const { container } = render(<MemoryRouter><Lotetracking /></MemoryRouter>);
    await user.type(screen.getByLabelText(/identificador del lote/i), "x{Enter}");
    await screen.findByRole("table");
    sinViolaciones(await analizar(container));
  });

  it("lote no encontrado", async () => {
    const user = userEvent.setup();
    api.getLote.mockRejectedValue({ response: { status: 404 } });
    const { container } = render(<MemoryRouter><Lotetracking /></MemoryRouter>);
    await user.type(screen.getByLabelText(/identificador del lote/i), "x{Enter}");
    await screen.findByText(/no se encontró/i);
    sinViolaciones(await analizar(container));
  });
});

describe("a11y · la comprobación detecta de verdad", () => {
  it("un campo sin etiqueta se detecta", async () => {
    /*
     * Sin esto, no habría forma de distinguir «no hay violaciones» de «axe no
     * llegó a ejecutarse». Es la prueba de la prueba.
     */
    const { container } = render(<input type="text" />);
    const violaciones = await analizar(container);
    expect(violaciones.map((v) => v.id)).toContain("label");
  });
});
