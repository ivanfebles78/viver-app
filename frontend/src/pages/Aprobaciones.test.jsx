/**
 * APROBACIONES — pruebas de comportamiento de la pantalla.
 *
 * La lógica pura está fijada por `aprobaciones.equivalence.test.js` (45
 * comprobaciones) contra una copia literal de main. Aquí se prueba que la
 * PANTALLA use esa lógica, y lo que la migración añade: la confirmación de las
 * decisiones irreversibles.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const outletContext = { me: { username: "jefa", rol: "manager" } };

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig()),
  useOutletContext: () => outletContext,
}));

vi.mock("../api/api", () => ({
  getPedidos: vi.fn(),
  aprobarPedido: vi.fn(),
  denegarPedido: vi.fn(),
  decidirPedido: vi.fn(),
  descargarPedidoPdf: vi.fn(),
}));

import * as api from "../api/api";
import Aprobaciones from "./Aprobaciones";

const linea = (id, estado_item, extra = {}) => ({
  id,
  estado_item,
  producto_id: 500 + id,
  producto_nombre_cientifico: `Producto ${id}`,
  tamano: "M20",
  cantidad: 100 * id,
  cantidad_servida: 0,
  ...extra,
});

/** Un pedido de UNA línea en reserva: el único que muestra el atajo de fila. */
const PEDIDO_SIMPLE = {
  id: 1,
  estado: "RESERVA",
  tipo: "suministro",
  created_at: "2026-05-10T09:00:00",
  solicitante_username: "medina",
  distrito_destino: "Centro-Ifara",
  items: [linea(1, "RESERVA")],
};

/** Un pedido de VARIAS líneas: obliga a pasar por el modal. */
const PEDIDO_MULTI = {
  id: 2,
  estado: "RESERVA",
  tipo: "suministro",
  created_at: "2026-05-09T09:00:00",
  solicitante_username: "ute_jardines",
  distrito_destino: "Salud-La Salle",
  items: [linea(11, "RESERVA"), linea(12, "RESERVA"), linea(13, "APROBADO")],
};

const conRol = (rol) => {
  outletContext.me = { username: "u", rol };
};

beforeEach(() => {
  conRol("manager");
  api.getPedidos.mockResolvedValue([PEDIDO_SIMPLE, PEDIDO_MULTI]);
  api.aprobarPedido.mockResolvedValue({});
  api.denegarPedido.mockResolvedValue({});
  api.decidirPedido.mockResolvedValue({});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const pintar = () => render(<Aprobaciones />);
const esperarLista = () => screen.findByText("#1");

const filaDe = async (id) => {
  const celda = await screen.findByText(`#${id}`);
  return celda.closest("tr");
};

describe("Aprobaciones · lista", () => {
  it("muestra los pedidos cargados", async () => {
    pintar();
    await esperarLista();
    expect(screen.getByText("#2")).toBeInTheDocument();
  });

  it("un solo h1", async () => {
    pintar();
    await esperarLista();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("si falla la carga lo dice", async () => {
    api.getPedidos.mockRejectedValue({ response: { data: { detail: "503 no disponible" } } });
    pintar();
    expect(await screen.findByText(/503 no disponible/)).toBeInTheDocument();
  });
});

describe("Aprobaciones · quién ve las acciones", () => {
  it("admin y manager ven el atajo de fila en un pedido de una línea", async () => {
    for (const rol of ["admin", "manager"]) {
      conRol(rol);
      const { unmount } = pintar();
      const fila = await filaDe(1);
      expect(within(fila).queryByRole("button", { name: /^aprobar$/i }), rol).toBeInTheDocument();
      unmount();
    }
  });

  it("el resto de roles NO ve ninguna acción de decisión", async () => {
    for (const rol of ["tecnico", "gestor_vivero", "empresa_externa", "proveedor"]) {
      conRol(rol);
      const { unmount } = pintar();
      const fila = await filaDe(1);
      expect(within(fila).queryByRole("button", { name: /^aprobar$/i }), rol).not.toBeInTheDocument();
      expect(within(fila).queryByRole("button", { name: /^denegar$/i }), rol).not.toBeInTheDocument();
      unmount();
    }
  });

  it("un pedido de VARIAS líneas no ofrece el atajo: obliga a decidir línea a línea", async () => {
    /*
     * Es la salvaguarda de la aprobación parcial. Con el atajo, el responsable
     * solo podría aprobar todo o denegar todo.
     */
    pintar();
    const fila = await filaDe(2);
    expect(within(fila).queryByRole("button", { name: /^aprobar$/i })).not.toBeInTheDocument();
    expect(within(fila).getByRole("button", { name: /detalle/i })).toBeInTheDocument();
  });
});

describe("Aprobaciones · aprobar y denegar exigen confirmación", () => {
  /*
   * DEFECTO PREVIO CORREGIDO: los dos botones disparaban la decisión de
   * inmediato, sin confirmación. Aprobar o denegar es irreversible desde la
   * aplicación.
   */
  it("pulsar «Aprobar» NO llama al backend hasta confirmar", async () => {
    const user = userEvent.setup();
    pintar();
    const fila = await filaDe(1);
    await user.click(within(fila).getByRole("button", { name: /^aprobar$/i }));
    await screen.findByRole("alertdialog");
    expect(api.aprobarPedido).not.toHaveBeenCalled();
  });

  it("pulsar «Denegar» NO llama al backend hasta confirmar", async () => {
    const user = userEvent.setup();
    pintar();
    const fila = await filaDe(1);
    await user.click(within(fila).getByRole("button", { name: /^denegar$/i }));
    await screen.findByRole("alertdialog");
    expect(api.denegarPedido).not.toHaveBeenCalled();
  });

  it("el diálogo identifica QUÉ pedido se decide", async () => {
    const user = userEvent.setup();
    pintar();
    const fila = await filaDe(1);
    await user.click(within(fila).getByRole("button", { name: /^aprobar$/i }));
    const dlg = await screen.findByRole("alertdialog");
    expect(dlg.textContent).toMatch(/#1/);
  });

  it("confirmar SÍ aprueba", async () => {
    const user = userEvent.setup();
    pintar();
    const fila = await filaDe(1);
    await user.click(within(fila).getByRole("button", { name: /^aprobar$/i }));
    const dlg = await screen.findByRole("alertdialog");
    await user.click(within(dlg).getByRole("button", { name: /^aprobar$/i }));
    await waitFor(() => expect(api.aprobarPedido).toHaveBeenCalledWith(1, {}));
  });

  it("Escape NO aprueba", async () => {
    const user = userEvent.setup();
    pintar();
    const fila = await filaDe(1);
    await user.click(within(fila).getByRole("button", { name: /^aprobar$/i }));
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.aprobarPedido).not.toHaveBeenCalled();
  });

  it("cancelar NO deniega", async () => {
    const user = userEvent.setup();
    pintar();
    const fila = await filaDe(1);
    await user.click(within(fila).getByRole("button", { name: /^denegar$/i }));
    const dlg = await screen.findByRole("alertdialog");
    await user.click(within(dlg).getByRole("button", { name: /cancelar/i }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.denegarPedido).not.toHaveBeenCalled();
  });

  it("ya no queda ningún window.confirm", async () => {
    const spy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    pintar();
    const fila = await filaDe(1);
    await user.click(within(fila).getByRole("button", { name: /^aprobar$/i }));
    await screen.findByRole("alertdialog");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("Aprobaciones · decisión línea a línea", () => {
  const abrirDetalle = async (user, id) => {
    const fila = await filaDe(id);
    await user.click(within(fila).getByRole("button", { name: /detalle/i }));
    return screen.findByRole("dialog");
  };

  it("el modal lista las líneas del pedido", async () => {
    const user = userEvent.setup();
    pintar();
    const dlg = await abrirDetalle(user, 2);
    expect(within(dlg).getByText("Producto 11")).toBeInTheDocument();
    expect(within(dlg).getByText("Producto 12")).toBeInTheDocument();
  });

  it("con líneas sin decidir, «Confirmar decisiones» está deshabilitado", async () => {
    const user = userEvent.setup();
    pintar();
    const dlg = await abrirDetalle(user, 2);
    expect(within(dlg).getByRole("button", { name: /confirmar decisiones/i })).toBeDisabled();
  });

  it("decidir SOLO una de las dos líneas no habilita el botón", async () => {
    const user = userEvent.setup();
    pintar();
    const dlg = await abrirDetalle(user, 2);
    const aprobar = within(dlg).getAllByRole("button", { name: /^aprobar$/i });
    await user.click(aprobar[0]);
    expect(within(dlg).getByRole("button", { name: /confirmar decisiones/i })).toBeDisabled();
  });

  it("la decisión marcada se anuncia con aria-pressed, no solo con color", async () => {
    /*
     * DEFECTO PREVIO CORREGIDO: la opción elegida se señalaba únicamente con
     * fondo y sombra. Con un lector de pantalla no había forma de saber qué se
     * había marcado antes de confirmar (SC 1.4.1).
     */
    const user = userEvent.setup();
    pintar();
    const dlg = await abrirDetalle(user, 2);
    const aprobar = within(dlg).getAllByRole("button", { name: /^aprobar$/i })[0];
    expect(aprobar).toHaveAttribute("aria-pressed", "false");
    await user.click(aprobar);
    expect(aprobar).toHaveAttribute("aria-pressed", "true");
  });

  it("decidir TODAS las líneas en reserva habilita el botón y envía el payload correcto", async () => {
    const user = userEvent.setup();
    pintar();
    const dlg = await abrirDetalle(user, 2);

    const aprobar = within(dlg).getAllByRole("button", { name: /^aprobar$/i });
    const denegar = within(dlg).getAllByRole("button", { name: /^denegar$/i });
    // Solo hay dos líneas en RESERVA (la 13 ya está APROBADA).
    expect(aprobar).toHaveLength(2);

    await user.click(aprobar[0]);
    await user.click(denegar[1]);

    const confirmar = within(dlg).getByRole("button", { name: /confirmar decisiones/i });
    expect(confirmar).toBeEnabled();
    await user.click(confirmar);

    await waitFor(() => expect(api.decidirPedido).toHaveBeenCalled());
    expect(api.decidirPedido).toHaveBeenCalledWith(2, {
      approved_item_ids: [11],
      denied_item_ids: [12],
      // Sin motivo escrito viaja null, nunca cadena vacía.
      motivo_denegacion: null,
    });
  });

  it("la línea ya decidida NO se reenvía", async () => {
    const user = userEvent.setup();
    pintar();
    const dlg = await abrirDetalle(user, 2);
    const aprobar = within(dlg).getAllByRole("button", { name: /^aprobar$/i });
    await user.click(aprobar[0]);
    await user.click(aprobar[1]);
    await user.click(within(dlg).getByRole("button", { name: /confirmar decisiones/i }));
    await waitFor(() => expect(api.decidirPedido).toHaveBeenCalled());
    const [, payload] = api.decidirPedido.mock.calls[0];
    expect(payload.approved_item_ids).not.toContain(13);
  });

  it("el campo de motivo solo aparece si hay alguna denegada", async () => {
    const user = userEvent.setup();
    pintar();
    const dlg = await abrirDetalle(user, 2);
    expect(within(dlg).queryByLabelText(/motivo de denegación/i)).not.toBeInTheDocument();
    await user.click(within(dlg).getAllByRole("button", { name: /^denegar$/i })[0]);
    expect(within(dlg).getByLabelText(/motivo de denegación/i)).toBeInTheDocument();
  });

  it("un rol sin permiso no ve la columna de decisión", async () => {
    conRol("tecnico");
    const user = userEvent.setup();
    pintar();
    const dlg = await abrirDetalle(user, 2);
    expect(within(dlg).queryByRole("button", { name: /confirmar decisiones/i })).not.toBeInTheDocument();
    expect(within(dlg).queryByRole("columnheader", { name: /decisión/i })).not.toBeInTheDocument();
  });

  it("cerrar el modal descarta las decisiones sin aplicar", async () => {
    const user = userEvent.setup();
    pintar();
    const dlg = await abrirDetalle(user, 2);
    await user.click(within(dlg).getAllByRole("button", { name: /^aprobar$/i })[0]);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.decidirPedido).not.toHaveBeenCalled();
  });
});

describe("Aprobaciones · agrupación por destino", () => {
  it("la cabecera de grupo es un botón con aria-expanded, no un td pinchable", async () => {
    // Antes era un `td` con `onClick`: inalcanzable con el teclado.
    const user = userEvent.setup();
    pintar();
    const fila = await filaDe(2);
    await user.click(within(fila).getByRole("button", { name: /detalle/i }));
    const dlg = await screen.findByRole("dialog");
    const cabecera = within(dlg).getByRole("button", { name: /Salud-La Salle/i });
    expect(cabecera).toHaveAttribute("aria-expanded", "true");
    await user.click(cabecera);
    expect(cabecera).toHaveAttribute("aria-expanded", "false");
  });
});

describe("Aprobaciones · filtros", () => {
  it("el filtro de estado deja solo lo que coincide", async () => {
    api.getPedidos.mockResolvedValue([
      PEDIDO_SIMPLE,
      { ...PEDIDO_MULTI, id: 3, estado: "DENEGADO" },
    ]);
    const user = userEvent.setup();
    pintar();
    await esperarLista();
    await user.selectOptions(screen.getByLabelText(/tipo de reserva/i), "DENEGADO");
    await waitFor(() => expect(screen.queryByText("#1")).not.toBeInTheDocument());
    expect(screen.getByText("#3")).toBeInTheDocument();
  });

  it("todos los filtros tienen etiqueta asociada", async () => {
    pintar();
    await esperarLista();
    for (const etiqueta of [/^ID$/i, /tipo de reserva/i, /^fecha$/i, /solicitante/i, /^texto$/i]) {
      expect(screen.getByLabelText(etiqueta), String(etiqueta)).toBeInTheDocument();
    }
  });
});
