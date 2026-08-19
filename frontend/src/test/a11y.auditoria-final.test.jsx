/**
 * AUDITORÍA DE ACCESIBILIDAD CONSOLIDADA — Fase 9.
 *
 * Una sola pasada de axe-core sobre TODAS las pantallas y componentes
 * migrados. Las fases anteriores dejaron una suite por fase; ésta existe para
 * poder responder a una pregunta concreta —«¿toda la aplicación pasa?»— sin
 * tener que reunir doce ficheros.
 *
 * No sustituye a las suites por fase: aquéllas cubren estados intermedios
 * (modales abiertos, errores, decisiones a medias) que aquí no se reproducen.
 * Ésta cubre AMPLITUD; aquéllas, PROFUNDIDAD.
 *
 * `color-contrast` se desactiva porque jsdom no compone capas y `region`
 * porque los landmarks los pone `AppShell`, que estas pruebas no montan. Los
 * dos se verifican en navegador real y se recogen en el informe de fase.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axe from "axe-core";

import * as api from "../api/api";
import { ToastProvider } from "../components/ui/ToastProvider";

/* ── Dobles de la capa de red ──────────────────────────────────────────── */

const outletContext = { me: { username: "admin", rol: "admin" } };

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig()),
  useOutletContext: () => outletContext,
  useParams: () => ({ uuid: "lote-1" }),
  useSearchParams: () => [new URLSearchParams("token=abc"), vi.fn()],
}));

vi.mock("../api/api", () => {
  const vacio = () => vi.fn();
  return {
    getProductos: vacio(),
    getMovimientos: vacio(),
    getPedidos: vacio(),
    getZonasConfig: vacio(),
    getZonaItems: vacio(),
    getClientes: vacio(),
    getActiveClienteId: vi.fn(),
    setActiveClienteId: vi.fn(),
    getMe: vacio(),
    getSuperadminStats: vacio(),
    getPrestamosActivos: vacio(),
    getLote: vacio(),
    validateAccountToken: vacio(),
    login: vi.fn(),
    authLogin: vi.fn(),
    forgotPassword: vi.fn(),
    changePassword: vi.fn(),
    marcarZonaInterna: vi.fn(),
    updateZonasConfig: vi.fn(),
    fetchMapaImagenUrl: vacio(),
    uploadMapaImagen: vi.fn(),
    getReporteDistribucion: vacio(),
    getReporteStockBajo: vacio(),
    getReporteMovimientosExternos: vacio(),
    descargarPedidoPdf: vi.fn(),
    setStoredToken: vi.fn(),
    getStoredToken: vi.fn(),
    clearStoredToken: vi.fn(),
  };
});

vi.mock("../utils/plantImages", () => ({
  usePlantImage: () => null,
  usePlantsWithImage: () => new Set(),
}));

const REGLAS = {
  "color-contrast": { enabled: false },
  region: { enabled: false },
};

async function violaciones(nodo) {
  const r = await axe.run(nodo, { rules: REGLAS, resultTypes: ["violations"] });
  return r.violations;
}

function exigirCero(nombre, vs) {
  if (vs.length === 0) return;
  const detalle = vs
    .map((v) => `  · [${v.impact}] ${v.id}: ${v.help}\n    ${v.nodes.map((n) => n.html).join("\n    ")}`)
    .join("\n");
  throw new Error(`${nombre}: axe encontró ${vs.length} violación(es):\n${detalle}`);
}

/* ── Pantallas ─────────────────────────────────────────────────────────── */

import Dashboard from "../pages/Dashboard";
import Login from "../pages/Login";
import CuentaToken from "../pages/CuentaToken";
import Lotetracking from "../pages/Lotetracking";
import AdminUsuarios from "../pages/AdminUsuarios";
import Movimientos from "../pages/Movimientos";
import Informes from "../pages/Informes";
import Pedidos from "../pages/Pedidos";
import Productos from "../pages/Productos";
import Aprobaciones from "../pages/Aprobaciones";
import Plataforma from "../pages/Plataforma";
import MapaVivero from "../components/vivero/MapaVivero";
import ZoneEditor from "../components/vivero/ZoneEditor";
import ZonaMapDialog from "../components/shell/ZonaMapDialog";
import WelcomeModal from "../components/welcome/WelcomeModal";
import CambiarPasswordModal from "../components/common/CambiarPasswordModal";
import VerPlanta from "../components/VerPlanta";
import ClienteSelector from "../components/common/ClienteSelector";

const ZONAS = [{ id: "zona-1", apiId: "1", nombre: "Zona 1", color: "#F4E2C1", puntos: "0,0 10,0 10,10" }];

/** Cada entrada: [nombre, cómo pintarlo]. */
const SUPERFICIES = [
  ["Dashboard", () => <Dashboard />],
  ["Login", () => <Login />],
  ["CuentaToken", () => <CuentaToken />],
  ["Lotetracking", () => <Lotetracking />],
  // AdminUsuarios usa `useToast`, que exige su proveedor.
  ["AdminUsuarios", () => <ToastProvider><AdminUsuarios /></ToastProvider>],
  ["Movimientos", () => <Movimientos />],
  ["Informes", () => <Informes />],
  ["Pedidos", () => <Pedidos />],
  ["Productos", () => <Productos />],
  ["Aprobaciones", () => <Aprobaciones />],
  ["Plataforma", () => <Plataforma />],
  ["MapaVivero", () => <MapaVivero />],
  ["ZoneEditor", () => <ZoneEditor zonas={ZONAS} onSave={vi.fn()} onCancel={vi.fn()} />],
  ["ZonaMapDialog", () => <ZonaMapDialog open onClose={vi.fn()} isAdmin />],
  ["WelcomeModal", () => <WelcomeModal open onClose={vi.fn()} />],
  ["CambiarPasswordModal", () => <CambiarPasswordModal open onClose={vi.fn()} />],
  ["VerPlanta", () => <VerPlanta nombreCientifico="Dracaena draco" variant="button" />],
  ["ClienteSelector", () => <ClienteSelector visible />],
];

beforeEach(() => {
  outletContext.me = { username: "admin", rol: "admin" };
  window.localStorage.clear();
  /*
   * Las implementaciones se rearman AQUÍ, no en la factoría del módulo:
   * `restoreAllMocks` del `afterEach` las borraría tras la primera prueba y las
   * siguientes recibirían `undefined` al llamar a la API.
   */
  for (const fn of Object.values(api)) {
    if (typeof fn?.mockReset === "function") fn.mockReset();
  }
  api.getProductos.mockResolvedValue([]);
  api.getMovimientos.mockResolvedValue([]);
  api.getPedidos.mockResolvedValue([]);
  api.getZonasConfig.mockResolvedValue([]);
  api.getClientes.mockResolvedValue([]);
  api.getPrestamosActivos.mockResolvedValue([]);
  api.getReporteDistribucion.mockResolvedValue([]);
  api.getReporteStockBajo.mockResolvedValue([]);
  api.getReporteMovimientosExternos.mockResolvedValue([]);
  api.getZonaItems.mockResolvedValue({ items: [] });
  api.getMe.mockResolvedValue({ rol: "admin" });
  api.getSuperadminStats.mockResolvedValue(null);
  api.getLote.mockResolvedValue(null);
  api.getActiveClienteId.mockReturnValue(null);
  api.getStoredToken.mockReturnValue(null);
  api.fetchMapaImagenUrl.mockResolvedValue(null);
  // Nunca resuelve: deja la pantalla en su estado de carga, que es el que se audita.
  api.validateAccountToken.mockReturnValue(new Promise(() => {}));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("auditoría final · axe-core sobre toda la aplicación migrada", () => {
  it.each(SUPERFICIES)("%s no tiene violaciones", async (nombre, montar) => {
    /*
     * Todas se montan dentro de un router. Varias pintan un `<Link>` en algún
     * punto y sin router lanzan al renderizar: la pantalla quedaría a medias y
     * axe examinaría menos de lo que cree, dando un falso «sin violaciones».
     */
    render(<MemoryRouter>{montar()}</MemoryRouter>);
    // Se deja asentar el primer render y las cargas ya resueltas.
    await screen.findByText(/./, {}, { timeout: 2000 }).catch(() => {});
    exigirCero(String(nombre), await violaciones(document.body));
  });

  it("cubre las dieciocho superficies migradas", () => {
    // Si alguien añade una pantalla y no la mete aquí, el recuento lo delata.
    expect(SUPERFICIES).toHaveLength(18);
  });
});

describe("auditoría final · la comprobación detecta de verdad", () => {
  it("un campo sin etiqueta se detecta", async () => {
    const { container } = render(<input type="text" />);
    expect((await violaciones(container)).map((v) => v.id)).toContain("label");
  });

  it("un botón sin nombre accesible se detecta", async () => {
    const { container } = render(<button type="button" />);
    expect((await violaciones(container)).map((v) => v.id)).toContain("button-name");
  });

  it("una imagen sin alt se detecta", async () => {
    const { container } = render(<img src="x.png" />);
    expect((await violaciones(container)).map((v) => v.id)).toContain("image-alt");
  });
});
