/**
 * Pruebas del motor de avisos del menú.
 *
 * Los contadores deciden si un pedido aprobado se sirve o se queda olvidado,
 * así que merecen cobertura propia — sobre todo ahora que salen del shell.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  computeBadgeCounts,
  markPedidosSeen,
  loadSeenPedidosFromStorage,
  saveSeenPedidosToStorage,
  getReadNotificationsFromStorage,
  saveReadNotificationsToStorage,
  SEEN_PEDIDOS_STORAGE_KEY,
  DECIDED_STATES,
  SERVICEABLE_STATES,
} from "./badges";

/** Constructor de pedidos con valores por defecto razonables. */
function pedido(overrides = {}) {
  return {
    id: 1,
    estado: "RESERVA",
    tipo: "salida",
    solicitante_username: "ana",
    items: [{ cantidad: 10, cantidad_servida: 0 }],
    ...overrides,
  };
}

describe("computeBadgeCounts — casos vacíos", () => {
  it("devuelve {} sin pedidos", () => {
    expect(computeBadgeCounts("admin", [], {}, "ana")).toEqual({});
    expect(computeBadgeCounts("admin", null, {}, "ana")).toEqual({});
    expect(computeBadgeCounts("admin", undefined, {}, "ana")).toEqual({});
  });

  it("no revienta con seenMap ausente", () => {
    expect(() => computeBadgeCounts("admin", [pedido()], null, "ana")).not.toThrow();
    expect(() => computeBadgeCounts("admin", [pedido()], undefined, "ana")).not.toThrow();
  });

  it("un rol desconocido no recibe ningún contador", () => {
    expect(computeBadgeCounts("rol_inventado", [pedido()], {}, "ana")).toEqual({});
  });
});

describe("computeBadgeCounts — /aprobaciones", () => {
  it("manager cuenta los pedidos en RESERVA no vistos", () => {
    const pedidos = [pedido({ id: 1 }), pedido({ id: 2 }), pedido({ id: 3, estado: "APROBADO" })];
    expect(computeBadgeCounts("manager", pedidos, {}, "ana")["/aprobaciones"]).toBe(2);
  });

  it("admin también decide aprobaciones", () => {
    const pedidos = [pedido({ id: 1 }), pedido({ id: 2 })];
    expect(computeBadgeCounts("admin", pedidos, {}, "ana")["/aprobaciones"]).toBe(2);
  });

  it("los ya vistos en RESERVA dejan de contar", () => {
    const pedidos = [pedido({ id: 1 }), pedido({ id: 2 })];
    const seen = { 1: "RESERVA" };
    expect(computeBadgeCounts("manager", pedidos, seen, "ana")["/aprobaciones"]).toBe(1);
  });

  it("los roles que no aprueban no reciben el contador", () => {
    for (const role of ["tecnico", "gestor_vivero", "empresa_externa", "proveedor"]) {
      expect(computeBadgeCounts(role, [pedido()], {}, "ana")["/aprobaciones"]).toBeUndefined();
    }
  });

  it("normaliza el estado en mayúsculas y con espacios", () => {
    const pedidos = [pedido({ id: 1, estado: " reserva " })];
    expect(computeBadgeCounts("manager", pedidos, {}, "ana")["/aprobaciones"]).toBe(1);
  });
});

describe("computeBadgeCounts — proveedor", () => {
  it("cuenta reposiciones servibles no servidas del todo", () => {
    const pedidos = [
      pedido({ id: 1, tipo: "reposicion", estado: "APROBADO", items: [{ cantidad: 10, cantidad_servida: 3 }] }),
    ];
    expect(computeBadgeCounts("proveedor", pedidos, {}, "prov")["/pedidos"]).toBe(1);
  });

  it("ignora las salidas — el proveedor solo ve reposiciones", () => {
    const pedidos = [pedido({ id: 1, tipo: "salida", estado: "APROBADO" })];
    expect(computeBadgeCounts("proveedor", pedidos, {}, "prov")["/pedidos"]).toBe(0);
  });

  it("ignora las reposiciones ya servidas por completo", () => {
    const pedidos = [
      pedido({ id: 1, tipo: "reposicion", estado: "APROBADO", items: [{ cantidad: 10, cantidad_servida: 10 }] }),
    ];
    expect(computeBadgeCounts("proveedor", pedidos, {}, "prov")["/pedidos"]).toBe(0);
  });

  it("ignora estados no servibles", () => {
    for (const estado of ["RESERVA", "DENEGADO", "CANCELADO", "SERVIDO"]) {
      const pedidos = [pedido({ id: 1, tipo: "reposicion", estado })];
      expect(computeBadgeCounts("proveedor", pedidos, {}, "prov")["/pedidos"]).toBe(0);
    }
  });

  it("APROBADO_PARCIAL cuenta como servible", () => {
    const pedidos = [
      pedido({ id: 1, tipo: "reposicion", estado: "APROBADO_PARCIAL", items: [{ cantidad: 5, cantidad_servida: 0 }] }),
    ];
    expect(computeBadgeCounts("proveedor", pedidos, {}, "prov")["/pedidos"]).toBe(1);
  });

  it("deja de contar al marcarse como visto en ese mismo estado", () => {
    const pedidos = [
      pedido({ id: 7, tipo: "reposicion", estado: "APROBADO", items: [{ cantidad: 5, cantidad_servida: 0 }] }),
    ];
    expect(computeBadgeCounts("proveedor", pedidos, { 7: "APROBADO" }, "prov")["/pedidos"]).toBe(0);
  });

  it("vuelve a contar si el estado avanza tras haberse visto", () => {
    const pedidos = [
      pedido({ id: 7, tipo: "reposicion", estado: "APROBADO_PARCIAL", items: [{ cantidad: 5, cantidad_servida: 0 }] }),
    ];
    expect(computeBadgeCounts("proveedor", pedidos, { 7: "APROBADO" }, "prov")["/pedidos"]).toBe(1);
  });
});

describe("computeBadgeCounts — empresa_externa", () => {
  it("cuenta solo los pedidos propios con decisión nueva", () => {
    const pedidos = [
      pedido({ id: 1, estado: "APROBADO", solicitante_username: "ana" }),
      pedido({ id: 2, estado: "APROBADO", solicitante_username: "otro" }),
    ];
    expect(computeBadgeCounts("empresa_externa", pedidos, {}, "ana")["/pedidos"]).toBe(1);
  });

  it("no cuenta pedidos aún sin decidir", () => {
    const pedidos = [pedido({ id: 1, estado: "RESERVA", solicitante_username: "ana" })];
    expect(computeBadgeCounts("empresa_externa", pedidos, {}, "ana")["/pedidos"]).toBe(0);
  });

  it("cuenta cada estado decidido", () => {
    for (const estado of [...DECIDED_STATES]) {
      const pedidos = [pedido({ id: 1, estado, solicitante_username: "ana" })];
      expect(computeBadgeCounts("empresa_externa", pedidos, {}, "ana")["/pedidos"]).toBe(1);
    }
  });

  it("compara el solicitante sin distinguir mayúsculas ni espacios", () => {
    const pedidos = [pedido({ id: 1, estado: "APROBADO", solicitante_username: "  ANA " })];
    expect(computeBadgeCounts("empresa_externa", pedidos, {}, "ana")["/pedidos"]).toBe(1);
  });

  it("sin username no reclama pedidos ajenos", () => {
    const pedidos = [pedido({ id: 1, estado: "APROBADO", solicitante_username: "ana" })];
    expect(computeBadgeCounts("empresa_externa", pedidos, {}, "")["/pedidos"]).toBe(0);
  });
});

describe("computeBadgeCounts — roles internos", () => {
  it("cuenta salidas servibles pendientes de servir", () => {
    const pedidos = [
      pedido({ id: 1, tipo: "salida", estado: "APROBADO", items: [{ cantidad: 10, cantidad_servida: 2 }] }),
    ];
    for (const role of ["tecnico", "gestor_vivero", "admin"]) {
      expect(computeBadgeCounts(role, pedidos, {}, "ana")["/pedidos"]).toBe(1);
    }
  });

  it("no cuenta salidas ya servidas del todo", () => {
    const pedidos = [
      pedido({
        id: 1,
        tipo: "salida",
        estado: "APROBADO",
        solicitante_username: "otro",
        items: [{ cantidad: 10, cantidad_servida: 10 }],
      }),
    ];
    expect(computeBadgeCounts("tecnico", pedidos, {}, "ana")["/pedidos"]).toBeUndefined();
  });

  it("cuenta también la decisión nueva sobre un pedido propio", () => {
    const pedidos = [
      pedido({ id: 1, tipo: "salida", estado: "DENEGADO", solicitante_username: "ana" }),
    ];
    expect(computeBadgeCounts("tecnico", pedidos, {}, "ana")["/pedidos"]).toBe(1);
  });

  it("omite la clave cuando el total es 0 (no publica un contador vacío)", () => {
    const pedidos = [pedido({ id: 1, estado: "RESERVA", solicitante_username: "otro" })];
    expect(computeBadgeCounts("tecnico", pedidos, {}, "ana")["/pedidos"]).toBeUndefined();
  });

  it("no cuenta dos veces un pedido propio que además hay que servir", () => {
    // La rama (a) hace `continue`, así que un mismo pedido no puede sumar por
    // las dos vías. Es la razón por la que el `continue` existe.
    const pedidos = [
      pedido({
        id: 1,
        tipo: "salida",
        estado: "APROBADO",
        solicitante_username: "ana",
        items: [{ cantidad: 10, cantidad_servida: 0 }],
      }),
    ];
    expect(computeBadgeCounts("tecnico", pedidos, {}, "ana")["/pedidos"]).toBe(1);
  });

  it("admin recibe los dos contadores a la vez", () => {
    const pedidos = [
      pedido({ id: 1, estado: "RESERVA", solicitante_username: "otro" }),
      pedido({
        id: 2,
        tipo: "salida",
        estado: "APROBADO",
        solicitante_username: "otro",
        items: [{ cantidad: 4, cantidad_servida: 1 }],
      }),
    ];
    const counts = computeBadgeCounts("admin", pedidos, {}, "ana");
    expect(counts["/aprobaciones"]).toBe(1);
    expect(counts["/pedidos"]).toBe(1);
  });
});

describe("markPedidosSeen", () => {
  it("marca todos los pedidos en su estado actual", () => {
    const pedidos = [pedido({ id: 1, estado: "APROBADO" }), pedido({ id: 2, estado: "DENEGADO" })];
    expect(markPedidosSeen({}, pedidos)).toEqual({ 1: "APROBADO", 2: "DENEGADO" });
  });

  it("con onlyEstado marca solo ese estado", () => {
    const pedidos = [pedido({ id: 1, estado: "RESERVA" }), pedido({ id: 2, estado: "APROBADO" })];
    expect(markPedidosSeen({}, pedidos, { onlyEstado: "RESERVA" })).toEqual({ 1: "RESERVA" });
  });

  it("devuelve la misma referencia cuando nada cambia", () => {
    const prev = { 1: "APROBADO" };
    const pedidos = [pedido({ id: 1, estado: "APROBADO" })];
    expect(markPedidosSeen(prev, pedidos)).toBe(prev);
  });

  it("no muta el mapa anterior", () => {
    const prev = { 1: "RESERVA" };
    markPedidosSeen(prev, [pedido({ id: 1, estado: "APROBADO" })]);
    expect(prev).toEqual({ 1: "RESERVA" });
  });

  it("ignora pedidos sin id o sin estado", () => {
    const pedidos = [{ estado: "APROBADO" }, { id: 5, estado: "" }, { id: 6 }];
    expect(markPedidosSeen({}, pedidos)).toEqual({});
  });

  it("acepta listas vacías o ausentes", () => {
    const prev = { 1: "APROBADO" };
    expect(markPedidosSeen(prev, [])).toBe(prev);
    expect(markPedidosSeen(prev, null)).toBe(prev);
  });
});

describe("persistencia en localStorage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("guarda y recupera el mapa de vistos", () => {
    saveSeenPedidosToStorage({ 1: "APROBADO" });
    expect(loadSeenPedidosFromStorage()).toEqual({ 1: "APROBADO" });
  });

  it("devuelve {} si no hay nada guardado", () => {
    expect(loadSeenPedidosFromStorage()).toEqual({});
  });

  it("devuelve {} ante JSON corrupto en lugar de romper la aplicación", () => {
    window.localStorage.setItem(SEEN_PEDIDOS_STORAGE_KEY, "{no es json");
    expect(loadSeenPedidosFromStorage()).toEqual({});
  });

  it("devuelve {} si el valor guardado no es un objeto", () => {
    window.localStorage.setItem(SEEN_PEDIDOS_STORAGE_KEY, '"cadena"');
    expect(loadSeenPedidosFromStorage()).toEqual({});
  });

  it("guarda y recupera las notificaciones leídas", () => {
    saveReadNotificationsToStorage(["a", "b"]);
    expect(getReadNotificationsFromStorage()).toEqual(["a", "b"]);
  });

  it("devuelve [] si las notificaciones guardadas no son un array", () => {
    window.localStorage.setItem("vivero_global_notifications_read", '{"a":1}');
    expect(getReadNotificationsFromStorage()).toEqual([]);
  });
});

describe("conjuntos de estados", () => {
  it("SERVICEABLE_STATES es subconjunto de DECIDED_STATES", () => {
    for (const s of SERVICEABLE_STATES) {
      expect(DECIDED_STATES.has(s)).toBe(true);
    }
  });
});
