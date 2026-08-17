/**
 * EQUIVALENCIA DE PRODUCTOS CON main.
 *
 * Copia literal de `Productos.jsx@a4137ad` abajo; comparación sobre datos
 * generados. Lo que más importa: el filtrado del catálogo (que es lo que ve el
 * usuario) y el payload de alta (que es lo que se guarda).
 */

import { describe, it, expect } from "vitest";

import * as L from "./productos.logic";

/* ══════════════════════════════════════════════════════════════════════════
 * COPIA LITERAL DE main — no editar.
 * ══════════════════════════════════════════════════════════════════════════ */

function fmtErr_main(e) {
  const status = e?.response?.status;
  const data = e?.response?.data;
  if (status === 422 && Array.isArray(data?.detail)) {
    return data.detail.map((d) => `${(d.loc || []).join(".")}: ${d.msg}`).join(" | ");
  }
  return data?.detail || e?.message || "Error";
}

function norm_main(s) {
  return String(s ?? "").trim().toLowerCase();
}

function productScientificName_main(producto) {
  return producto?.nombre_cientifico || "-";
}

function productCommonName_main(producto) {
  return producto?.nombre_natural || "-";
}

function categorias_main(productos) {
  const set = new Set();
  for (const p of productos) {
    const c = (p.categoria || "").trim();
    if (c) set.add(c);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "es"));
}

function subcategorias_main(productos, categoriaSel) {
  const set = new Set();
  for (const p of productos) {
    const c = (p.categoria || "").trim();
    const s = (p.subcategoria || "").trim();
    if (!s) continue;
    if (categoriaSel !== "ALL" && c !== categoriaSel) continue;
    set.add(s);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "es"));
}

function filtrar_main(productos, { q, categoriaSel, subcategoriaSel, soloConImagen, idsConImagen }) {
  const qn = norm_main(q);
  return productos.filter((p) => {
    const c = (p.categoria || "").trim();
    const s = (p.subcategoria || "").trim();
    const okCat = categoriaSel === "ALL" || c === categoriaSel;
    const okSub = subcategoriaSel === "ALL" || s === subcategoriaSel;
    const okImg = !soloConImagen || idsConImagen.has(p.id);
    if (!okCat || !okSub || !okImg) return false;
    if (!qn) return true;
    const hay =
      norm_main(p.nombre_cientifico).includes(qn) ||
      norm_main(p.nombre_natural).includes(qn) ||
      norm_main(p.nombre).includes(qn) ||
      norm_main(p.categoria).includes(qn) ||
      norm_main(p.subcategoria).includes(qn);
    return hay;
  });
}

function payloadNuevo_main(nuevo) {
  return {
    nombre_cientifico: nuevo.nombre_cientifico.trim(),
    nombre_natural: nuevo.nombre_natural.trim() || null,
    categoria: nuevo.categoria.trim(),
    subcategoria: nuevo.subcategoria.trim(),
    stock_minimo: Number(nuevo.stock_minimo) || 0,
    es_interno: !!nuevo.es_interno,
    precio: nuevo.precio === "" || nuevo.precio == null ? null : Number(nuevo.precio),
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */

function generador(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const CATEGORIAS = ["Árbol", "Palmera", "Arbusto", "Fitosanitario", "", "  Ferretería  ", null];
const SUBCATEGORIAS = ["Autóctono", "Canaria", "Ornamental", "", null, "  Exótica  "];

function generarProducto(rnd, i) {
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  return {
    id: i + 1,
    nombre_cientifico: rnd() > 0.15 ? `Especie ${i % 30}` : "",
    nombre_natural: rnd() > 0.35 ? `Común ${i % 20}` : "",
    nombre: rnd() > 0.7 ? `Heredado ${i % 10}` : undefined,
    categoria: pick(CATEGORIAS),
    subcategoria: pick(SUBCATEGORIAS),
    stock_minimo: Math.floor(rnd() * 50),
    es_interno: rnd() > 0.8,
    precio: rnd() > 0.5 ? Math.round(rnd() * 5000) / 100 : null,
  };
}

describe("productos.logic · equivalencia de utilidades", () => {
  const rnd = generador(20260817);
  const PRODUCTOS = Array.from({ length: 300 }, (_, i) => generarProducto(rnd, i));

  it("norm coincide", () => {
    for (const v of ["  Árbol ", "PALMERA", "", null, undefined, 42]) {
      expect(L.norm(v), String(v)).toBe(norm_main(v));
    }
  });

  it("productScientificName NO cae en el nombre común", () => {
    // Es estricto a propósito: la columna se llama «Nombre científico».
    for (const p of PRODUCTOS) {
      expect(L.productScientificName(p)).toBe(productScientificName_main(p));
    }
    expect(L.productScientificName({ nombre_natural: "Drago" })).toBe("-");
  });

  it("productCommonName coincide", () => {
    for (const p of PRODUCTOS) {
      expect(L.productCommonName(p)).toBe(productCommonName_main(p));
    }
  });

  it("fmtErr aplana los errores 422 de validación", () => {
    const e422 = {
      response: {
        status: 422,
        data: { detail: [{ loc: ["body", "precio"], msg: "no es un número" }] },
      },
    };
    expect(L.fmtErr(e422)).toBe(fmtErr_main(e422));
    expect(L.fmtErr(e422)).toBe("body.precio: no es un número");
  });

  it("fmtErr cubre el resto de formas de error", () => {
    const casos = [
      { response: { status: 500, data: { detail: "Fallo interno" } } },
      { message: "Sin conexión" },
      {},
      null,
    ];
    for (const e of casos) {
      expect(L.fmtErr(e), JSON.stringify(e)).toBe(fmtErr_main(e));
    }
  });

  it("categorías y subcategorías coinciden", () => {
    expect(L.categoriasDe(PRODUCTOS)).toEqual(categorias_main(PRODUCTOS));
    for (const cat of ["ALL", ...categorias_main(PRODUCTOS)]) {
      expect(L.subcategoriasDe(PRODUCTOS, cat), cat).toEqual(subcategorias_main(PRODUCTOS, cat));
    }
  });
});

describe("productos.logic · equivalencia del FILTRADO", () => {
  const rnd = generador(777);
  const PRODUCTOS = Array.from({ length: 250 }, (_, i) => generarProducto(rnd, i));
  const idsConImagen = new Set(PRODUCTOS.filter((_, i) => i % 3 === 0).map((p) => p.id));

  const COMBOS = [];
  const rndF = generador(99);
  const valores = {
    q: ["", "especie", "COMÚN", " palmera ", "heredado", "zzz", "árbol"],
    categoriaSel: ["ALL", "Árbol", "Palmera", "Fitosanitario"],
    subcategoriaSel: ["ALL", "Autóctono", "Canaria"],
    soloConImagen: [true, false],
  };
  for (let i = 0; i < 60; i += 1) {
    const combo = {};
    for (const [k, opts] of Object.entries(valores)) combo[k] = opts[Math.floor(rndF() * opts.length)];
    COMBOS.push(combo);
  }

  it.each(COMBOS.map((c, i) => [i, c]))("combinación %i devuelve el mismo conjunto", (_i, c) => {
    const mio = L.filtrarProductos(PRODUCTOS, {
      q: c.q,
      categoria: c.categoriaSel,
      subcategoria: c.subcategoriaSel,
      soloConImagen: c.soloConImagen,
      idsConImagen,
    }).map((p) => p.id);
    const suyo = filtrar_main(PRODUCTOS, { ...c, idsConImagen }).map((p) => p.id);
    expect(mio).toEqual(suyo);
  });

  it("sin filtros devuelve el catálogo entero", () => {
    expect(L.filtrarProductos(PRODUCTOS, {})).toHaveLength(PRODUCTOS.length);
  });

  it("tolera una entrada que no es un array", () => {
    expect(L.filtrarProductos(null, { q: "x" })).toEqual([]);
  });

  it("la búsqueda es insensible a mayúsculas y tildes de la entrada", () => {
    const p = [{ id: 1, nombre_cientifico: "Dracaena draco", categoria: "Árbol", subcategoria: "" }];
    expect(L.filtrarProductos(p, { q: "DRACAENA" })).toHaveLength(1);
    expect(L.filtrarProductos(p, { q: "  draco  " })).toHaveLength(1);
  });
});

describe("productos.logic · alta de producto", () => {
  const BASE = {
    nombre_cientifico: "  Dracaena draco  ",
    nombre_natural: "  Drago  ",
    categoria: " Árbol ",
    subcategoria: " Autóctono ",
    stock_minimo: "12",
    es_interno: false,
    precio: "34.5",
  };

  it("el payload coincide con el de main", () => {
    expect(L.construirPayloadNuevo(BASE)).toEqual(payloadNuevo_main(BASE));
  });

  it("recorta los campos de texto", () => {
    const p = L.construirPayloadNuevo(BASE);
    expect(p.nombre_cientifico).toBe("Dracaena draco");
    expect(p.categoria).toBe("Árbol");
  });

  it("un nombre común vacío va como null, no como cadena vacía", () => {
    const p = L.construirPayloadNuevo({ ...BASE, nombre_natural: "   " });
    expect(p.nombre_natural).toBeNull();
  });

  it("un precio vacío va como null, NO como 0", () => {
    /*
     * La distinción importa: 0 significa «gratis» y null «sin precio
     * definido». El informe de estadísticas los trata distinto — los productos
     * sin precio no se contabilizan en el coste.
     */
    for (const vacio of ["", null, undefined]) {
      expect(L.construirPayloadNuevo({ ...BASE, precio: vacio }).precio, String(vacio)).toBeNull();
    }
    expect(L.construirPayloadNuevo({ ...BASE, precio: "0" }).precio).toBe(0);
  });

  it("un stock mínimo no numérico cae a 0", () => {
    expect(L.construirPayloadNuevo({ ...BASE, stock_minimo: "abc" }).stock_minimo).toBe(0);
    expect(L.construirPayloadNuevo({ ...BASE, stock_minimo: "" }).stock_minimo).toBe(0);
  });

  it("es_interno se normaliza a booleano", () => {
    expect(L.construirPayloadNuevo({ ...BASE, es_interno: "sí" }).es_interno).toBe(true);
    expect(L.construirPayloadNuevo({ ...BASE, es_interno: undefined }).es_interno).toBe(false);
  });

  it("los tres campos obligatorios se validan antes de enviar", () => {
    expect(L.validarNuevoProducto(BASE)).toBeNull();
    for (const campo of ["nombre_cientifico", "categoria", "subcategoria"]) {
      expect(L.validarNuevoProducto({ ...BASE, [campo]: "   " }), campo).toMatch(/obligatorios/);
    }
  });

  it("el nombre común NO es obligatorio", () => {
    expect(L.validarNuevoProducto({ ...BASE, nombre_natural: "" })).toBeNull();
  });
});

describe("productos.logic · permisos", () => {
  it("solo admin, manager y técnico gestionan el catálogo", () => {
    for (const rol of ["admin", "manager", "tecnico"]) {
      expect(L.puedeGestionar(rol), rol).toBe(true);
    }
    for (const rol of ["gestor_vivero", "empresa_externa", "proveedor", "", null, "inventado"]) {
      expect(L.puedeGestionar(rol), String(rol)).toBe(false);
    }
  });

  it("solo admin y manager marcan un producto como interno", () => {
    expect(L.puedeMarcarInterno("admin")).toBe(true);
    expect(L.puedeMarcarInterno("manager")).toBe(true);
    // El técnico gestiona el catálogo pero NO decide qué es interno.
    expect(L.puedeMarcarInterno("tecnico")).toBe(false);
  });

  it("una empresa externa no puede pedir más desde aquí", () => {
    expect(L.puedePedirMas("empresa_externa")).toBe(false);
  });

  it("sin rol resuelto no se puede pedir: falla cerrado", () => {
    for (const rol of ["", null, undefined]) {
      expect(L.puedePedirMas(rol), String(rol)).toBe(false);
    }
  });

  it("el resto de roles sí puede pedir", () => {
    for (const rol of ["admin", "manager", "tecnico", "gestor_vivero", "proveedor"]) {
      expect(L.puedePedirMas(rol), rol).toBe(true);
    }
  });
});
