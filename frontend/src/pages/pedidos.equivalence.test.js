/**
 * EQUIVALENCIA DE PEDIDOS CON main.
 *
 * `pedidos.logic.js` es una extracción, no una reescritura. Abajo hay una COPIA
 * LITERAL de las funciones tal y como estaban en `Pedidos.jsx@1767485`, y se
 * comparan con las extraídas sobre datos generados de forma determinista.
 *
 * Lo que más importa aquí no son los filtros sino los PERMISOS: esta pantalla
 * decide qué pedidos ve cada rol y cuáles puede tocar.
 *
 * REGLA: si esto falla, la que ha cambiado es `pedidos.logic.js`.
 */

import { describe, it, expect } from "vitest";
import { formatUsername } from "../utils/format";

import * as L from "./pedidos.logic";

/* ══════════════════════════════════════════════════════════════════════════
 * COPIA LITERAL DE main — no editar para «arreglar» un fallo.
 * ══════════════════════════════════════════════════════════════════════════ */

const safeArray_main = (x) => (Array.isArray(x) ? x : []);
const estadoNormalizado_main = (estado) => String(estado || "").trim().toUpperCase();

const estadoLabel_main = (estado) => {
  const e = String(estado || "").trim().toUpperCase();
  if (e === "APROBADO_PARCIAL") return "APROBADO PARCIAL";
  return e || "—";
};

const dateInputValue_main = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

function lineKey_main(productoId, tamano) {
  return `${productoId}__${tamano}`;
}

function parseLineKey_main(key) {
  const [producto_id, tamano] = String(key).split("__");
  return { producto_id: Number(producto_id), tamano: tamano || "M12" };
}

function clampNumber_main(v, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function sanitizeFileName_main(name) {
  return String(name || "pedido")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

const solicitanteFromPedido_main = (p) =>
  formatUsername(
    p?.solicitante_username || p?.solicitante || p?.created_by || p?.usuario || p?.username || ""
  ) || "—";

function solicitantesDisponibles_main(pedidos) {
  if (!Array.isArray(pedidos)) return [];
  const seen = new Map();
  for (const p of pedidos) {
    const raw = String(
      p?.solicitante_username || p?.solicitante || p?.created_by || p?.usuario || p?.username || ""
    ).trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (!seen.has(key)) seen.set(key, { value: key, label: formatUsername(raw) });
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label, "es"));
}

function puedeEditarCancelar_main(p, { role, username }) {
  const isProveedor = role === "proveedor";
  const isReadOnly = role === "tecnico" || role === "gestor_vivero" || isProveedor;
  const isAdmin = role === "admin";
  const estado = estadoNormalizado_main(p?.estado);

  if (
    estado === "APROBADO" ||
    estado === "DENEGADO" ||
    estado === "SERVIDO" ||
    estado === "CANCELADO" ||
    estado === "CADUCADO"
  ) {
    return false;
  }

  if (isReadOnly) return false;
  if (isAdmin) return estado === "RESERVA";

  const solicitante = solicitanteFromPedido_main(p);
  const soyYo = solicitante && username && solicitante === username;
  return role === "empresa_externa" && estado === "RESERVA" && soyYo;
}

function buildStockByProductSize_main(movimientos) {
  const map = new Map();
  const add = (productoId, tamano, delta) => {
    if (!productoId || !tamano) return;
    const key = lineKey_main(productoId, tamano);
    map.set(key, (map.get(key) || 0) + delta);
  };
  for (const m of safeArray_main(movimientos)) {
    const productoId = m?.producto_id;
    const origenTipo = String(m?.origen_tipo || "").trim().toLowerCase();
    const destinoTipo = String(m?.destino_tipo || "").trim().toLowerCase();
    const cantidad = Number(m?.cantidad || 0);
    if (!productoId || !cantidad) continue;
    if (destinoTipo === "vivero" && m?.tamano_destino) add(productoId, m.tamano_destino, cantidad);
    if (origenTipo === "vivero" && m?.tamano_origen) add(productoId, m.tamano_origen, -cantidad);
  }
  return map;
}

function filtrar_main(pedidos, { role, username, mapProdName, f }) {
  const texto = f.texto.trim().toLowerCase();
  const esEmpresaExterna = role === "empresa_externa";

  return pedidos
    .slice()
    .filter((p) => {
      if (!esEmpresaExterna) return true;
      const tipo = String(p?.tipo || "salida").toLowerCase();
      if (tipo === "reposicion") return false;
      const solicitanteRaw = String(
        p?.solicitante_username || p?.solicitante || p?.created_by || p?.usuario || p?.username || ""
      ).trim().toLowerCase();
      const miUsuario = String(username || "").trim().toLowerCase();
      return !!miUsuario && solicitanteRaw === miUsuario;
    })
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .filter((p) => {
      const idOk = !f.id || String(p.id).includes(String(f.id).trim());
      const estadoOk = f.estado === "TODOS" || estadoNormalizado_main(p?.estado) === f.estado;
      const fechaOk = !f.fecha || dateInputValue_main(p?.created_at) === f.fecha;

      const solicitante = solicitanteFromPedido_main(p).toLowerCase();
      const solicitanteOk = !f.solicitante || solicitante === f.solicitante.trim().toLowerCase();

      const detalle = safeArray_main(p.items)
        .map((it) => {
          const nombre =
            it.producto_nombre_cientifico ||
            it.nombre_cientifico ||
            mapProdName.get(it.producto_id) ||
            it.producto_nombre_natural ||
            it.nombre_natural ||
            it.nombre ||
            `producto ${it.producto_id}`;
          return `${nombre} ${it.tamano || ""} ${it.cantidad || ""}`.toLowerCase();
        })
        .join(" ");

      const destinoTxt =
        `${p?.distrito_destino || ""} ${p?.barrio_destino || ""} ${p?.direccion_destino || ""}`.toLowerCase();

      const textoOk =
        !texto ||
        String(p.id).toLowerCase().includes(texto) ||
        solicitante.includes(texto) ||
        estadoNormalizado_main(p?.estado).toLowerCase().includes(texto) ||
        detalle.includes(texto) ||
        destinoTxt.includes(texto);

      return idOk && estadoOk && fechaOk && solicitanteOk && textoOk;
    });
}

/* ══════════════════════════════════════════════════════════════════════════ */

function generador(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const ESTADOS = [
  "RESERVA", "reserva", " Reserva ", "APROBADO", "APROBADO_PARCIAL",
  "aprobado_parcial", "SERVIDO", "DENEGADO", "CANCELADO", "CADUCADO",
  "", null, undefined, "INVENTADO",
];
const USUARIOS = ["medina", "Medina", "ana.gil", "juan.lopez", "", null, "  perez  "];
const TIPOS = ["salida", "reposicion", "REPOSICION", "", null, undefined];

function generarPedido(rnd, i) {
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const nItems = Math.floor(rnd() * 4);
  return {
    id: i + 1,
    estado: pick(ESTADOS),
    tipo: pick(TIPOS),
    solicitante_username: rnd() > 0.3 ? pick(USUARIOS) : null,
    created_by: rnd() > 0.5 ? pick(USUARIOS) : null,
    created_at: rnd() > 0.1 ? new Date(2026, 0, 1 + Math.floor(rnd() * 400)).toISOString() : null,
    distrito_destino: rnd() > 0.5 ? "Anaga" : "",
    barrio_destino: rnd() > 0.5 ? "San Andrés" : "",
    direccion_destino: rnd() > 0.5 ? "Calle Mayor 3" : "",
    items: Array.from({ length: nItems }, (_, k) => ({
      producto_id: Math.floor(rnd() * 20) + 1,
      tamano: pick(["Semillero", "M12", "M20", "M35", "", null]),
      cantidad: Math.floor(rnd() * 60),
      producto_nombre_cientifico: rnd() > 0.4 ? `Especie ${k}` : "",
      nombre_natural: rnd() > 0.6 ? `Común ${k}` : "",
    })),
  };
}

const ROLES = ["admin", "manager", "empresa_externa", "tecnico", "gestor_vivero", "proveedor", "otro"];

describe("pedidos.logic · equivalencia de utilidades", () => {
  const rnd = generador(20260817);
  const PEDIDOS = Array.from({ length: 300 }, (_, i) => generarPedido(rnd, i));

  it("estadoNormalizado y estadoLabel coinciden", () => {
    for (const e of [...ESTADOS, "  aprobado parcial  ", "Servido"]) {
      expect(L.estadoNormalizado(e)).toBe(estadoNormalizado_main(e));
      expect(L.estadoLabel(e)).toBe(estadoLabel_main(e));
    }
  });

  it("dateInputValue coincide, incluidas fechas inválidas", () => {
    for (const f of [...PEDIDOS.map((p) => p.created_at), "no-es-fecha", "", null, 0]) {
      expect(L.dateInputValue(f), String(f)).toBe(dateInputValue_main(f));
    }
  });

  it("lineKey y parseLineKey son inversas y coinciden con main", () => {
    for (const pid of [1, 42, 999]) {
      for (const tam of ["Semillero", "M12", "M20", "M35"]) {
        const k = L.lineKey(pid, tam);
        expect(k).toBe(lineKey_main(pid, tam));
        expect(L.parseLineKey(k)).toEqual(parseLineKey_main(k));
      }
    }
    // Sin tamaño, el respaldo es M12 en ambos.
    expect(L.parseLineKey("7__")).toEqual(parseLineKey_main("7__"));
  });

  it("clampNumber coincide, incluidos valores no numéricos", () => {
    for (const v of [-5, 0, 3.7, "12", "abc", null, undefined, NaN, Infinity]) {
      expect(L.clampNumber(v), String(v)).toBe(clampNumber_main(v));
    }
  });

  it("sanitizeFileName coincide", () => {
    for (const n of ["Pedido #12 (2026)", "áéíóú ñ", "", null, "x".repeat(200), "a/b\\c:d"]) {
      expect(L.sanitizeFileName(n), String(n)).toBe(sanitizeFileName_main(n));
    }
  });

  it("solicitanteFromPedido coincide", () => {
    for (const p of PEDIDOS) {
      expect(L.solicitanteFromPedido(p), JSON.stringify(p.solicitante_username)).toBe(
        solicitanteFromPedido_main(p)
      );
    }
  });

  it("solicitantesDisponibles coincide", () => {
    expect(L.solicitantesDisponibles(PEDIDOS)).toEqual(solicitantesDisponibles_main(PEDIDOS));
  });

  it("buildStockByProductSize produce el MISMO mapa", () => {
    const movs = Array.from({ length: 200 }, (_, i) => ({
      producto_id: (i % 12) + 1,
      cantidad: (i % 7) * 3,
      origen_tipo: i % 3 === 0 ? "Vivero" : "Proveedor",
      destino_tipo: i % 2 === 0 ? "Vivero" : "UTE",
      tamano_origen: ["M12", "M20", "M35", ""][i % 4],
      tamano_destino: ["Semillero", "M12", "M20", null][i % 4],
    }));
    const a = L.buildStockByProductSize(movs);
    const b = buildStockByProductSize_main(movs);
    expect(a.size).toBe(b.size);
    for (const [k, v] of b) expect(a.get(k), k).toBe(v);
  });
});

describe("pedidos.logic · equivalencia de PERMISOS", () => {
  const rnd = generador(4242);
  const PEDIDOS = Array.from({ length: 300 }, (_, i) => generarPedido(rnd, i));

  /*
   * 300 pedidos × 7 roles × 4 usuarios = 8 400 combinaciones. Es la parte más
   * importante del archivo: un rediseño que altere `puedeEditarCancelar` deja a
   * alguien tocando pedidos que no le corresponden.
   */
  it.each(ROLES)("puedeEditarCancelar coincide para el rol %s", (role) => {
    for (const username of ["medina", "Medina", "ana.gil", ""]) {
      for (const p of PEDIDOS) {
        expect(
          L.puedeEditarCancelar(p, { role, username }),
          `rol=${role} usuario=${username} pedido=${JSON.stringify({ estado: p.estado, sol: p.solicitante_username })}`
        ).toBe(!!puedeEditarCancelar_main(p, { role, username }));
      }
    }
  });

  it("los roles de solo lectura NUNCA pueden editar", () => {
    for (const role of ["tecnico", "gestor_vivero", "proveedor"]) {
      for (const p of PEDIDOS) {
        expect(L.puedeEditarCancelar(p, { role, username: "medina" })).toBe(false);
      }
    }
  });

  it("un pedido cerrado no lo toca NADIE", () => {
    for (const estado of L.ESTADOS_CERRADOS) {
      for (const role of ROLES) {
        expect(
          L.puedeEditarCancelar({ estado, solicitante_username: "medina" }, { role, username: "Medina" }),
          `${estado} / ${role}`
        ).toBe(false);
      }
    }
  });
});

describe("pedidos.logic · equivalencia del FILTRADO", () => {
  const rnd = generador(31337);
  const PEDIDOS = Array.from({ length: 250 }, (_, i) => generarPedido(rnd, i));
  const mapProdName = new Map([[1, "Dracaena draco"], [2, "Phoenix canariensis"]]);

  const COMBOS = [];
  const rndF = generador(555);
  const valores = {
    estado: ["TODOS", "RESERVA", "APROBADO", "APROBADO_PARCIAL", "CANCELADO", "SERVIDO"],
    id: ["", "1", "12", "999"],
    fecha: ["", "2026-01-05", "2026-06-14"],
    solicitante: ["", "medina", "Medina", "ana.gil"],
    texto: ["", "especie", "reserva", "anaga", "dracaena", "zzz"],
  };
  for (let i = 0; i < 50; i += 1) {
    const combo = {};
    for (const [k, opts] of Object.entries(valores)) combo[k] = opts[Math.floor(rndF() * opts.length)];
    COMBOS.push(combo);
  }

  for (const role of ["admin", "empresa_externa", "tecnico"]) {
    it.each(COMBOS.map((c, i) => [i, c]))(
      `rol ${role} · combinación %i devuelve el mismo conjunto`,
      (_i, f) => {
        const username = "medina";
        const mio = L.filtrarPedidos(PEDIDOS, {
          role,
          username,
          mapProdName,
          filtros: f,
        }).map((p) => p.id);
        const suyo = filtrar_main(PEDIDOS, { role, username, mapProdName, f }).map((p) => p.id);
        expect(mio).toEqual(suyo);
      }
    );
  }

  it("una empresa externa NUNCA ve pedidos de reposición", () => {
    const soloRepo = PEDIDOS.map((p) => ({ ...p, tipo: "reposicion", solicitante_username: "medina" }));
    const vistos = L.filtrarPedidos(soloRepo, {
      role: "empresa_externa",
      username: "medina",
      filtros: {},
    });
    expect(vistos).toHaveLength(0);
  });

  it("una empresa externa NUNCA ve pedidos de otros", () => {
    const deOtros = PEDIDOS.map((p) => ({ ...p, tipo: "salida", solicitante_username: "ana.gil" }));
    expect(
      L.filtrarPedidos(deOtros, { role: "empresa_externa", username: "medina", filtros: {} })
    ).toHaveLength(0);
  });

  it("la comparación de identidad usa el username CRUDO, no el formateado", () => {
    /*
     * El defecto que hubo: comparar «Medina» (formateado) con «medina» (lo que
     * guarda el backend) dejaba la lista vacía a la empresa externa.
     */
    const suyos = [{ id: 1, tipo: "salida", solicitante_username: "medina", estado: "RESERVA", items: [] }];
    expect(
      L.filtrarPedidos(suyos, { role: "empresa_externa", username: "medina", filtros: {} })
    ).toHaveLength(1);
  });

  it("tolera entradas que no son arrays", () => {
    expect(L.filtrarPedidos(null, { role: "admin", username: "x", filtros: {} })).toEqual([]);
  });
});

describe("pedidos.logic · edición", () => {
  it("construirEdicion parte de las líneas del pedido", () => {
    const pedido = {
      items: [
        { producto_id: 7, tamano: "M20", cantidad: 12 },
        { producto_id: 9, cantidad: 4 }, // sin tamaño → M12
      ],
    };
    expect(L.construirEdicion(pedido)).toEqual({ "7__M20": 12, "9__M12": 4 });
  });

  it("una cantidad a 0 ELIMINA la línea", () => {
    /*
     * Comportamiento de main y hay que conservarlo: es como se quita un producto
     * de un pedido, porque no hay botón de borrar línea.
     */
    const items = L.construirItemsEdicion({ "7__M20": 0, "9__M12": 5 });
    expect(items).toEqual([{ producto_id: 9, tamano: "M12", cantidad: 5 }]);
  });

  it("descarta claves con producto no numérico", () => {
    expect(L.construirItemsEdicion({ "abc__M12": 5 })).toEqual([]);
  });

  it("recorta las cantidades negativas a 0, y por tanto las descarta", () => {
    expect(L.construirItemsEdicion({ "7__M20": -3 })).toEqual([]);
  });
});
