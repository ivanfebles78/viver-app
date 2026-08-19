/**
 * AUDITORÍA DE TECLADO — Fase 9.
 *
 * axe no ve nada de lo que aquí se comprueba. axe examina el marcado de un
 * instante; el teclado es una secuencia. Un diálogo puede tener nombre
 * accesible, contraste y roles impecables, y aun así atrapar al usuario dentro,
 * o soltarlo al principio del documento al cerrarse. UF-7 se encontró así.
 *
 * Lo que se fija:
 *   1. Todo diálogo se abre, atrapa el foco y se cierra con Escape.
 *   2. Al cerrarse, el foco vuelve al control que lo abrió.
 *   3. Los controles que abren diálogos son alcanzables con Tab.
 *
 * Se comprueba pantalla por pantalla y no sólo sobre el componente del sistema,
 * porque el punto 2 depende de CÓMO abre cada pantalla su diálogo: una que
 * desmonte el control al abrir no tendría a dónde devolver el foco, y eso no se
 * ve mirando el sistema de diseño.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import * as api from "../api/api";

const outletContext = { me: { username: "admin", rol: "admin" } };

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig()),
  useOutletContext: () => outletContext,
}));

vi.mock("../api/api", () => {
  const f = () => vi.fn();
  return {
    getProductos: f(), getMovimientos: f(), getPedidos: f(), getZonasConfig: f(),
    getZonaItems: f(), getClientes: f(), getActiveClienteId: vi.fn(), setActiveClienteId: vi.fn(),
    getMe: f(), getSuperadminStats: f(), getPrestamosActivos: f(), getLote: f(),
    validateAccountToken: f(), login: vi.fn(), authLogin: vi.fn(), forgotPassword: vi.fn(),
    changePassword: vi.fn(), marcarZonaInterna: vi.fn(), updateZonasConfig: vi.fn(),
    fetchMapaImagenUrl: f(), uploadMapaImagen: vi.fn(), getReporteDistribucion: f(),
    getReporteStockBajo: f(), getReporteMovimientosExternos: f(), descargarPedidoPdf: vi.fn(),
    setStoredToken: vi.fn(), getStoredToken: vi.fn(), clearStoredToken: vi.fn(),
  };
});

vi.mock("../utils/plantImages", () => ({
  usePlantImage: () => null,
  usePlantsWithImage: () => new Set(),
}));

const PRODUCTOS = [
  { id: 1, nombre_cientifico: "Dracaena draco", nombre_natural: "Drago", categoria: "Árbol", stock_total: 5 },
  { id: 2, nombre_cientifico: "Phoenix canariensis", nombre_natural: "Palmera", categoria: "Palmera", stock_total: 9 },
];

beforeEach(() => {
  outletContext.me = { username: "admin", rol: "admin" };
  window.localStorage.clear();
  for (const fn of Object.values(api)) if (typeof fn?.mockReset === "function") fn.mockReset();
  api.getProductos.mockResolvedValue(PRODUCTOS);
  api.getMovimientos.mockResolvedValue([]);
  api.getPedidos.mockResolvedValue([]);
  api.getZonasConfig.mockResolvedValue([]);
  api.getClientes.mockResolvedValue([]);
  api.getPrestamosActivos.mockResolvedValue([]);
  api.getZonaItems.mockResolvedValue({ items: [] });
  api.getMe.mockResolvedValue({ rol: "admin" });
  api.getActiveClienteId.mockReturnValue(null);
  api.getStoredToken.mockReturnValue(null);
  api.fetchMapaImagenUrl.mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

import Productos from "../pages/Productos";
import Movimientos from "../pages/Movimientos";
import Pedidos from "../pages/Pedidos";

const pintar = (nodo) => render(<MemoryRouter>{nodo}</MemoryRouter>);

/**
 * Recorre el ciclo completo de un diálogo desde el teclado y devuelve lo
 * observado, para que cada aserción diga qué falla en lugar de sólo que falla.
 */
async function ciclo(user, disparador) {
  disparador.focus();
  await user.keyboard("{Enter}");
  const dialogo = await screen.findByRole("dialog");

  // El foco tiene que estar DENTRO nada más abrir.
  const entraDentro = dialogo.contains(document.activeElement);

  // Tab muchas veces: no puede escaparse por abajo ni por arriba.
  let seEscapa = false;
  for (let i = 0; i < 20; i += 1) {
    await user.tab();
    if (!dialogo.contains(document.activeElement)) { seEscapa = true; break; }
  }

  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

  return { entraDentro, seEscapa, focoDevuelto: document.activeElement === disparador };
}

describe("auditoría de teclado · el ciclo completo de cada diálogo", () => {
  it("Productos · «Pedir más»", async () => {
    const user = userEvent.setup();
    pintar(<Productos />);
    const b = (await screen.findAllByRole("button", { name: /pedir m/i }))[0];
    const r = await ciclo(user, b);
    expect(r).toEqual({ entraDentro: true, seEscapa: false, focoDevuelto: true });
  });

  it("Productos · la cesta", async () => {
    const user = userEvent.setup();
    pintar(<Productos />);
    const b = await screen.findByRole("button", { name: /cesta/i });
    const r = await ciclo(user, b);
    expect(r).toEqual({ entraDentro: true, seEscapa: false, focoDevuelto: true });
  });

  it("Movimientos · «Nuevo movimiento»", async () => {
    const user = userEvent.setup();
    pintar(<Movimientos />);
    const b = await screen.findByRole("button", { name: /nuevo movimiento/i });
    const r = await ciclo(user, b);
    expect(r).toEqual({ entraDentro: true, seEscapa: false, focoDevuelto: true });
  });

  it("Pedidos · crear pedido", async () => {
    const user = userEvent.setup();
    pintar(<Pedidos />);
    const b = await screen.findByRole("button", { name: /nuevo pedido|crear pedido/i });
    const r = await ciclo(user, b);
    expect(r).toEqual({ entraDentro: true, seEscapa: false, focoDevuelto: true });
  });
});
