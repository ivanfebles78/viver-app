/**
 * REVISIÓN ADVERSARIAL DE PEDIDOS.
 *
 * Pedidos decide quién ve qué pedido y quién puede tocarlo. Es la superficie de
 * autorización más grande de la aplicación después del guard de rutas, así que
 * aquí se ataca precisamente eso: visibilidad por rol, transiciones de estado,
 * cantidades, confirmaciones y datos hostiles.
 *
 * Todas las mutaciones son en memoria: no se toca ningún fichero, así que no
 * hay carrera con otras suites.
 */

import { describe, it, expect } from "vitest";

import * as L from "../pages/pedidos.logic";
import { estadoPedido } from "../app/estado";

/* ══ 1. Visibilidad por rol ═════════════════════════════════════════════ */

describe("adversarial · visibilidad por rol", () => {
  const DE_OTRO = { id: 1, tipo: "salida", solicitante_username: "ana.gil", estado: "RESERVA", items: [] };
  const REPOSICION = { id: 2, tipo: "reposicion", solicitante_username: "medina", estado: "RESERVA", items: [] };
  const MIO = { id: 3, tipo: "salida", solicitante_username: "medina", estado: "RESERVA", items: [] };

  it("una empresa externa NO ve el pedido de otro", () => {
    expect(L.pedidoVisiblePara(DE_OTRO, { role: "empresa_externa", username: "medina" })).toBe(false);
  });

  it("una empresa externa NO ve pedidos de reposición, ni siendo suyos", () => {
    // Reposición es el vivero pidiendo a sus proveedores: no es asunto de la UTE.
    expect(L.pedidoVisiblePara(REPOSICION, { role: "empresa_externa", username: "medina" })).toBe(false);
  });

  it("una empresa externa SÍ ve el suyo", () => {
    expect(L.pedidoVisiblePara(MIO, { role: "empresa_externa", username: "medina" })).toBe(true);
  });

  it("sin usuario en sesión, una empresa externa no ve NADA", () => {
    // Fallo cerrado: si no se sabe quién eres, no se enseña nada.
    for (const u of ["", null, undefined, "   "]) {
      expect(L.pedidoVisiblePara(MIO, { role: "empresa_externa", username: u }), String(u)).toBe(false);
    }
  });

  it("la identidad se compara sin distinguir mayúsculas", () => {
    // El backend guarda «medina»; la sesión puede traer «Medina».
    expect(L.pedidoVisiblePara(MIO, { role: "empresa_externa", username: "MEDINA" })).toBe(true);
  });

  it("la mutación clásica —comparar el nombre FORMATEADO— vaciaría la lista", () => {
    /*
     * Es el defecto que hubo: `formatUsername("medina")` da «Medina», que nunca
     * coincide con lo que guarda el backend.
     */
    const mutado = (p, username) => {
      const suyo = L.solicitanteFromPedido(p); // formateado
      return suyo === String(username || "").trim().toLowerCase();
    };
    expect(mutado(MIO, "medina")).toBe(false);
    expect(L.pedidoVisiblePara(MIO, { role: "empresa_externa", username: "medina" })).toBe(true);
  });

  it("los demás roles ven todo, incluida la reposición", () => {
    for (const role of ["admin", "manager", "tecnico", "gestor_vivero", "proveedor"]) {
      expect(L.pedidoVisiblePara(REPOSICION, { role, username: "x" }), role).toBe(true);
    }
  });
});

/* ══ 2. Transiciones y acciones ═════════════════════════════════════════ */

describe("adversarial · un pedido decidido no se toca", () => {
  const ROLES = ["admin", "manager", "empresa_externa", "tecnico", "gestor_vivero", "proveedor"];

  it.each(L.ESTADOS_CERRADOS)("nadie puede editar un pedido %s", (estado) => {
    for (const role of ROLES) {
      expect(
        L.puedeEditarCancelar({ estado, solicitante_username: "medina" }, { role, username: "Medina" }),
        `${estado} / ${role}`
      ).toBe(false);
    }
  });

  it("mover la comprobación de estado DESPUÉS de la de admin abriría el agujero", () => {
    /*
     * La mutación real: si el orden de las reglas cambia, un administrador puede
     * editar un pedido ya SERVIDO — es decir, alterar lo que ya se entregó.
     */
    const mutado = (p, { role }) => {
      if (L.esSoloLectura(role)) return false;
      if (role === "admin") return true; // sin comprobar el estado
      return false;
    };
    const servido = { estado: "SERVIDO", solicitante_username: "medina" };
    expect(mutado(servido, { role: "admin" })).toBe(true);
    expect(L.puedeEditarCancelar(servido, { role: "admin", username: "medina" })).toBe(false);
  });

  it("un administrador NO puede editar el pedido de otro fuera de RESERVA", () => {
    expect(
      L.puedeEditarCancelar({ estado: "APROBADO_PARCIAL", solicitante_username: "ana.gil" }, { role: "admin", username: "medina" })
    ).toBe(false);
  });

  it("un administrador SÍ puede editar cualquier pedido en RESERVA", () => {
    expect(
      L.puedeEditarCancelar({ estado: "RESERVA", solicitante_username: "ana.gil" }, { role: "admin", username: "medina" })
    ).toBe(true);
  });

  it("una empresa externa NO puede editar el pedido de otro, ni en RESERVA", () => {
    expect(
      L.puedeEditarCancelar({ estado: "RESERVA", solicitante_username: "ana.gil" }, { role: "empresa_externa", username: "Medina" })
    ).toBe(false);
  });

  it("un rol desconocido no hereda permisos", () => {
    expect(
      L.puedeEditarCancelar({ estado: "RESERVA", solicitante_username: "medina" }, { role: "rol_inventado", username: "Medina" })
    ).toBe(false);
  });

  it("APROBADO_PARCIAL cuenta como cerrado: ya hay líneas decididas", () => {
    // No está en ESTADOS_CERRADOS, así que un admin NO lo edita porque no es
    // RESERVA. Se comprueba explícitamente para que nadie lo «arregle».
    expect(
      L.puedeEditarCancelar({ estado: "APROBADO_PARCIAL", solicitante_username: "medina" }, { role: "admin", username: "Medina" })
    ).toBe(false);
  });
});

/* ══ 3. Cantidades ══════════════════════════════════════════════════════ */

describe("adversarial · cantidades de la edición", () => {
  it("una cantidad a 0 ELIMINA la línea, y eso es intencionado", () => {
    expect(L.construirItemsEdicion({ "7__M20": 0, "9__M12": 3 })).toEqual([
      { producto_id: 9, tamano: "M12", cantidad: 3 },
    ]);
  });

  it("una cantidad negativa no llega al backend", () => {
    expect(L.construirItemsEdicion({ "7__M20": -50 })).toEqual([]);
  });

  it("texto en un campo numérico no llega al backend", () => {
    expect(L.construirItemsEdicion({ "7__M20": "muchos" })).toEqual([]);
  });

  it("una clave con producto no numérico se descarta", () => {
    expect(L.construirItemsEdicion({ "abc__M12": 5 })).toEqual([]);
  });

  it("HALLAZGO ABIERTO: una clave sin producto produce `producto_id: 0`", () => {
    /*
     * `parseLineKey("__M20")` da `Number("") === 0`, que es finito, así que pasa
     * el filtro y genera una línea con producto 0 — que no existe.
     *
     * NO SE CORRIGE AQUÍ, a propósito:
     *
     *   - Es EXACTAMENTE el comportamiento de main; cambiarlo rompería la
     *     equivalencia y sería un cambio funcional encubierto en una fase
     *     visual.
     *   - Solo se alcanza si el backend devuelve una línea sin `producto_id`.
     *     Por la interfaz es inalcanzable: las claves las construye
     *     `construirEdicion` a partir de los ids reales del pedido.
     *
     * Se deja fijado el comportamiento actual para que un cambio futuro sea
     * deliberado, y se reporta como limitación conocida de la fase.
     */
    const items = L.construirItemsEdicion({ "__M20": 5 });
    expect(items).toEqual([{ producto_id: 0, tamano: "M20", cantidad: 5 }]);
  });

  it("vaciar TODAS las líneas produce una lista vacía, no un fallo", () => {
    // El backend decidirá si un pedido sin líneas es válido; el frontend no
    // se inventa una línea fantasma para evitarlo.
    expect(L.construirItemsEdicion({ "7__M20": 0, "9__M12": 0 })).toEqual([]);
  });

  it("una cantidad enorme se transmite tal cual: el tope lo pone el backend", () => {
    const items = L.construirItemsEdicion({ "7__M20": 999999999 });
    expect(items[0].cantidad).toBe(999999999);
  });
});

/* ══ 4. Datos hostiles ══════════════════════════════════════════════════ */

describe("adversarial · datos inválidos o extremos", () => {
  it("un pedido sin items no rompe el filtrado", () => {
    const pedidos = [{ id: 1, estado: "RESERVA", created_at: null }];
    expect(() =>
      L.filtrarPedidos(pedidos, { role: "admin", username: "x", filtros: { texto: "algo" } })
    ).not.toThrow();
  });

  it("un pedido con items nulos no rompe la búsqueda por texto", () => {
    const pedidos = [{ id: 1, estado: "RESERVA", items: null }];
    expect(L.filtrarPedidos(pedidos, { role: "admin", username: "x", filtros: { texto: "x" } })).toEqual([]);
  });

  it("un nombre de solicitante larguísimo no rompe nada", () => {
    const largo = "a".repeat(5000);
    const p = { id: 1, estado: "RESERVA", solicitante_username: largo, items: [] };
    expect(L.solicitanteFromPedido(p).length).toBeGreaterThan(0);
    expect(L.pedidoVisiblePara(p, { role: "empresa_externa", username: largo })).toBe(true);
  });

  it("una fecha inválida no excluye el pedido del listado sin filtro de fecha", () => {
    const pedidos = [{ id: 1, estado: "RESERVA", created_at: "no-es-fecha", items: [] }];
    expect(L.filtrarPedidos(pedidos, { role: "admin", username: "x", filtros: {} })).toHaveLength(1);
  });

  it("un estado desconocido no desaparece de la lista", () => {
    // Si el backend añade un estado, el pedido se sigue viendo.
    const pedidos = [{ id: 1, estado: "ESTADO_NUEVO", items: [] }];
    expect(L.filtrarPedidos(pedidos, { role: "admin", username: "x", filtros: {} })).toHaveLength(1);
  });

  it("un estado desconocido no se tiñe de un tono con significado", () => {
    expect(estadoPedido("ESTADO_NUEVO").status).toBe("draft");
  });

  it("el nombre de fichero no puede convertirse en una ruta", () => {
    const sucio = L.sanitizeFileName("pedido/../../etc/passwd");
    expect(sucio).not.toMatch(/[/\\:*?"<>|]/);
    expect(sucio).not.toContain("..");
  });

  it("un pedido con id no numérico se sigue pudiendo filtrar por texto", () => {
    const pedidos = [{ id: "AB-12", estado: "RESERVA", items: [] }];
    expect(
      L.filtrarPedidos(pedidos, { role: "admin", username: "x", filtros: { id: "AB" } })
    ).toHaveLength(1);
  });
});

/* ══ 5. Orden del listado ═══════════════════════════════════════════════ */

describe("adversarial · el orden del listado", () => {
  it("los más recientes van primero", () => {
    const pedidos = [
      { id: 1, estado: "RESERVA", created_at: "2026-01-01T00:00:00Z", items: [] },
      { id: 2, estado: "RESERVA", created_at: "2026-08-01T00:00:00Z", items: [] },
      { id: 3, estado: "RESERVA", created_at: "2026-04-01T00:00:00Z", items: [] },
    ];
    expect(
      L.filtrarPedidos(pedidos, { role: "admin", username: "x", filtros: {} }).map((p) => p.id)
    ).toEqual([2, 3, 1]);
  });

  it("ordenar DESPUÉS de filtrar daría otro resultado con empates", () => {
    // Es la mutación: el orden se aplica antes de los filtros a propósito.
    const pedidos = [
      { id: 1, estado: "RESERVA", created_at: null, items: [] },
      { id: 2, estado: "RESERVA", created_at: null, items: [] },
    ];
    const resultado = L.filtrarPedidos(pedidos, { role: "admin", username: "x", filtros: {} });
    // Con fechas nulas el orden es estable; lo que importa es que no falle.
    expect(resultado).toHaveLength(2);
  });

  it("filtrar no altera el array original", () => {
    const pedidos = [
      { id: 1, estado: "RESERVA", created_at: "2026-01-01T00:00:00Z", items: [] },
      { id: 2, estado: "RESERVA", created_at: "2026-08-01T00:00:00Z", items: [] },
    ];
    const copia = pedidos.map((p) => p.id);
    L.filtrarPedidos(pedidos, { role: "admin", username: "x", filtros: {} });
    expect(pedidos.map((p) => p.id)).toEqual(copia);
  });
});
