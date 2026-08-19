/**
 * CONTRATO DEL PANEL DE INVENTARIO — ZonaMapDialog.
 *
 * La Fase 7 migró la superficie del plano y dejó a propósito este panel sin
 * tocar. Se escribe el contrato ANTES de migrarlo.
 *
 * La pieza delicada es «Marcar zona como interna»: cambia la VISIBILIDAD de
 * todos los productos de una zona para la empresa externa. Es una acción de
 * permisos y hoy se dispara con un simple clic en una casilla, sin
 * confirmación de ningún tipo.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../api/api", () => ({
  getZonaItems: vi.fn(),
  marcarZonaInterna: vi.fn(),
  getZonasConfig: vi.fn(),
  updateZonasConfig: vi.fn(),
}));

import * as api from "../../api/api";
import ZonaMapDialog from "./ZonaMapDialog";

const ITEMS = [
  {
    producto_id: 1,
    nombre_cientifico: "Dracaena draco",
    nombre_natural: "Drago",
    categoria: "Árbol",
    subcategoria: "Autóctono",
    cantidad: 120,
    tamanos: [
      { tamano: "M20", cantidad: 100 },
      { tamano: "M35", cantidad: 20 },
    ],
  },
  {
    producto_id: 2,
    nombre_cientifico: "Phoenix canariensis",
    nombre_natural: "Palmera canaria",
    cantidad: 40,
    tamanos: [],
  },
];

/** Doce productos, para poder ejercitar la paginación de ocho en ocho. */
const MUCHOS = Array.from({ length: 12 }, (_, i) => ({
  producto_id: 100 + i,
  nombre_cientifico: `Especie ${i + 1}`,
  cantidad: (i + 1) * 5,
  tamanos: [],
}));

beforeEach(() => {
  api.getZonaItems.mockResolvedValue({ items: ITEMS, todos_internos: false });
  api.marcarZonaInterna.mockResolvedValue({});
  api.getZonasConfig.mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const pintar = (props = {}) =>
  render(<ZonaMapDialog open onClose={vi.fn()} isAdmin {...props} />);

/** Pulsa la primera zona del plano. */
const elegirZona = async (user) => {
  const zonas = await screen.findAllByRole("button", { name: /consultar inventario/i });
  await user.click(zonas[0]);
  return zonas[0];
};

/* ══ 1. Datos del inventario ════════════════════════════════════════════ */

describe("contrato · datos que muestra el panel", () => {
  it("sin zona elegida, invita a elegir una", async () => {
    pintar();
    // El texto aparece como encabezado del panel y como invitación; se busca
    // el encabezado, que es el que da estado al panel.
    expect(await screen.findByRole("heading", { name: /selecciona una zona/i })).toBeInTheDocument();
    expect(api.getZonaItems).not.toHaveBeenCalled();
  });

  it("al elegir zona, consulta el inventario y lo lista", async () => {
    const user = userEvent.setup();
    pintar();
    await elegirZona(user);
    expect(await screen.findByText("Dracaena draco")).toBeInTheDocument();
    expect(screen.getByText("Phoenix canariensis")).toBeInTheDocument();
  });

  it("muestra nombre común, clasificación y cantidad total", async () => {
    const user = userEvent.setup();
    pintar();
    await elegirZona(user);
    await screen.findByText("Dracaena draco");
    expect(screen.getByText(/Drago · Árbol · Autóctono/)).toBeInTheDocument();
    expect(screen.getByText(/Cantidad total: 120/)).toBeInTheDocument();
  });

  it("desglosa por tamaño, y lo dice cuando no hay desglose", async () => {
    const user = userEvent.setup();
    pintar();
    await elegirZona(user);
    await screen.findByText("Dracaena draco");
    expect(screen.getByText(/M20: 100/)).toBeInTheDocument();
    expect(screen.getByText(/M35: 20/)).toBeInTheDocument();
    expect(screen.getByText(/sin detalle por tamaño/i)).toBeInTheDocument();
  });

  it("cuenta cuántos productos hay en la zona", async () => {
    const user = userEvent.setup();
    pintar();
    await elegirZona(user);
    expect(await screen.findByText(/2 productos en esta zona/i)).toBeInTheDocument();
  });
});

/* ══ 2. Estados de carga, error y vacío ═════════════════════════════════ */

describe("contrato · estados del panel", () => {
  it("mientras carga, no muestra el listado", async () => {
    api.getZonaItems.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    pintar();
    await elegirZona(user);
    await waitFor(() => expect(screen.queryByText("Dracaena draco")).not.toBeInTheDocument());
  });

  it("un error del backend se muestra con su mensaje", async () => {
    api.getZonaItems.mockRejectedValue({ response: { data: { detail: "zona bloqueada" } } });
    const user = userEvent.setup();
    pintar();
    await elegirZona(user);
    expect(await screen.findByText(/zona bloqueada/)).toBeInTheDocument();
  });

  it("una zona sin productos dice con qué identificador se consultó", async () => {
    /*
     * Es diagnóstico deliberado: la config del servidor puede traer ids
     * corruptos, y saber qué se consultó es lo que permite darse cuenta.
     */
    api.getZonaItems.mockResolvedValue({ items: [] });
    const user = userEvent.setup();
    pintar();
    await elegirZona(user);
    const vacio = await screen.findByText(/no se encontraron productos/i);
    expect(vacio.textContent).toMatch(/Consulta usada:/);
  });
});

/* ══ 3. Paginación ══════════════════════════════════════════════════════ */

describe("contrato · paginación de productos", () => {
  it("muestra ocho de doce y ofrece ver más", async () => {
    api.getZonaItems.mockResolvedValue({ items: MUCHOS, todos_internos: false });
    const user = userEvent.setup();
    pintar();
    await elegirZona(user);
    await screen.findByText("Especie 1");
    expect(screen.getByText("Especie 8")).toBeInTheDocument();
    expect(screen.queryByText("Especie 9")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mostrar más \(4 restantes\)/i })).toBeInTheDocument();
  });

  it("«Mostrar más» amplía de ocho en ocho", async () => {
    api.getZonaItems.mockResolvedValue({ items: MUCHOS, todos_internos: false });
    const user = userEvent.setup();
    pintar();
    await elegirZona(user);
    await screen.findByText("Especie 1");
    await user.click(screen.getByRole("button", { name: /mostrar más/i }));
    expect(await screen.findByText("Especie 12")).toBeInTheDocument();
  });

  it("«Mostrar menos» vuelve a ocho", async () => {
    api.getZonaItems.mockResolvedValue({ items: MUCHOS, todos_internos: false });
    const user = userEvent.setup();
    pintar();
    await elegirZona(user);
    await screen.findByText("Especie 1");
    await user.click(screen.getByRole("button", { name: /mostrar más/i }));
    await screen.findByText("Especie 12");
    await user.click(screen.getByRole("button", { name: /mostrar menos/i }));
    await waitFor(() => expect(screen.queryByText("Especie 9")).not.toBeInTheDocument());
  });

  it("con ocho o menos, no ofrece paginar", async () => {
    const user = userEvent.setup();
    pintar();
    await elegirZona(user);
    await screen.findByText("Dracaena draco");
    expect(screen.queryByRole("button", { name: /mostrar más/i })).not.toBeInTheDocument();
  });
});

/* ══ 4. Marcar zona como interna — acción de permisos ══════════════════ */

describe("contrato · marcar zona como interna", () => {
  const casilla = () => screen.getByRole("checkbox", { name: /interna/i });

  it("sólo el administrador ve el control", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ZonaMapDialog open onClose={vi.fn()} isAdmin={false} />);
    await elegirZona(user);
    await screen.findByText("Dracaena draco");
    expect(screen.queryByRole("checkbox", { name: /interna/i })).not.toBeInTheDocument();
    unmount();
  });

  it("el administrador sí lo ve", async () => {
    const user = userEvent.setup();
    pintar();
    await elegirZona(user);
    await screen.findByText("Dracaena draco");
    expect(casilla()).toBeInTheDocument();
  });

  it("refleja el estado que devuelve el servidor", async () => {
    api.getZonaItems.mockResolvedValue({ items: ITEMS, todos_internos: true });
    const user = userEvent.setup();
    pintar();
    await elegirZona(user);
    await screen.findByText("Dracaena draco");
    expect(casilla()).toBeChecked();
  });

  it("NO llama al backend hasta confirmar", async () => {
    /*
     * Marcar una zona como interna esconde TODOS sus productos a la empresa
     * externa: es una acción de permisos y no puede dispararse con un clic.
     */
    const user = userEvent.setup();
    pintar();
    await elegirZona(user);
    await screen.findByText("Dracaena draco");
    await user.click(casilla());
    await screen.findByRole("alertdialog");
    expect(api.marcarZonaInterna).not.toHaveBeenCalled();
  });

  it("al cancelar, no cambia nada", async () => {
    const user = userEvent.setup();
    pintar();
    await elegirZona(user);
    await screen.findByText("Dracaena draco");
    await user.click(casilla());
    const dlg = await screen.findByRole("alertdialog");
    await user.click(within(dlg).getByRole("button", { name: /cancelar/i }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.marcarZonaInterna).not.toHaveBeenCalled();
    // La casilla vuelve a reflejar el estado del servidor, no el clic.
    expect(casilla()).not.toBeChecked();
  });

  it("al confirmar, envía el identificador RESUELTO y el nuevo valor", async () => {
    const user = userEvent.setup();
    pintar();
    await elegirZona(user);
    await screen.findByText("Dracaena draco");
    await user.click(casilla());
    const dlg = await screen.findByRole("alertdialog");
    await user.click(within(dlg).getByRole("button", { name: /marcar|confirmar/i }));
    await waitFor(() => expect(api.marcarZonaInterna).toHaveBeenCalledTimes(1));
    const [zid, valor] = api.marcarZonaInterna.mock.calls[0];
    expect(typeof zid).toBe("string");
    expect(zid.length).toBeGreaterThan(0);
    expect(valor).toBe(true);
  });

  it("tras confirmar, recarga el inventario de la MISMA zona", async () => {
    const user = userEvent.setup();
    pintar();
    await elegirZona(user);
    await screen.findByText("Dracaena draco");
    const zidConsultado = api.getZonaItems.mock.calls[0][0];
    await user.click(casilla());
    const dlg = await screen.findByRole("alertdialog");
    await user.click(within(dlg).getByRole("button", { name: /marcar|confirmar/i }));
    await waitFor(() => expect(api.getZonaItems).toHaveBeenCalledTimes(2));
    expect(api.getZonaItems.mock.calls[1][0]).toBe(zidConsultado);
  });

  it("avisa al resto de la aplicación de que los datos cambiaron", async () => {
    // Otras pantallas escuchan `vivero:data-changed` para refrescarse.
    const escucha = vi.fn();
    window.addEventListener("vivero:data-changed", escucha);
    const user = userEvent.setup();
    pintar();
    await elegirZona(user);
    await screen.findByText("Dracaena draco");
    await user.click(casilla());
    const dlg = await screen.findByRole("alertdialog");
    await user.click(within(dlg).getByRole("button", { name: /marcar|confirmar/i }));
    await waitFor(() => expect(escucha).toHaveBeenCalled());
    window.removeEventListener("vivero:data-changed", escucha);
  });

  it("un fallo del backend se comunica y no deja la casilla mintiendo", async () => {
    api.marcarZonaInterna.mockRejectedValue({ response: { data: { detail: "sin permiso" } } });
    const user = userEvent.setup();
    pintar();
    await elegirZona(user);
    await screen.findByText("Dracaena draco");
    await user.click(casilla());
    const dlg = await screen.findByRole("alertdialog");
    await user.click(within(dlg).getByRole("button", { name: /marcar|confirmar/i }));
    expect(await screen.findByText(/sin permiso/)).toBeInTheDocument();
  });

  it("el aviso explica la consecuencia real", async () => {
    const user = userEvent.setup();
    pintar();
    await elegirZona(user);
    await screen.findByText("Dracaena draco");
    await user.click(casilla());
    const dlg = await screen.findByRole("alertdialog");
    expect(dlg.textContent).toMatch(/empresa externa/i);
  });

  it("desmarcar también pide confirmación, y envía false", async () => {
    api.getZonaItems.mockResolvedValue({ items: ITEMS, todos_internos: true });
    const user = userEvent.setup();
    pintar();
    await elegirZona(user);
    await screen.findByText("Dracaena draco");
    await user.click(casilla());
    const dlg = await screen.findByRole("alertdialog");
    await user.click(within(dlg).getByRole("button", { name: /marcar|confirmar|quitar/i }));
    await waitFor(() => expect(api.marcarZonaInterna).toHaveBeenCalled());
    expect(api.marcarZonaInterna.mock.calls[0][1]).toBe(false);
  });
});

/* ══ 5. Cambio de zona ══════════════════════════════════════════════════ */

describe("contrato · cambiar de zona", () => {
  it("al cambiar de zona, la paginación se reinicia", async () => {
    api.getZonaItems.mockResolvedValue({ items: MUCHOS, todos_internos: false });
    const user = userEvent.setup();
    pintar();
    const zonas = await screen.findAllByRole("button", { name: /consultar inventario/i });
    await user.click(zonas[0]);
    await screen.findByText("Especie 1");
    await user.click(screen.getByRole("button", { name: /mostrar más/i }));
    await screen.findByText("Especie 12");

    await user.click(zonas[1]);
    await waitFor(() => expect(screen.queryByText("Especie 9")).not.toBeInTheDocument());
  });
});
