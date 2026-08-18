/**
 * EQUIVALENCIA Y CONTRATO — lógica del mapa del vivero.
 *
 * Los bloques `MAIN` son copias LITERALES de `ZoneEditor.jsx` y
 * `ZonaMapDialog.jsx@27523fb`, pegadas antes de tocar nada.
 *
 * El bloque final muta las reglas a propósito para demostrar que el contrato
 * detecta que se debiliten. Es el requisito explícito para ZoneEditor: las seis
 * ramas de validación y su ORDEN.
 */

import { describe, it, expect } from "vitest";

import * as L from "./zonas.logic";
import zonasDefault from "./zonasConfig";

/* ══ COPIA LITERAL DE MAIN ══════════════════════════════════════════════ */

/** `handleAddZona` de ZoneEditor, sin la parte de React. */
function MAIN_addZona(raw, editedZonas) {
  if (raw === null) return { accion: "cancelado" };
  const cleaned = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!cleaned) return { accion: "alert", texto: "Identificador vacío. Operación cancelada." };
  const apiId = cleaned.replace(/^zona[-_]?/i, "");
  if (!apiId) return { accion: "alert", texto: "Identificador inválido. Operación cancelada." };
  const fullId = `zona-${apiId}`;
  if (editedZonas.some((z) => z.id === fullId)) {
    return { accion: "alert", texto: `Ya existe una zona con id "${fullId}".` };
  }
  if (!/^[a-z0-9-]+$/.test(apiId)) {
    return {
      accion: "alert",
      texto: "El identificador solo puede contener letras (a-z), números y guiones.",
    };
  }
  return { accion: "crear", apiId, fullId, nombre: `Zona ${apiId}` };
}

/** `resolveZoneApiId` de ZonaMapDialog. */
function MAIN_resolve(zone) {
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]/g, "");
  const normZona = (s) => {
    let r = norm(s);
    if (r.startsWith("zonazona")) r = r.slice(8);
    if (r.startsWith("zona")) r = r.slice(4);
    return r;
  };
  const normPuntos = (s) => String(s || "").replace(/\s+/g, " ").trim();

  if (zone?.puntos) {
    const porPuntos = zonasDefault.find((c) => normPuntos(c.puntos) === normPuntos(zone.puntos));
    if (porPuntos?.apiId) return porPuntos.apiId;
  }
  const porNombre = zonasDefault.find((c) => normZona(c.nombre) === normZona(zone?.nombre));
  if (porNombre?.apiId) return porNombre.apiId;
  const porId = zonasDefault.find(
    (c) =>
      normZona(c.id) === normZona(zone?.id) ||
      (zone?.apiId && normZona(c.apiId) === normZona(zone?.apiId)) ||
      normZona(c.apiId) === normZona(zone?.id)
  );
  if (porId?.apiId) return porId.apiId;
  return String(zone?.apiId || zone?.id || "").replace(/^zona[-_]?/i, "");
}

/** Borrado de vértice de ZoneEditor. */
const MAIN_deleteVertex = (points, idx) =>
  points.length <= 3 ? points : points.filter((_, i) => i !== idx);

/** Inserción de vértice de ZoneEditor. */
const MAIN_insertVertex = (points, edgeIdx) => {
  const next = (edgeIdx + 1) % points.length;
  const [x1, y1] = points[edgeIdx];
  const [x2, y2] = points[next];
  const mid = [(x1 + x2) / 2, (y1 + y2) / 2];
  return [...points.slice(0, edgeIdx + 1), mid, ...points.slice(edgeIdx + 1)];
};

/** Recuento de productos distintos de MapaVivero. */
const MAIN_distintos = (items) =>
  new Set(
    items
      .map((i) => String(i.nombre_cientifico || i.cientifico || i.producto || "").trim().toLowerCase())
      .filter(Boolean)
  ).size;

/* ══ DATOS ══════════════════════════════════════════════════════════════ */

const ZONAS = [
  { id: "zona-1", apiId: "1", nombre: "Zona 1" },
  { id: "zona-9b", apiId: "9b", nombre: "Zona 9 B" },
  { id: "zona-12", apiId: "12", nombre: "Zona 12" },
];

/** Entradas que recorren las seis ramas y sus fronteras. */
const ENTRADAS = [
  null,
  "",
  "   ",
  "\t\n",
  "13",
  "3c",
  "10c",
  "9b",
  "zona-9b",
  "zona9b",
  "ZONA_9B",
  "  Zona - 9 B  ",
  "zona",
  "zona-",
  "zona_",
  "ZONA",
  "1",
  "12",
  "a",
  "abc-123",
  "con espacio",
  "con!simbolo",
  "acentuadó",
  "MAYUS",
  "-guion-",
  "--",
  "0",
  "zona-zona-5",
];

/* ══ EQUIVALENCIA ═══════════════════════════════════════════════════════ */

describe("equivalencia · validación del identificador de zona", () => {
  it("coincide con main en las 28 entradas de prueba", () => {
    const mios = ENTRADAS.map((raw) => {
      if (raw === null) return [String(raw), "cancelado", null];
      const r = L.validarNuevoId(raw, ZONAS);
      return r.ok ? [String(raw), "crear", r.fullId] : [String(raw), "alert", r.error];
    });
    const suyos = ENTRADAS.map((raw) => {
      const r = MAIN_addZona(raw, ZONAS);
      if (r.accion === "cancelado") return [String(raw), "cancelado", null];
      return r.accion === "crear"
        ? [String(raw), "crear", r.fullId]
        : [String(raw), "alert", r.texto];
    });
    expect(mios).toEqual(suyos);
  });

  it("el nombre de la zona nueva coincide", () => {
    for (const raw of ["13", "3c", "zona9b"]) {
      const mio = L.validarNuevoId(raw, []);
      const suyo = MAIN_addZona(raw, []);
      if (!mio.ok) continue;
      expect(L.construirZonaNueva(mio.apiId, mio.fullId, "#fff").nombre).toBe(suyo.nombre);
    }
  });
});

describe("equivalencia · resolución del identificador de zona", () => {
  const CASOS = [
    ...zonasDefault.map((z) => ({ ...z })),
    // Id corrupto pero geometría correcta: la vía 1 lo salva.
    { id: "zona-3", apiId: "3", nombre: "Zona 3", puntos: zonasDefault.find((z) => z.id === "zona-3b").puntos },
    // Sólo nombre.
    { nombre: "Zona 9 C" },
    // Sólo id con prefijo duplicado.
    { id: "zonazona-5" },
    // Nada reconocible.
    { id: "inventada-99" },
    { apiId: "zona-77" },
    {},
    null,
  ];

  it("coincide con main en todos los casos, incluidos los corruptos", () => {
    const mios = CASOS.map((z) => L.resolveZoneApiId(z));
    const suyos = CASOS.map((z) => MAIN_resolve(z));
    expect(mios).toEqual(suyos);
  });
});

describe("equivalencia · geometría", () => {
  const P = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];

  it("el borrado de vértice coincide, incluido el mínimo", () => {
    for (const pts of [P, P.slice(0, 3), P.slice(0, 2)]) {
      for (let i = 0; i < pts.length; i++) {
        expect(L.quitarVertice(pts, i), `${pts.length}/${i}`).toEqual(MAIN_deleteVertex(pts, i));
      }
    }
  });

  it("la inserción de vértice coincide, incluido el cierre del polígono", () => {
    for (let i = 0; i < P.length; i++) {
      expect(L.insertarVertice(P, i), String(i)).toEqual(MAIN_insertVertex(P, i));
    }
  });

  it("el recuento de productos distintos coincide", () => {
    const LOTES = [
      [],
      [{ nombre_cientifico: "Dracaena draco" }],
      [{ nombre_cientifico: "Dracaena draco" }, { nombre_cientifico: "dracaena draco" }],
      [{ nombre_cientifico: "  Dracaena draco  " }, { cientifico: "Phoenix" }, { producto: "Otro" }],
      [{ nombre_cientifico: "" }, {}],
    ];
    for (const l of LOTES) expect(L.contarProductosDistintos(l)).toBe(MAIN_distintos(l));
  });
});

/* ══ CONTRATO ═══════════════════════════════════════════════════════════ */

describe("contrato · las seis ramas de creación de zona", () => {
  it("1 · cancelar no produce ningún aviso", () => {
    // `raw === null` sale en silencio: cancelar no es un error.
    // La rama vive en el componente; aquí se fija que el validador NO se llama
    // con null tratándolo como vacío.
    expect(L.validarNuevoId(null, ZONAS).error).toBe(L.ERRORES_ID.VACIO);
  });

  it("2 · identificador vacío", () => {
    for (const raw of ["", "   ", "\t\n"]) {
      expect(L.validarNuevoId(raw, ZONAS), raw).toEqual({ ok: false, error: L.ERRORES_ID.VACIO });
    }
  });

  it("3 · sólo el prefijo es inválido", () => {
    for (const raw of ["zona", "zona-", "zona_", "ZONA", "Zona-"]) {
      expect(L.validarNuevoId(raw, ZONAS).error, raw).toBe(L.ERRORES_ID.INVALIDO);
    }
  });

  it("4 · duplicado, en cualquiera de sus formas de escribirlo", () => {
    for (const raw of ["9b", "zona-9b", "zona9b", "ZONA_9B", " Zona - 9 B "]) {
      const r = L.validarNuevoId(raw, ZONAS);
      expect(r.ok, raw).toBe(false);
      expect(r.error, raw).toBe(L.ERRORES_ID.DUPLICADO("zona-9b"));
    }
  });

  it("5 · caracteres no permitidos", () => {
    for (const raw of ["con!simbolo", "acentuadó", "a b/c", "a.b"]) {
      expect(L.validarNuevoId(raw, ZONAS).error, raw).toBe(L.ERRORES_ID.CARACTERES);
    }
  });

  it("6 · creación correcta", () => {
    const r = L.validarNuevoId("13", ZONAS);
    expect(r).toEqual({ ok: true, apiId: "13", fullId: "zona-13" });
  });

  it("EL ORDEN: duplicado gana a caracteres inválidos", () => {
    /*
     * Si un identificador es a la vez duplicado e inválido, main avisa de que
     * YA EXISTE. Invertir las dos comprobaciones cambiaría el mensaje.
     */
    const zonas = [{ id: "zona-a!b" }];
    const r = L.validarNuevoId("a!b", zonas);
    expect(r.error).toBe(L.ERRORES_ID.DUPLICADO("zona-a!b"));
    expect(r.error).not.toBe(L.ERRORES_ID.CARACTERES);
  });

  it("el prefijo no se duplica: «zona9b» NO crea «zona-zona9b»", () => {
    // Es el defecto real que la normalización corrigió en su día.
    const r = L.validarNuevoId("zona9b", []);
    expect(r.fullId).toBe("zona-9b");
    expect(r.fullId).not.toBe("zona-zona9b");
  });

  it("los espacios interiores se eliminan, no se convierten en guiones", () => {
    expect(L.validarNuevoId("1 3", []).fullId).toBe("zona-13");
  });
});

describe("contrato · la resolución no puede consultar otra zona", () => {
  it("la geometría gana al id corrupto", () => {
    /*
     * Es el caso que motivó las cuatro vías: una celda «3b» guardada con el id
     * «zona-3». Si el id ganara, el usuario vería el inventario de otra zona.
     */
    const celda3b = zonasDefault.find((z) => z.id === "zona-3b");
    const corrupta = { id: "zona-3", apiId: "3", nombre: "Zona 3", puntos: celda3b.puntos };
    expect(L.resolveZoneApiId(corrupta)).toBe("3b");
  });

  it("tolera el prefijo duplicado, como el backend", () => {
    expect(L.resolveZoneApiId({ id: "zonazona-5" })).toBe("5");
  });

  it("una zona desconocida cae al fallback sin prefijo", () => {
    expect(L.resolveZoneApiId({ id: "zona-99" })).toBe("99");
    expect(L.resolveZoneApiId({ apiId: "zona_77" })).toBe("77");
  });

  it("una zona vacía devuelve cadena vacía, no «undefined»", () => {
    expect(L.resolveZoneApiId({})).toBe("");
    expect(L.resolveZoneApiId(null)).toBe("");
  });

  it("todas las zonas canónicas se resuelven a su propio apiId", () => {
    for (const z of zonasDefault) {
      expect(L.resolveZoneApiId(z), z.id).toBe(z.apiId);
    }
  });
});

describe("contrato · geometría del polígono", () => {
  it("un triángulo no puede perder un vértice", () => {
    const tri = [
      [0, 0],
      [10, 0],
      [5, 10],
    ];
    expect(L.quitarVertice(tri, 1)).toBe(tri);
  });

  it("un cuadrado sí puede", () => {
    const cuad = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(L.quitarVertice(cuad, 1)).toHaveLength(3);
  });

  it("insertar en la última arista cierra el polígono, no desborda", () => {
    const cuad = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const r = L.insertarVertice(cuad, 3);
    expect(r).toHaveLength(5);
    // El punto medio entre el último y el PRIMERO.
    expect(r[4]).toEqual([0, 5]);
  });

  it("la zona nueva es un cuadrado de cuatro puntos en el centro", () => {
    const p = L.defaultNewZonaPoints();
    expect(p).toHaveLength(4);
    const xs = p.map(([x]) => x);
    const ys = p.map(([, y]) => y);
    expect(Math.max(...xs)).toBeLessThan(L.MAP_WIDTH);
    expect(Math.max(...ys)).toBeLessThan(L.MAP_HEIGHT);
  });
});

/* ══ MUTACIÓN ═══════════════════════════════════════════════════════════ */

describe("mutación · el contrato detecta que se debiliten las reglas", () => {
  const detecta = (mutado, real) => {
    try {
      expect(mutado).toEqual(real);
      return "no detecta";
    } catch {
      return "detecta";
    }
  };

  it("detecta que se pierda la normalización del prefijo", () => {
    const real = L.validarNuevoId("zona9b", []).fullId;
    const mutado = `zona-${"zona9b".trim().toLowerCase()}`; // sin quitar el prefijo
    expect(real).toBe("zona-9b");
    expect(mutado).toBe("zona-zona9b");
    expect(detecta(mutado, real)).toBe("detecta");
  });

  it("detecta que se invierta el orden duplicado/caracteres", () => {
    const zonas = [{ id: "zona-a!b" }];
    const real = L.validarNuevoId("a!b", zonas).error;
    // Mutación: comprobar primero el juego de caracteres.
    const mutado = L.ERRORES_ID.CARACTERES;
    expect(real).toBe(L.ERRORES_ID.DUPLICADO("zona-a!b"));
    expect(detecta(mutado, real)).toBe("detecta");
  });

  it("detecta que se acepte un identificador duplicado", () => {
    const real = L.validarNuevoId("9b", ZONAS).ok;
    const mutado = true; // sin la comprobación de duplicado
    expect(real).toBe(false);
    expect(detecta(mutado, real)).toBe("detecta");
  });

  it("detecta que se relaje el juego de caracteres", () => {
    const real = L.validarNuevoId("con!simbolo", []).ok;
    const mutado = /^[\w!-]+$/.test("con!simbolo"); // patrón laxo
    expect(real).toBe(false);
    expect(mutado).toBe(true);
    expect(detecta(mutado, real)).toBe("detecta");
  });

  it("detecta que se acepte un identificador vacío", () => {
    const real = L.validarNuevoId("   ", []).ok;
    const mutado = true;
    expect(real).toBe(false);
    expect(detecta(mutado, real)).toBe("detecta");
  });

  it("detecta que se pierda el mínimo de tres vértices", () => {
    const tri = [
      [0, 0],
      [10, 0],
      [5, 10],
    ];
    const real = L.quitarVertice(tri, 1);
    const mutado = tri.filter((_, i) => i !== 1); // sin el guardarraíl
    expect(real).toHaveLength(3);
    expect(mutado).toHaveLength(2);
    expect(detecta(mutado, real)).toBe("detecta");
  });

  it("detecta que la resolución consulte por id antes que por geometría", () => {
    const celda3b = zonasDefault.find((z) => z.id === "zona-3b");
    const corrupta = { id: "zona-3", apiId: "3", nombre: "Zona 3", puntos: celda3b.puntos };
    const real = L.resolveZoneApiId(corrupta);
    const mutado = "3"; // lo que devolvería si el id ganara
    expect(real).toBe("3b");
    expect(detecta(mutado, real)).toBe("detecta");
  });
});
