/**
 * EQUIVALENCIA DE MOVIMIENTOS CON main.
 *
 * `movimientos.logic.js` es una extracción, no una reescritura. Esta prueba lo
 * demuestra: abajo hay una COPIA LITERAL de las funciones tal y como estaban en
 * `Movimientos.jsx@693d45c`, y se comparan con las extraídas sobre miles de
 * casos generados de forma determinista.
 *
 * REGLA: si esto falla, la que ha cambiado es `movimientos.logic.js`. No se
 * toca el testigo para «arreglarlo».
 */

import { describe, it, expect } from "vitest";
import { getZonaLabel } from "../utils/zonas";

import * as L from "./movimientos.logic";

/* ══════════════════════════════════════════════════════════════════════════
 * COPIA LITERAL DE main — no editar.
 * ══════════════════════════════════════════════════════════════════════════ */

const DESTINOS_EXTERNOS_main = ["Empresa", "Organismo oficial", "Colegio", "Otro", "Otros", "Palmetum", "UTE"];
const SALIDA_DESTINOS_main = ["Baja Vivero", "UTE", "Palmetum", "Organismo oficial", "Colegio", "Otros"];
const safeArray_main = (x) => (Array.isArray(x) ? x : []);

const dateInputValue_main = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

function normalizeTamanoForStock_main(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "semillero") return "Semillero";
  if (raw == "m12") return "M12";
  if (raw == "m20") return "M20";
  if (raw == "m30") return "M35";
  return String(value || "").trim();
}

function buildStockKey_main(productoId, zona, tamano) {
  const normalizedTamano = normalizeTamanoForStock_main(tamano);
  if (!productoId || !zona || !normalizedTamano) return "";
  return `${productoId}__${String(zona).toLowerCase()}__${normalizedTamano}`;
}

function getProductDisplayName_main(p) {
  const cient = (p?.nombre_cientifico || p?.producto_nombre_cientifico || "").trim();
  const natural = (p?.nombre_natural || "").trim();
  if (cient && natural && cient.toLowerCase() !== natural.toLowerCase()) {
    return `${cient} — ${natural}`;
  }
  return cient || natural || `Producto #${p?.id || p?.producto_id || "—"}`;
}

function isExternalDestination_main(value) {
  return DESTINOS_EXTERNOS_main.includes(String(value || "").trim());
}

function isDevolucionOrigen_main(value) {
  return ["Empresa", "Organismo oficial", "Colegio", "Otro", "Otros"].includes(String(value || "").trim());
}

function getMovimientoTipo_main(m) {
  const o = String(m?.origen_tipo || "").trim().toLowerCase();
  const d = String(m?.destino_tipo || "").trim().toLowerCase();
  if (o === "vivero" && d === "vivero") return "traslado_interno";
  if (d === "vivero" && ["empresa", "organismo oficial", "colegio", "otro", "otros"].includes(o)) {
    return "devolucion";
  }
  if (d === "vivero") return "entrada";
  return "salida";
}

function getTipoDisplayLabel_main(tipo) {
  const t = String(tipo || "").toLowerCase();
  if (t === "traslado_interno") return "Traslado";
  if (t === "entrada") return "Entrada";
  if (t === "salida") return "Salida";
  if (t === "devolucion") return "Devolución";
  return tipo || "—";
}

function getDestinoOptions_main(origenTipo) {
  if (!origenTipo) return [];
  if (origenTipo === "Vivero") return SALIDA_DESTINOS_main;
  return ["Vivero"];
}

function buildLabelOrigen_main(m) {
  if (m?.origen_tipo === "Vivero") {
    return `Vivero${m?.zona_origen ? ` · ${getZonaLabel(m.zona_origen)}` : ""}${m?.tamano_origen ? ` · ${m.tamano_origen}` : ""}`;
  }
  return m?.origen_tipo || "—";
}

function buildLabelDestino_main(m) {
  if (m?.destino_tipo === "Vivero") {
    return `Vivero${m?.zona_destino ? ` · ${getZonaLabel(m.zona_destino)}` : ""}${m?.tamano_destino ? ` · ${m.tamano_destino}` : ""}`;
  }
  if (isExternalDestination_main(m?.destino_tipo)) {
    const parts = [m?.distrito_destino, m?.barrio_destino, m?.direccion_destino].filter(Boolean);
    return parts.length ? `${m.destino_tipo} · ${parts.join(" · ")}` : m.destino_tipo;
  }
  return m?.destino_tipo || "—";
}

function buildStockByProductZoneSize_main(movimientos) {
  const map = new Map();
  const add = (productoId, zona, tamano, delta) => {
    if (!productoId || !zona || !tamano) return;
    const key = `${productoId}__${String(zona).toLowerCase()}__${tamano}`;
    map.set(key, (map.get(key) || 0) + delta);
  };
  for (const m of safeArray_main(movimientos)) {
    const productoId = m?.producto_id;
    const cantidad = Number(m?.cantidad || 0);
    const origenTipo = String(m?.origen_tipo || "").trim().toLowerCase();
    const destinoTipo = String(m?.destino_tipo || "").trim().toLowerCase();
    if (!productoId || !cantidad) continue;
    if (destinoTipo === "vivero" && m?.zona_destino && m?.tamano_destino) {
      add(productoId, m.zona_destino, m.tamano_destino, cantidad);
    }
    if (origenTipo === "vivero" && m?.zona_origen && m?.tamano_origen) {
      add(productoId, m.zona_origen, m.tamano_origen, -cantidad);
    }
  }
  return map;
}

function getFormErrors_main(form, formatoConfig = null) {
  const errs = [];
  if (!form.producto_id) errs.push("Debes seleccionar un producto.");
  if (formatoConfig?.showCantidad !== false) {
    if (!form.cantidad || Number(form.cantidad) <= 0) errs.push("La cantidad debe ser mayor que 0.");
  }
  if (!form.origen_tipo) errs.push("Debes seleccionar un origen.");
  if (!form.destino_tipo) errs.push("Debes seleccionar un destino.");
  if (formatoConfig?.observacionesRequired && !(form.observaciones || "").trim()) {
    errs.push("Para fitosanitarios y fertilizantes debes indicar la cantidad y el envase en observaciones.");
  }
  if (form.origen_tipo === form.destino_tipo && form.origen_tipo !== "Vivero") {
    errs.push("No se permite mover entre el mismo origen y destino salvo traslado interno en vivero.");
  }
  if (
    ["Empresa Externa", "Otro", "Palmetum", "Empresa", "Organismo oficial", "Colegio"].includes(form.origen_tipo) &&
    form.destino_tipo !== "Vivero"
  ) {
    errs.push(`${form.origen_tipo} solo puede mover hacia Vivero.`);
  }
  if (form.origen_tipo === "Vivero" && !form.zona_origen) errs.push("Debes seleccionar una zona de origen del vivero.");
  if (form.origen_tipo === "Vivero" && !form.tamano_origen) errs.push("Debes seleccionar un tamaño de origen.");
  if (form.destino_tipo === "Vivero" && !form.zona_destino) errs.push("Debes seleccionar una zona de destino del vivero.");
  if (form.destino_tipo === "Vivero" && !form.tamano_destino) errs.push("Debes seleccionar un tamaño de destino.");
  if (isExternalDestination_main(form.destino_tipo)) {
    if (!form.distrito_destino) errs.push("Debes seleccionar un distrito.");
    if (!form.barrio_destino) errs.push("Debes seleccionar un barrio.");
    if (!form.direccion_destino) errs.push("Debes indicar una dirección.");
  }
  if (
    form.origen_tipo === "Vivero" &&
    form.destino_tipo === "Vivero" &&
    form.zona_origen &&
    form.zona_destino &&
    form.zona_origen === form.zona_destino &&
    form.tamano_origen === form.tamano_destino
  ) {
    errs.push("El traslado interno debe cambiar de zona o de tamaño.");
  }
  if (form.fecha_disponibilidad) {
    if (form.destino_tipo !== "Vivero" || form.tamano_destino !== "M35") {
      errs.push("La fecha de disponibilidad solo aplica a movimientos a Vivero con tamaño M35.");
    } else {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const f = new Date(`${form.fecha_disponibilidad}T00:00:00`);
      if (Number.isNaN(f.getTime()) || f <= hoy) {
        errs.push("La fecha de disponibilidad debe ser futura.");
      }
    }
  }
  return errs;
}

function filtrar_main(movimientos, f) {
  return movimientos.filter((m) => {
    const productoTxt = f.producto.trim().toLowerCase();
    const uuidTxt = f.uuid.trim().toLowerCase();
    const tipoReal = String(m?.tipo_movimiento || getMovimientoTipo_main(m) || "").toLowerCase();
    const origenReal = String(m?.origen_tipo || "").toLowerCase();
    const destinoReal = String(m?.destino_tipo || "").toLowerCase();
    const zonasMovimiento = [m?.zona_origen, m?.zona_destino].filter(Boolean).map((z) => String(z).toLowerCase());
    const productoMatch =
      !productoTxt ||
      `${m?.producto_nombre_cientifico || ""} ${m?.producto_nombre_natural || ""} ${m?.producto_id || ""}`
        .toLowerCase()
        .includes(productoTxt);
    const tipoMatch = !f.tipo || tipoReal === String(f.tipo).toLowerCase();
    const zonaMatch = !f.zona || zonasMovimiento.includes(String(f.zona).toLowerCase());
    const uuidMatch = !uuidTxt || String(m?.uuid_lote || "").toLowerCase().includes(uuidTxt);
    const origenMatch = !f.origen || origenReal === String(f.origen).toLowerCase();
    const destinoMatch = !f.destino || destinoReal === String(f.destino).toLowerCase();
    const fechaMatch = !f.fecha || dateInputValue_main(m?.fecha_movimiento) === f.fecha;
    return productoMatch && tipoMatch && zonaMatch && uuidMatch && origenMatch && destinoMatch && fechaMatch;
  });
}

/* ══════════════════════════════════════════════════════════════════════════ */

/** Generador determinista: mismos datos en cada ejecución y en CI. */
function generador(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const ORIGENES_POSIBLES = [
  "Vivero", "vivero", " Vivero ", "Empresa", "Organismo oficial", "Colegio",
  "Otro", "Otros", "Palmetum", "Empresa Externa", "Proveedores del vivero",
  "", null, undefined, "Inventado",
];
const DESTINOS_POSIBLES = [
  "Vivero", "VIVERO", "Baja Vivero", "UTE", "Palmetum", "Organismo oficial",
  "Colegio", "Otros", "Empresa", "", null, undefined, "Desconocido",
];
const ZONAS = ["3a", "3A", "12", "almacen-fito", "Zona Compostaje", "", null];
const TAMANOS_POSIBLES = ["Semillero", "M12", "M20", "M35", "m30", "M30", "", null, "raro"];

function generarMovimiento(rnd, i) {
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  return {
    id: i + 1,
    producto_id: rnd() > 0.08 ? Math.floor(rnd() * 30) + 1 : null,
    producto_nombre_cientifico: rnd() > 0.2 ? `Especie ${Math.floor(rnd() * 12)}` : "",
    producto_nombre_natural: rnd() > 0.4 ? `Común ${Math.floor(rnd() * 8)}` : "",
    cantidad: rnd() > 0.06 ? Math.floor(rnd() * 400) : 0,
    origen_tipo: pick(ORIGENES_POSIBLES),
    destino_tipo: pick(DESTINOS_POSIBLES),
    zona_origen: pick(ZONAS),
    zona_destino: pick(ZONAS),
    tamano_origen: pick(TAMANOS_POSIBLES),
    tamano_destino: pick(TAMANOS_POSIBLES),
    uuid_lote: rnd() > 0.25 ? `uuid-${Math.floor(rnd() * 50)}` : "",
    es_prestamo: rnd() > 0.85,
    es_devolucion: rnd() > 0.9,
    tipo_movimiento: rnd() > 0.6 ? pick(["entrada", "salida", "traslado_interno", "devolucion", ""]) : undefined,
    fecha_movimiento: rnd() > 0.1 ? new Date(2026, 0, 1 + Math.floor(rnd() * 400)).toISOString() : null,
    distrito_destino: rnd() > 0.6 ? "Anaga" : "",
    barrio_destino: rnd() > 0.6 ? "San Andrés" : "",
    direccion_destino: rnd() > 0.6 ? "Calle Mayor 3" : "",
  };
}

describe("movimientos.logic · equivalencia con main", () => {
  const rnd = generador(20260816);
  const MOVS = Array.from({ length: 400 }, (_, i) => generarMovimiento(rnd, i));

  it("getMovimientoTipo coincide en los 400 casos", () => {
    for (const m of MOVS) {
      expect(L.getMovimientoTipo(m), JSON.stringify(m)).toBe(getMovimientoTipo_main(m));
    }
  });

  it("getTipoDisplayLabel coincide, incluidos valores desconocidos", () => {
    const entradas = [...MOVS.map((m) => m.tipo_movimiento), "TRASLADO_INTERNO", "Entrada", "", null, "raro"];
    for (const t of entradas) {
      expect(L.getTipoDisplayLabel(t)).toBe(getTipoDisplayLabel_main(t));
    }
  });

  it("buildLabelOrigen y buildLabelDestino coinciden", () => {
    for (const m of MOVS) {
      expect(L.buildLabelOrigen(m), JSON.stringify(m)).toBe(buildLabelOrigen_main(m));
      expect(L.buildLabelDestino(m), JSON.stringify(m)).toBe(buildLabelDestino_main(m));
    }
  });

  it("buildStockByProductZoneSize produce el MISMO mapa", () => {
    const a = L.buildStockByProductZoneSize(MOVS);
    const b = buildStockByProductZoneSize_main(MOVS);
    expect(a.size).toBe(b.size);
    for (const [k, v] of b) expect(a.get(k), k).toBe(v);
  });

  it("normalizeTamanoForStock coincide, incluido el mapeo m30 → M35", () => {
    for (const t of [...TAMANOS_POSIBLES, "M30", "m30", " M30 ", "SEMILLERO"]) {
      expect(L.normalizeTamanoForStock(t), String(t)).toBe(normalizeTamanoForStock_main(t));
    }
    // El mapeo heredado, explícito: no es una errata.
    expect(L.normalizeTamanoForStock("m30")).toBe("M35");
  });

  it("buildStockKey coincide", () => {
    for (const m of MOVS.slice(0, 120)) {
      expect(L.buildStockKey(m.producto_id, m.zona_origen, m.tamano_origen)).toBe(
        buildStockKey_main(m.producto_id, m.zona_origen, m.tamano_origen)
      );
    }
  });

  it("getProductDisplayName coincide", () => {
    const productos = [
      { nombre_cientifico: "Dracaena draco", nombre_natural: "Drago" },
      { nombre_cientifico: "Acalypha", nombre_natural: "acalypha" },
      { nombre_cientifico: "", nombre_natural: "Solo común" },
      { nombre_cientifico: "Solo latín", nombre_natural: "" },
      { id: 7 },
      { producto_id: 9 },
      {},
    ];
    for (const p of productos) {
      expect(L.getProductDisplayName(p), JSON.stringify(p)).toBe(getProductDisplayName_main(p));
    }
  });

  it("isExternalDestination e isDevolucionOrigen coinciden", () => {
    for (const v of [...DESTINOS_POSIBLES, ...ORIGENES_POSIBLES, " Empresa ", "empresa"]) {
      expect(L.isExternalDestination(v), String(v)).toBe(isExternalDestination_main(v));
      expect(L.isDevolucionOrigen(v), String(v)).toBe(isDevolucionOrigen_main(v));
    }
  });

  it("getDestinoOptions coincide", () => {
    for (const o of [...ORIGENES_POSIBLES, "Vivero"]) {
      expect(L.getDestinoOptions(o), String(o)).toEqual(getDestinoOptions_main(o));
    }
  });

  it("dateInputValue coincide, incluidas fechas inválidas", () => {
    const fechas = [...MOVS.map((m) => m.fecha_movimiento), "no-es-fecha", "", null, undefined, 0];
    for (const f of fechas) {
      expect(L.dateInputValue(f), String(f)).toBe(dateInputValue_main(f));
    }
  });
});

describe("movimientos.logic · el filtrado coincide con main", () => {
  const rnd = generador(777);
  const MOVS = Array.from({ length: 250 }, (_, i) => generarMovimiento(rnd, i));

  /* 60 combinaciones de filtros, generadas de forma determinista. */
  const COMBOS = [];
  const rndF = generador(31337);
  const valores = {
    producto: ["", "especie", "ESPECIE 3", " común ", "1", "zzz"],
    tipo: ["", "entrada", "salida", "traslado_interno", "devolucion", "ENTRADA"],
    zona: ["", "3a", "3A", "12", "almacen-fito", "Zona Compostaje"],
    uuid: ["", "uuid-1", "UUID-2", "no-existe"],
    origen: ["", "Vivero", "vivero", "Empresa", "Colegio"],
    destino: ["", "Vivero", "Baja Vivero", "UTE"],
    fecha: ["", "2026-01-05", "2026-06-14"],
  };
  for (let i = 0; i < 60; i += 1) {
    const combo = {};
    for (const [k, opts] of Object.entries(valores)) {
      combo[k] = opts[Math.floor(rndF() * opts.length)];
    }
    COMBOS.push(combo);
  }

  it.each(COMBOS.map((c, i) => [i, c]))("combinación %i devuelve el mismo conjunto", (_i, combo) => {
    const mio = L.filtrarMovimientos(MOVS, combo).map((m) => m.id);
    const suyo = filtrar_main(MOVS, combo).map((m) => m.id);
    expect(mio).toEqual(suyo);
  });

  it("un filtro vacío no restringe nada", () => {
    expect(L.filtrarMovimientos(MOVS, {})).toHaveLength(MOVS.length);
  });

  it("tolera una entrada que no es un array", () => {
    expect(L.filtrarMovimientos(null, { tipo: "entrada" })).toEqual([]);
    expect(L.filtrarMovimientos(undefined, {})).toEqual([]);
  });
});

describe("movimientos.logic · la validación coincide con main", () => {
  const manana = () => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  };
  const ayer = () => {
    const d = new Date();
    d.setDate(d.getDate() - 5);
    return d.toISOString().slice(0, 10);
  };

  const FORMULARIOS = [
    {},
    { producto_id: 1, cantidad: 5, origen_tipo: "Vivero", destino_tipo: "Vivero" },
    { producto_id: 1, cantidad: 5, origen_tipo: "Vivero", destino_tipo: "Vivero", zona_origen: "3a", tamano_origen: "M12", zona_destino: "3a", tamano_destino: "M12" },
    { producto_id: 1, cantidad: 5, origen_tipo: "Vivero", destino_tipo: "Vivero", zona_origen: "3a", tamano_origen: "M12", zona_destino: "4", tamano_destino: "M12" },
    { producto_id: 1, cantidad: 0, origen_tipo: "Empresa", destino_tipo: "Empresa" },
    { producto_id: 1, cantidad: 3, origen_tipo: "Colegio", destino_tipo: "UTE" },
    { producto_id: 1, cantidad: 3, origen_tipo: "Vivero", destino_tipo: "UTE", zona_origen: "3a", tamano_origen: "M35" },
    { producto_id: 1, cantidad: 3, origen_tipo: "Vivero", destino_tipo: "UTE", zona_origen: "3a", tamano_origen: "M35", distrito_destino: "Anaga", barrio_destino: "San Andrés", direccion_destino: "Calle 1" },
    { producto_id: 1, cantidad: 3, origen_tipo: "Proveedores del vivero", destino_tipo: "Vivero", zona_destino: "3a", tamano_destino: "M35", fecha_disponibilidad: manana() },
    { producto_id: 1, cantidad: 3, origen_tipo: "Proveedores del vivero", destino_tipo: "Vivero", zona_destino: "3a", tamano_destino: "M35", fecha_disponibilidad: ayer() },
    { producto_id: 1, cantidad: 3, origen_tipo: "Proveedores del vivero", destino_tipo: "Vivero", zona_destino: "3a", tamano_destino: "M20", fecha_disponibilidad: manana() },
    { producto_id: 1, cantidad: 3, origen_tipo: "Proveedores del vivero", destino_tipo: "Vivero", zona_destino: "3a", tamano_destino: "M35", fecha_disponibilidad: "no-es-fecha" },
    { producto_id: 2, origen_tipo: "Vivero", destino_tipo: "Baja Vivero", zona_origen: "3a", tamano_origen: "M12" },
  ];

  const CONFIGS = [
    null,
    { showCantidad: false },
    { observacionesRequired: true },
    { showCantidad: false, observacionesRequired: true },
  ];

  for (let i = 0; i < FORMULARIOS.length; i += 1) {
    for (let j = 0; j < CONFIGS.length; j += 1) {
      it(`formulario ${i} × configuración ${j}: mismos errores y en el mismo orden`, () => {
        // El ORDEN importa: es el primer error que lee el usuario.
        expect(L.getFormErrors(FORMULARIOS[i], CONFIGS[j])).toEqual(
          getFormErrors_main(FORMULARIOS[i], CONFIGS[j])
        );
      });
    }
  }
});

describe("movimientos.logic · pedidos servibles", () => {
  it("los aprobados parcialmente SÍ se pueden servir", () => {
    const pedidos = [
      { id: 1, estado: "APROBADO" },
      { id: 2, estado: "APROBADO_PARCIAL" },
      { id: 3, estado: "aprobado_parcial" },
      { id: 4, estado: "RESERVA" },
      { id: 5, estado: "SERVIDO" },
      { id: 6, estado: null },
    ];
    expect(L.filtrarPedidosAprobados(pedidos).map((p) => p.id)).toEqual([1, 2, 3]);
  });

  it("tolera una entrada que no es un array", () => {
    expect(L.filtrarPedidosAprobados(null)).toEqual([]);
  });
});

describe("movimientos.logic · etiqueta de préstamo", () => {
  it("préstamo gana a devolución", () => {
    expect(L.getPrestamoKind({ es_prestamo: true, es_devolucion: true })).toBe("prestamo");
  });
  it("una devolución derivada del tipo también cuenta", () => {
    expect(L.getPrestamoKind({ origen_tipo: "Colegio", destino_tipo: "Vivero" })).toBe("devolucion");
  });
  it("lo normal es que no sea ninguna de las dos", () => {
    expect(L.getPrestamoKind({ origen_tipo: "Vivero", destino_tipo: "Vivero" })).toBe("none");
  });
});
