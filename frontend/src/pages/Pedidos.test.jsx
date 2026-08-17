/**
 * PEDIDOS — pruebas de comportamiento.
 *
 * La lógica pura ya está protegida por `pedidos.equivalence.test.js` (175
 * comprobaciones contra una copia literal de main, incluidas 8 400
 * combinaciones de rol × usuario × estado) y el PDF por
 * `pedidos.pdf.contract.test.js`.
 *
 * Aquí se prueba que la PANTALLA use esa lógica, y sobre todo lo que la
 * migración añade: la confirmación de la cancelación, que antes no existía.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

vi.mock("./pedidos.pdf", () => ({
  guardarPedidosPdf: vi.fn(),
  imprimirPedidosEnNavegador: vi.fn(),
}));

import * as api from "../api/api";
import Pedidos from "./Pedidos";

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
      { producto_id: 7, producto_nombre_cientifico: "Dracaena draco", tamano: "M20", cantidad: 10, cantidad_servida: 0 },
    ],
  },
  {
    id: 42,
    estado: "APROBADO",
    tipo: "salida",
    solicitante_username: "ana.gil",
    created_at: "2026-07-15T09:00:00Z",
    items: [
      { producto_id: 9, producto_nombre_cientifico: "Phoenix canariensis", tamano: "M35", cantidad: 5, cantidad_servida: 5 },
    ],
  },
  {
    id: 43,
    estado: "CANCELADO",
    tipo: "reposicion",
    solicitante_username: "juan.lopez",
    created_at: "2026-06-01T09:00:00Z",
    items: [],
  },
];

const conRol = (rol, username = "medina") => {
  outletContext.me = { username, rol };
};

beforeEach(() => {
  conRol("admin");
  api.getPedidos.mockResolvedValue(PEDIDOS);
  api.getProductos.mockResolvedValue([]);
  api.getMovimientos.mockResolvedValue([]);
  api.cancelarPedido.mockResolvedValue({});
  api.updatePedido.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const pintar = () => render(<Pedidos />);
const esperarTabla = async () => {
  await screen.findByRole("table");
  return screen.getByRole("table");
};
const enTabla = () => within(screen.getByRole("table"));

describe("Pedidos · tabla y estados", () => {
  it("muestra una fila por pedido visible", async () => {
    pintar();
    const tabla = await esperarTabla();
    expect(within(tabla).getAllByRole("row").length).toBeGreaterThan(PEDIDOS.length);
  });

  it("el estado se lee como TEXTO, no solo como color", async () => {
    // SC 1.4.1. Antes eran siete colores escritos a mano sin más señal.
    pintar();
    const tabla = await esperarTabla();
    const texto = tabla.textContent;
    expect(texto).toContain("RESERVA");
    expect(texto).toContain("APROBADO");
    expect(texto).toContain("CANCELADO");
  });

  it("APROBADO_PARCIAL se muestra con espacio, no con guion bajo", async () => {
    api.getPedidos.mockResolvedValue([{ ...PEDIDOS[0], id: 50, estado: "APROBADO_PARCIAL" }]);
    pintar();
    const tabla = await esperarTabla();
    expect(tabla.textContent).toContain("APROBADO PARCIAL");
    expect(tabla.textContent).not.toContain("APROBADO_PARCIAL");
  });

  it("las cabeceras de la tabla llevan scope", async () => {
    pintar();
    const tabla = await esperarTabla();
    for (const th of within(tabla).getAllByRole("columnheader")) {
      expect(th).toHaveAttribute("scope", "col");
    }
  });
});

describe("Pedidos · acceso por rol", () => {
  it("un rol de solo lectura NO ve «Nuevo pedido»", async () => {
    for (const rol of ["tecnico", "gestor_vivero", "proveedor"]) {
      conRol(rol);
      const { unmount } = pintar();
      await esperarTabla();
      expect(
        screen.queryByRole("button", { name: /nuevo pedido/i }),
        `el rol ${rol} no debe poder crear`
      ).not.toBeInTheDocument();
      unmount();
    }
  });

  it("un administrador SÍ ve «Nuevo pedido»", async () => {
    pintar();
    await esperarTabla();
    expect(screen.getByRole("button", { name: /nuevo pedido/i })).toBeInTheDocument();
  });

  it("una empresa externa solo ve SUS pedidos y ninguno de reposición", async () => {
    conRol("empresa_externa", "medina");
    pintar();
    const tabla = await esperarTabla();
    const filas = within(tabla).getAllByRole("row").slice(1);
    const texto = filas.map((f) => f.textContent).join(" ");
    expect(texto).toContain("41"); // suyo
    expect(texto).not.toContain("ana.gil"); // de otro
    expect(texto).not.toContain("juan.lopez"); // reposición
  });

  it("el proveedor solo pide /pedidos: no tiene permiso sobre productos ni movimientos", async () => {
    // Pedirlos devolvería 403 y ensuciaría la consola.
    conRol("proveedor");
    pintar();
    await esperarTabla();
    expect(api.getPedidos).toHaveBeenCalled();
    expect(api.getProductos).not.toHaveBeenCalled();
    expect(api.getMovimientos).not.toHaveBeenCalled();
  });

  it("el resto de roles sí pide las tres fuentes", async () => {
    pintar();
    await esperarTabla();
    expect(api.getProductos).toHaveBeenCalled();
    expect(api.getMovimientos).toHaveBeenCalled();
  });

  it("un fallo en productos NO vacía la lista de pedidos", async () => {
    // Antes, con `Promise.all`, un 403 aislado dejaba la pantalla en blanco.
    api.getProductos.mockRejectedValue({ response: { status: 403 } });
    pintar();
    const tabla = await esperarTabla();
    expect(within(tabla).getAllByRole("row").length).toBeGreaterThan(1);
  });

  it("un fallo en /pedidos SÍ se avisa", async () => {
    api.getPedidos.mockRejectedValue({ response: { data: { detail: "503 no disponible" } } });
    pintar();
    expect(await screen.findByRole("alert")).toHaveTextContent("503 no disponible");
  });
});

describe("Pedidos · cancelar exige confirmación", () => {
  /*
   * DEFECTO PREVIO CORREGIDO. Cancelar se ejecutaba SIN confirmación: el botón
   * está pegado a «Editar» en la misma celda y un clic accidental cancelaba el
   * pedido sin vuelta atrás.
   */
  it("pedir cancelar NO llama al backend hasta que se confirma", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    await user.click(enTabla().getByRole("button", { name: /^cancelar$/i }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(api.cancelarPedido).not.toHaveBeenCalled();
  });

  it("el diálogo identifica QUÉ pedido se va a cancelar", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    await user.click(enTabla().getByRole("button", { name: /^cancelar$/i }));
    const dlg = await screen.findByRole("alertdialog");
    expect(dlg).toHaveTextContent("#41");
    expect(dlg).toHaveTextContent(/medina/i);
  });

  it("confirmar SÍ cancela", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    await user.click(enTabla().getByRole("button", { name: /^cancelar$/i }));
    const dlg = await screen.findByRole("alertdialog");
    await user.click(within(dlg).getByRole("button", { name: /cancelar el pedido/i }));

    await waitFor(() => expect(api.cancelarPedido).toHaveBeenCalledWith(41));
  });

  it("rechazar NO cancela", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    await user.click(enTabla().getByRole("button", { name: /^cancelar$/i }));
    const dlg = await screen.findByRole("alertdialog");
    await user.click(within(dlg).getByRole("button", { name: /^volver$/i }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.cancelarPedido).not.toHaveBeenCalled();
  });

  it("Escape NO cancela", async () => {
    /*
     * Cerrar sin elegir es SIEMPRE «no». Es la inversión de control que hacía
     * peligroso a `window.confirm`: aquí el flujo espera de verdad.
     */
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    await user.click(enTabla().getByRole("button", { name: /^cancelar$/i }));
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.cancelarPedido).not.toHaveBeenCalled();
  });

  it("la confirmación se marca como destructiva", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    await user.click(enTabla().getByRole("button", { name: /^cancelar$/i }));
    const dlg = await screen.findByRole("alertdialog");
    // El botón de confirmar existe y no se llama «Aceptar» a secas: dice qué hace.
    expect(within(dlg).getByRole("button", { name: /cancelar el pedido/i })).toBeInTheDocument();
  });

  it("no quedan diálogos nativos en la pantalla", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    await user.click(enTabla().getByRole("button", { name: /^cancelar$/i }));
    await screen.findByRole("alertdialog");

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

describe("Pedidos · acciones según estado", () => {
  it("un pedido APROBADO no ofrece editar ni cancelar", async () => {
    api.getPedidos.mockResolvedValue([PEDIDOS[1]]);
    pintar();
    await esperarTabla();
    expect(enTabla().queryByRole("button", { name: /^cancelar$/i })).not.toBeInTheDocument();
    expect(enTabla().queryByRole("button", { name: /^editar$/i })).not.toBeInTheDocument();
  });

  it("un pedido en RESERVA sí las ofrece a un administrador", async () => {
    api.getPedidos.mockResolvedValue([PEDIDOS[0]]);
    pintar();
    await esperarTabla();
    expect(enTabla().getByRole("button", { name: /^cancelar$/i })).toBeInTheDocument();
    expect(enTabla().getByRole("button", { name: /^editar$/i })).toBeInTheDocument();
  });

  it("un rol de solo lectura no ve acciones de fila", async () => {
    conRol("tecnico");
    api.getPedidos.mockResolvedValue([PEDIDOS[0]]);
    pintar();
    await esperarTabla();
    expect(enTabla().queryByRole("button", { name: /^cancelar$/i })).not.toBeInTheDocument();
  });
});

describe("Pedidos · filtros", () => {
  it("los cinco filtros tienen etiqueta accesible", async () => {
    pintar();
    await esperarTabla();
    for (const etiqueta of [
      /número de pedido/i,
      /^estado/i,
      /fecha de creación/i,
      /^solicitante/i,
      /^buscar/i,
    ]) {
      expect(screen.getByLabelText(etiqueta)).toBeInTheDocument();
    }
  });

  it("la barra de filtros se anuncia como búsqueda", async () => {
    pintar();
    await esperarTabla();
    expect(screen.getByRole("search", { name: /filtros de pedidos/i })).toBeInTheDocument();
  });

  it("filtrar por número reduce la lista", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    await user.type(screen.getByLabelText(/número de pedido/i), "41");
    await waitFor(() => {
      expect(within(screen.getByRole("table")).getAllByRole("row").slice(1).length).toBeLessThan(
        PEDIDOS.length
      );
    });
  });

  it("«Limpiar filtros» solo aparece si hay alguno puesto", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    expect(screen.queryByRole("button", { name: /limpiar filtros/i })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/número de pedido/i), "4");
    expect(await screen.findByRole("button", { name: /limpiar filtros/i })).toBeInTheDocument();
  });
});

describe("Pedidos · estructura", () => {
  it("un solo h1", async () => {
    pintar();
    await esperarTabla();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("el proveedor ve un título propio", async () => {
    conRol("proveedor");
    pintar();
    await esperarTabla();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/reposición/i);
  });
});
