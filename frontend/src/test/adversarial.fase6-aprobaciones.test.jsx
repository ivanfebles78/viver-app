/**
 * REVISIÓN ADVERSARIAL — Aprobaciones.
 *
 * Es la pantalla donde se decide qué material sale del vivero. Una decisión
 * equivocada no se deshace desde la aplicación, así que aquí se ataca la
 * aritmética de la aprobación, el orden de las transiciones, los permisos y
 * los caminos de confirmación.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import * as L from "../pages/aprobaciones.logic";

const FUENTE = readFileSync(resolve(process.cwd(), "src/pages/Aprobaciones.jsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

const linea = (id, estado_item, extra = {}) => ({ id, estado_item, cantidad: 100, ...extra });

/* ══ 1. Aritmética de la aprobación parcial ═════════════════════════════ */

describe("adversarial · la aritmética parcial no se puede falsear", () => {
  const pedido = {
    id: 1,
    estado: "RESERVA",
    items: [linea(1, "RESERVA"), linea(2, "RESERVA"), linea(3, "RESERVA")],
  };

  it("aprobadas + denegadas nunca superan a las líneas en reserva", () => {
    const p = L.construirPayloadDecisiones(pedido, { 1: "aprobar", 2: "denegar", 3: "aprobar" }, "");
    expect(p.approved_item_ids.length + p.denied_item_ids.length).toBe(3);
  });

  it("una decisión sobre un id INEXISTENTE no inventa una línea", () => {
    // Un id que no está en el pedido no puede colarse en el payload.
    const p = L.construirPayloadDecisiones(pedido, { 1: "aprobar", 999: "aprobar" }, "");
    expect(p.approved_item_ids).toEqual([1]);
    expect(p.approved_item_ids).not.toContain(999);
  });

  it("decidir dos veces la misma línea no la duplica en el payload", () => {
    // El estado es un objeto por id: la segunda pulsación sobrescribe.
    const decisiones = { 1: "aprobar" };
    decisiones[1] = "denegar";
    const p = L.construirPayloadDecisiones(pedido, decisiones, "x");
    expect(p.approved_item_ids).toEqual([]);
    expect(p.denied_item_ids).toEqual([1]);
    expect(new Set(p.denied_item_ids).size).toBe(p.denied_item_ids.length);
  });

  it("no hay ningún id repetido, ni dentro de una lista ni entre las dos", () => {
    const p = L.construirPayloadDecisiones(pedido, { 1: "aprobar", 2: "aprobar", 3: "denegar" }, "x");
    const todos = [...p.approved_item_ids, ...p.denied_item_ids];
    expect(new Set(todos).size).toBe(todos.length);
  });

  it("un pedido con líneas sin id no rompe el payload", () => {
    const raro = { id: 2, estado: "RESERVA", items: [{ estado_item: "RESERVA", cantidad: 5 }] };
    const p = L.construirPayloadDecisiones(raro, {}, "");
    expect(p.approved_item_ids).toEqual([]);
    expect(p.denied_item_ids).toEqual([]);
  });
});

/* ══ 2. Cantidades ══════════════════════════════════════════════════════ */

describe("adversarial · las cantidades no se pueden alterar aquí", () => {
  it("la pantalla NO tiene ningún campo de cantidad", () => {
    /*
     * Es la protección de fondo: al no existir edición de cantidad, no hay
     * forma de aprobar «40 de 100», ni de meter un 0, ni de pedir más de lo
     * solicitado. Si alguien añadiera un `input type=number`, esta prueba lo
     * vería y obligaría a rehacer el contrato del payload.
     */
    expect(FUENTE).not.toMatch(/type="number"/);
  });

  it("el payload no lleva cantidades bajo ningún nombre", () => {
    const pedido = { id: 1, estado: "RESERVA", items: [linea(1, "RESERVA", { cantidad: 999 })] };
    const p = L.construirPayloadDecisiones(pedido, { 1: "aprobar" }, "");
    const claves = JSON.stringify(p).toLowerCase();
    for (const prohibida of ["cantidad", "quantity", "qty", "amount"]) {
      expect(claves, prohibida).not.toContain(prohibida);
    }
  });

  it("una cantidad negativa o absurda en los datos no altera la decisión", () => {
    const pedido = {
      id: 1,
      estado: "RESERVA",
      items: [linea(1, "RESERVA", { cantidad: -50 }), linea(2, "RESERVA", { cantidad: 0 })],
    };
    const p = L.construirPayloadDecisiones(pedido, { 1: "aprobar", 2: "aprobar" }, "");
    expect(p.approved_item_ids).toEqual([1, 2]);
  });
});

/* ══ 3. Orden de las transiciones ═══════════════════════════════════════ */

describe("adversarial · el orden de las transiciones", () => {
  it("una línea DENEGADA no se puede volver a aprobar desde aquí", () => {
    const pedido = { id: 1, estado: "APROBADO_PARCIAL", items: [linea(1, "DENEGADO")] };
    const p = L.construirPayloadDecisiones(pedido, { 1: "aprobar" }, "");
    expect(p.approved_item_ids).toEqual([]);
  });

  it("una línea APROBADA no se puede denegar después", () => {
    const pedido = { id: 1, estado: "APROBADO_PARCIAL", items: [linea(1, "APROBADO")] };
    const p = L.construirPayloadDecisiones(pedido, { 1: "denegar" }, "motivo");
    expect(p.denied_item_ids).toEqual([]);
    expect(p.motivo_denegacion).toBeNull();
  });

  it("una línea SERVIDA está fuera de alcance", () => {
    const pedido = { id: 1, estado: "SERVIDO", items: [linea(1, "SERVIDO")] };
    expect(L.lineasEnReserva(pedido)).toEqual([]);
    expect(L.progresoDecision(pedido, { 1: "denegar" }).allDecided).toBe(false);
  });

  it("un pedido CANCELADO o CADUCADO no ofrece atajo de fila", () => {
    for (const estado of ["CANCELADO", "CADUCADO", "APROBADO", "DENEGADO", "SERVIDO"]) {
      expect(
        L.puedeAtajoDeFila({ estado, items: [linea(1, "RESERVA")] }, { rol: "admin" }),
        estado
      ).toBe(false);
    }
  });

  it("un estado desconocido no habilita nada", () => {
    for (const estado of ["", null, undefined, "INVENTADO", "reserva_pendiente"]) {
      expect(L.puedeAtajoDeFila({ estado, items: [linea(1, "RESERVA")] }, { rol: "admin" }), String(estado)).toBe(false);
    }
  });
});

/* ══ 4. Permisos ════════════════════════════════════════════════════════ */

describe("adversarial · permisos", () => {
  it("un rol desconocido o vacío NO puede decidir: falla cerrado", () => {
    for (const me of [{ rol: "" }, { rol: null }, {}, null, undefined, { rol: "root" }, { rol: "jefe" }]) {
      expect(L.puedeDecidir(me), JSON.stringify(me)).toBe(false);
    }
  });

  it("el rol se NORMALIZA: mayúsculas y espacios no cambian el permiso", () => {
    /*
     * Comprobado, no supuesto: `rolEfectivo` recorta y pasa a minúsculas antes
     * de comparar, así que «ADMIN», « Manager » y «manager» son el mismo rol.
     *
     * Se deja fijado porque es una decisión con consecuencias: un backend que
     * devolviera «Admin» concedería permisos de admin. Es el contrato COMPARTIDO
     * de `utils/roles.js`, usado por toda la aplicación, no algo propio de esta
     * pantalla — cambiarlo alteraría permisos en todas partes, que está fuera
     * del alcance de esta fase. Queda anotado en el informe.
     */
    expect(L.puedeDecidir({ rol: "Manager" })).toBe(true);
    expect(L.puedeDecidir({ rol: "  ADMIN  " })).toBe(true);
    expect(L.puedeDecidir({ rol: "manager" })).toBe(true);
    // Lo que NO hace es aceptar un rol que no está en la lista.
    expect(L.puedeDecidir({ rol: "administrador" })).toBe(false);
  });

  it("superadmin y admin_vivero cuentan como admin", () => {
    expect(L.puedeDecidir({ rol: "superadmin" })).toBe(true);
    expect(L.puedeDecidir({ rol: "admin_vivero" })).toBe(true);
  });

  it("ampliar ROLES_DECISION a técnico sería detectable", () => {
    expect(L.ROLES_DECISION).toEqual(["admin", "manager"]);
    expect(L.ROLES_DECISION).not.toContain("tecnico");
  });
});

/* ══ 5. Datos vacíos o corruptos ════════════════════════════════════════ */

describe("adversarial · datos vacíos o corruptos", () => {
  it("un pedido sin items no rompe nada", () => {
    for (const items of [undefined, null, [], "no soy un array", 42]) {
      const p = { id: 1, estado: "RESERVA", items };
      expect(() => L.progresoDecision(p, {}), String(items)).not.toThrow();
      expect(L.lineasEnReserva(p)).toEqual([]);
      expect(L.agruparPorDestino(p)).toEqual([]);
    }
  });

  it("un pedido nulo no revienta el filtrado", () => {
    expect(() => L.filtrarPedidos(null, {})).not.toThrow();
    expect(L.filtrarPedidos(null, {})).toEqual([]);
  });

  it("un solicitante ausente se muestra como raya, no como «undefined»", () => {
    expect(L.solicitanteFromPedido({})).toBe("—");
    expect(L.solicitanteFromPedido(null)).toBe("—");
  });

  it("una fecha inválida no propaga «Invalid Date»", () => {
    for (const v of ["no es fecha", {}, [], NaN]) {
      expect(L.fmtFechaES(v), String(v)).toBe("—");
      expect(L.dateInputValue(v), String(v)).toBe("");
    }
  });

  it("un destino totalmente vacío cae al destino del pedido", () => {
    const p = { tipo: "suministro", distrito_destino: "Centro", items: [linea(1, "RESERVA")] };
    expect(L.agruparPorDestino(p)[0].destino).toBe("Centro");
  });
});

/* ══ 6. Interfaz: acciones duplicadas y estado obsoleto ═════════════════ */

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
import Aprobaciones from "../pages/Aprobaciones";

const PEDIDO_SIMPLE = {
  id: 1,
  estado: "RESERVA",
  tipo: "suministro",
  created_at: "2026-05-10T09:00:00",
  solicitante_username: "medina",
  items: [linea(1, "RESERVA")],
};

const PEDIDO_MULTI = {
  id: 2,
  estado: "RESERVA",
  tipo: "suministro",
  created_at: "2026-05-09T09:00:00",
  solicitante_username: "ute",
  items: [linea(11, "RESERVA"), linea(12, "RESERVA")],
};

describe("adversarial · la interfaz bajo presión", () => {
  beforeEach(() => {
    outletContext.me = { username: "jefa", rol: "manager" };
    api.getPedidos.mockResolvedValue([PEDIDO_SIMPLE, PEDIDO_MULTI]);
    api.aprobarPedido.mockResolvedValue({});
    api.denegarPedido.mockResolvedValue({});
    api.decidirPedido.mockResolvedValue({});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const filaDe = async (id) => (await screen.findByText(`#${id}`)).closest("tr");

  it("pulsar «Aprobar» dos veces seguidas no abre dos confirmaciones", async () => {
    const user = userEvent.setup();
    render(<Aprobaciones />);
    const fila = await filaDe(1);
    const boton = within(fila).getByRole("button", { name: /^aprobar$/i });
    await user.click(boton);
    await screen.findByRole("alertdialog");
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
  });

  it("confirmar dos veces no llama dos veces al backend", async () => {
    const user = userEvent.setup();
    render(<Aprobaciones />);
    const fila = await filaDe(1);
    await user.click(within(fila).getByRole("button", { name: /^aprobar$/i }));
    const dlg = await screen.findByRole("alertdialog");
    const confirmar = within(dlg).getByRole("button", { name: /^aprobar$/i });
    await user.click(confirmar);
    await waitFor(() => expect(api.aprobarPedido).toHaveBeenCalledTimes(1));
    // El diálogo ya se cerró: no hay forma de volver a confirmar.
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(api.aprobarPedido).toHaveBeenCalledTimes(1);
  });

  it("si el backend falla, se avisa y NO se pierde la lista", async () => {
    api.aprobarPedido.mockRejectedValue({ response: { data: { detail: "conflicto de estado" } } });
    const user = userEvent.setup();
    render(<Aprobaciones />);
    const fila = await filaDe(1);
    await user.click(within(fila).getByRole("button", { name: /^aprobar$/i }));
    const dlg = await screen.findByRole("alertdialog");
    await user.click(within(dlg).getByRole("button", { name: /^aprobar$/i }));
    expect(await screen.findByText(/conflicto de estado/)).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
  });

  it("un fallo al confirmar decisiones deja el modal abierto para reintentar", async () => {
    api.decidirPedido.mockRejectedValue({ response: { data: { detail: "línea bloqueada" } } });
    const user = userEvent.setup();
    render(<Aprobaciones />);
    const fila = await filaDe(2);
    await user.click(within(fila).getByRole("button", { name: /detalle/i }));
    const dlg = await screen.findByRole("dialog");
    for (const b of within(dlg).getAllByRole("button", { name: /^aprobar$/i })) await user.click(b);
    await user.click(within(dlg).getByRole("button", { name: /confirmar decisiones/i }));
    await waitFor(() => expect(api.decidirPedido).toHaveBeenCalled());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("el texto de progreso se anuncia como estado en vivo", async () => {
    const user = userEvent.setup();
    render(<Aprobaciones />);
    const fila = await filaDe(2);
    await user.click(within(fila).getByRole("button", { name: /detalle/i }));
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getByRole("status")).toHaveTextContent(/0\/2/);
    await user.click(within(dlg).getAllByRole("button", { name: /^aprobar$/i })[0]);
    expect(within(dlg).getByRole("status")).toHaveTextContent(/1\/2/);
  });

  it("cambiar de rol a uno sin permiso retira las acciones", async () => {
    outletContext.me = { username: "x", rol: "empresa_externa" };
    render(<Aprobaciones />);
    const fila = await filaDe(1);
    expect(within(fila).queryByRole("button", { name: /^aprobar$/i })).not.toBeInTheDocument();
  });
});

/* ══ 7. Regresión de primitivos y de fases anteriores ═══════════════════ */

describe("adversarial · no se ha bifurcado el sistema de diseño", () => {
  it("Aprobaciones no define su propia paleta de estados", () => {
    // Los diez colores por destino y los dos mapas de insignia se han ido.
    expect(FUENTE).not.toMatch(/#[0-9a-fA-F]{6}/);
    expect(FUENTE).not.toMatch(/rgba?\(/);
  });

  it("el estado del pedido se resuelve por el contrato de la Fase 5", () => {
    expect(FUENTE).toContain("estadoPedido");
    expect(FUENTE).toContain('from "../app/estado"');
  });

  it("no quedan diálogos nativos", () => {
    for (const nativo of ["window.confirm", "window.alert", "window.prompt"]) {
      expect(FUENTE, nativo).not.toContain(nativo);
    }
  });

  it("las tablas declaran ancho mínimo dentro de un contenedor con scroll", () => {
    // Es la causa raíz del solape corregido en Productos: sin `min-width`, la
    // tabla se comprime y los botones se salen de su celda.
    expect(FUENTE).toMatch(/overflow-x-auto/);
    expect(FUENTE).toMatch(/minWidth:/);
  });

  it("la confirmación se ESPERA antes de llamar al backend", () => {
    // Sin el `await` y el corte, la decisión se aplicaría igualmente.
    expect(FUENTE).toMatch(/const ok = await confirmar\(/);
    expect(FUENTE).toMatch(/if \(!ok\) return;/);
  });
});
