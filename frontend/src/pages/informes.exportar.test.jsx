/**
 * CONTRATO DEL MENÚ DE EXPORTACIÓN — Informes.
 *
 * El botón «Exportar» declara `aria-haspopup="menu"`, pero lo que abría no era
 * un menú: eran dos botones sueltos dentro de un `div`, sin `role`, sin cierre
 * con Escape, sin navegación con flechas, y con un `div` a pantalla completa
 * cuyo único cometido era recibir un clic para cerrar — inalcanzable con
 * teclado. La promesa del atributo no se cumplía.
 *
 * axe no lo veía: el menú sólo existe abierto, y la auditoría examina la
 * pantalla en reposo. Un desajuste entre `aria-haspopup` y lo que realmente
 * hay tampoco es una regla de axe.
 *
 * Lo que se fija aquí es el COMPORTAMIENTO, no el componente: si mañana se
 * cambia de primitiva, estas pruebas deben seguir pasando.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
    getDistribucionReporte: f(), getReporteStockBajo: f(), getReporteMovimientosExternos: f(),
    descargarPedidoPdf: vi.fn(), setStoredToken: vi.fn(), getStoredToken: vi.fn(),
    clearStoredToken: vi.fn(), fetchMapaImagenUrl: f(),
  };
});

vi.mock("../utils/plantImages", () => ({
  usePlantImage: () => null,
  usePlantsWithImage: () => new Set(),
}));

import Informes from "./Informes";

const PRODUCTOS = [
  { id: 1, nombre_cientifico: "Dracaena draco", nombre_natural: "Drago", categoria: "Árbol", stock_total: 5 },
];

beforeEach(() => {
  outletContext.me = { username: "admin", rol: "admin" };
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
  api.getDistribucionReporte.mockResolvedValue({ producto: "Drago", zonas: [{ zona: "Zona 1", tamanos: [{ tamano: "C15", cantidad: 4 }] }] });
  api.getReporteStockBajo.mockResolvedValue([]);
  api.getReporteMovimientosExternos.mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

const pintar = () => render(<MemoryRouter><Informes /></MemoryRouter>);
const exportar = () => screen.getByRole("button", { name: /exportar/i });

/**
 * Deja generado el informe de distribución, que es lo que habilita «Exportar».
 *
 * Se elige distribución y no el informe por defecto porque se genera con una
 * sola llamada mockeable: lo que se está probando es el menú, no el informe.
 */
async function generarDistribucion(user) {
  pintar();
  await user.click(await screen.findByRole("button", { name: /^Distribución$/i }));
  await user.type(screen.getByLabelText(/producto/i), "Drago");
  await user.click(screen.getByRole("button", { name: /generar/i }));
  await waitFor(() => expect(exportar()).toBeEnabled());
}

describe("Informes · el menú de exportación es un menú de verdad", () => {
  it("lo que abre «Exportar» tiene rol de menú", async () => {
    const user = userEvent.setup();
    await generarDistribucion(user);

    await user.click(exportar());

    const menu = await screen.findByRole("menu");
    expect(menu).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem").length).toBeGreaterThan(0);
  });

  it("se cierra con Escape", async () => {
    const user = userEvent.setup();
    await generarDistribucion(user);

    await user.click(exportar());
    await screen.findByRole("menu");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("las opciones se recorren con las flechas, sin salir del menú", async () => {
    const user = userEvent.setup();
    await generarDistribucion(user);

    await user.click(exportar());
    const menu = await screen.findByRole("menu");

    await user.keyboard("{ArrowDown}");
    expect(menu.contains(document.activeElement)).toBe(true);
  });

  it("no queda ninguna capa a pantalla completa hecha a mano", () => {
    /*
     * El cierre por clic fuera lo tiene que resolver la primitiva. Un `div`
     * con `position: fixed` y un `onClick` es un control de ratón disfrazado
     * de capa: no se alcanza con teclado y no anuncia nada.
     */
    // Sin comentarios: uno que HABLE de la capa antigua no es una capa.
    const fuente = readFileSync(resolve(process.cwd(), "src/pages/Informes.jsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(fuente).not.toMatch(/position:\s*"fixed"/);
  });
});
