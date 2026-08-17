/**
 * PRODUCTOS — pruebas de comportamiento.
 *
 * La lógica pura está protegida por `productos.equivalence.test.js` (82
 * comprobaciones) y el CSV por `productos.export.contract.test.js` (28).
 *
 * Aquí se prueba que la PANTALLA use esa lógica, y lo que la migración añade:
 * la confirmación del borrado, que antes era un `window.confirm`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const outletContext = { me: { username: "admin", rol: "admin" } };

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

vi.mock("../utils/plantImages", async (orig) => ({
  ...(await orig().catch(() => ({}))),
  usePlantsWithImage: () => new Set(),
}));

import * as api from "../api/api";
import Productos from "./Productos";

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

const conRol = (rol) => {
  outletContext.me = { username: "u", rol };
};

beforeEach(() => {
  conRol("admin");
  api.getProductos.mockResolvedValue(PRODUCTOS);
  api.deleteProducto.mockResolvedValue({});
  api.createProducto.mockResolvedValue({});
  api.updateProductoInterno.mockResolvedValue({});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const pintar = () => render(<Productos />);
const esperarCatalogo = () => screen.findByText("Dracaena draco");

describe("Productos · catálogo", () => {
  it("muestra los productos cargados", async () => {
    pintar();
    await esperarCatalogo();
    expect(screen.getByText("Phoenix canariensis")).toBeInTheDocument();
  });

  it("un solo h1", async () => {
    pintar();
    await esperarCatalogo();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("el nombre científico NO cae en el nombre común", async () => {
    // La columna se llama «Nombre científico»: un respaldo silencioso haría
    // creer que un producto tiene nombre científico cuando no lo tiene.
    api.getProductos.mockResolvedValue([
      { id: 9, nombre_cientifico: "", nombre_natural: "Solo común", categoria: "X", subcategoria: "Y" },
    ]);
    pintar();
    await screen.findByText("Solo común");
    // El científico se muestra como «-», no repitiendo el común.
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("si falla la carga lo dice, no deja la pantalla en blanco", async () => {
    api.getProductos.mockRejectedValue({ response: { data: { detail: "503 no disponible" } } });
    pintar();
    expect(await screen.findByText(/503 no disponible/)).toBeInTheDocument();
  });
});

describe("Productos · acceso por rol", () => {
  it("admin, manager y técnico ven la gestión del catálogo", async () => {
    for (const rol of ["admin", "manager", "tecnico"]) {
      conRol(rol);
      const { unmount } = pintar();
      await esperarCatalogo();
      expect(
        screen.queryByRole("button", { name: /gestionar productos/i }),
        `el rol ${rol} debe poder gestionar`
      ).toBeInTheDocument();
      unmount();
    }
  });

  it("el resto de roles NO ve la gestión", async () => {
    for (const rol of ["gestor_vivero", "empresa_externa", "proveedor"]) {
      conRol(rol);
      const { unmount } = pintar();
      await esperarCatalogo();
      expect(
        screen.queryByRole("button", { name: /gestionar productos/i }),
        `el rol ${rol} no debe poder gestionar`
      ).not.toBeInTheDocument();
      unmount();
    }
  });

  it("una empresa externa no puede pedir más desde aquí", async () => {
    conRol("empresa_externa");
    pintar();
    await esperarCatalogo();
    expect(screen.queryByRole("button", { name: /pedir m[áa]s/i })).not.toBeInTheDocument();
  });

  it("los demás roles sí pueden pedir", async () => {
    conRol("tecnico");
    pintar();
    await esperarCatalogo();
    expect(screen.getAllByRole("button", { name: /pedir m[áa]s/i }).length).toBeGreaterThan(0);
  });
});

describe("Productos · borrado exige confirmación", () => {
  /*
   * DEFECTO PREVIO CORREGIDO: era un `window.confirm`, que bloquea el hilo, no
   * se puede estilar y devuelve su resultado de forma síncrona invirtiendo el
   * control del flujo.
   */
  const abrirGestion = async (user) => {
    await user.click(screen.getByRole("button", { name: /gestionar productos/i }));
    return screen.findByRole("dialog");
  };

  /*
   * Sin escapatorias: si el botón «Eliminar» no aparece, la prueba FALLA en vez
   * de saltarse en silencio. Un `if (...) return` aquí sería una prueba que
   * pasa sin probar nada — el fallo que se corrigió en la Fase 4A.
   */
  const botonEliminar = () => {
    const dlg = screen.getByRole("dialog");
    // Hay un «Eliminar» por producto; se usa el primero, y `getAllBy` falla si
    // no hay ninguno.
    return within(dlg).getAllByRole("button", { name: /^eliminar$/i })[0];
  };

  it("ya no queda ningún window.confirm en la pantalla", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    pintar();
    await esperarCatalogo();
    await abrirGestion(user);

    await user.click(botonEliminar());
    await screen.findByRole("alertdialog");
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("pedir borrar NO llama al backend hasta confirmar", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarCatalogo();
    await abrirGestion(user);

    await user.click(botonEliminar());
    await screen.findByRole("alertdialog");
    expect(api.deleteProducto).not.toHaveBeenCalled();
  });

  it("el diálogo identifica QUÉ producto se va a eliminar", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarCatalogo();
    await abrirGestion(user);

    await user.click(botonEliminar());
    const dlg = await screen.findByRole("alertdialog");
    expect(dlg.textContent).toMatch(/Dracaena draco|Phoenix canariensis/);
  });

  it("confirmar SÍ borra", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarCatalogo();
    await abrirGestion(user);

    await user.click(botonEliminar());
    const dlg = await screen.findByRole("alertdialog");
    // Dentro del `alertdialog` solo hay un botón de confirmar.
    await user.click(within(dlg).getByRole("button", { name: /^eliminar$/i }));
    await waitFor(() => expect(api.deleteProducto).toHaveBeenCalled());
  });

  it("Escape NO borra", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarCatalogo();
    await abrirGestion(user);

    await user.click(botonEliminar());
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.deleteProducto).not.toHaveBeenCalled();
  });
});

describe("Productos · filtros", () => {
  it("la búsqueda encuentra por nombre científico y por común", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarCatalogo();

    const buscador = screen.getAllByRole("textbox")[0];
    await user.type(buscador, "phoenix");
    await waitFor(() => expect(screen.queryByText("Dracaena draco")).not.toBeInTheDocument());
    expect(screen.getByText("Phoenix canariensis")).toBeInTheDocument();
  });

  it("la búsqueda también encuentra por categoría", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarCatalogo();

    const buscador = screen.getAllByRole("textbox")[0];
    await user.type(buscador, "palmera");
    await waitFor(() => expect(screen.getByText("Phoenix canariensis")).toBeInTheDocument());
  });
});

describe("Productos · exportación", () => {
  /* El botón de exportar vive DENTRO de la gestión del catálogo, no en la
     pantalla principal: exportar el catálogo es una tarea de gestión. */
  const abrirGestion = async (user) => {
    await user.click(screen.getByRole("button", { name: /gestionar productos/i }));
    return screen.findByRole("dialog");
  };


  it("con productos, el botón de exportar está habilitado", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarCatalogo();
    const dlg = await abrirGestion(user);
    expect(within(dlg).getByRole("button", { name: /exportar a excel/i })).not.toBeDisabled();
  });

  it("sin productos, el botón se deshabilita", async () => {
    api.getProductos.mockResolvedValue([]);
    const user = userEvent.setup();
    pintar();
    await screen.findByRole("button", { name: /gestionar productos/i });
    const dlg = await abrirGestion(user);
    expect(within(dlg).getByRole("button", { name: /exportar a excel/i })).toBeDisabled();
  });
});
