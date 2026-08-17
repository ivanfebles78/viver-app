/**
 * CONTRATO DEL CSV DE PRODUCTOS.
 *
 * El catálogo se exporta a un CSV que se abre en Excel, y hay hojas de cálculo
 * enlazadas a él. Reordenar o renombrar una columna las rompe en silencio —
 * exactamente el mismo riesgo que los PDF de la Fase 4B, con otro formato.
 *
 * Se fija ANTES de tocar la interfaz, y las mutaciones del final demuestran
 * que el contrato lo detecta.
 */

import { describe, it, expect } from "vitest";

import {
  CSV_FILENAME,
  CSV_HEADERS,
  construirCsvProductos,
  escaparCsv,
  filaCsv,
} from "./productos.logic";

const PRODUCTOS = [
  {
    id: 1,
    nombre_cientifico: "Dracaena draco",
    nombre_natural: "Drago",
    categoria: "Árbol",
    subcategoria: "Autóctono",
    stock: 120,
    stock_minimo: 20,
    precio: 34.5,
    es_interno: false,
  },
  {
    id: 2,
    nombre_cientifico: "Phoenix canariensis",
    nombre_natural: null,
    categoria: "Palmera",
    subcategoria: "Canaria",
    stock: 0,
    stock_minimo: null,
    precio: null,
    es_interno: true,
  },
];

describe("CSV de productos · contrato de columnas", () => {
  it("son ocho columnas, en este orden exacto", () => {
    expect(CSV_HEADERS).toEqual([
      "Nombre científico",
      "Nombre común",
      "Categoría",
      "Subcategoría",
      "Stock",
      "Stock mínimo",
      "Precio (€)",
      "Interno",
    ]);
  });

  it("cada fila tiene tantas celdas como cabeceras", () => {
    for (const p of PRODUCTOS) {
      expect(filaCsv(p)).toHaveLength(CSV_HEADERS.length);
    }
  });

  it("la primera línea del fichero es la cabecera", () => {
    const csv = construirCsvProductos(PRODUCTOS);
    expect(csv.split("\r\n")[0]).toBe(CSV_HEADERS.join(";"));
  });

  it("el separador es punto y coma, no coma", () => {
    // Coma decimal española: si el separador de campos fuera la coma, Excel
    // partiría los precios por la mitad.
    const csv = construirCsvProductos(PRODUCTOS);
    expect(csv.split("\r\n")[0].split(";")).toHaveLength(8);
  });

  it("las líneas se separan con CRLF", () => {
    expect(construirCsvProductos(PRODUCTOS)).toContain("\r\n");
  });
});

describe("CSV de productos · contenido de las celdas", () => {
  it("el precio usa coma decimal y dos decimales", () => {
    expect(filaCsv(PRODUCTOS[0])[6]).toBe("34,50");
  });

  it("un precio nulo deja la celda VACÍA, no un 0", () => {
    // 0 significaría «gratis»; vacío significa «sin precio definido».
    expect(filaCsv(PRODUCTOS[1])[6]).toBe("");
  });

  it("un precio 0 sí se escribe como 0,00", () => {
    expect(filaCsv({ ...PRODUCTOS[0], precio: 0 })[6]).toBe("0,00");
  });

  it("un stock mínimo nulo deja la celda vacía", () => {
    expect(filaCsv(PRODUCTOS[1])[5]).toBe("");
  });

  it("un stock 0 SÍ se escribe", () => {
    // Vaciarlo perdería la diferencia entre «agotado» y «sin dato».
    expect(filaCsv(PRODUCTOS[1])[4]).toBe("0");
  });

  it("«Interno» se escribe en español", () => {
    expect(filaCsv(PRODUCTOS[1])[7]).toBe("Sí");
    expect(filaCsv(PRODUCTOS[0])[7]).toBe("No");
  });

  it("un nombre común ausente deja la celda vacía", () => {
    expect(filaCsv(PRODUCTOS[1])[1]).toBe("");
  });
});

describe("CSV de productos · escapado", () => {
  it("entrecomilla los valores con punto y coma", () => {
    expect(escaparCsv("Drago; grande")).toBe('"Drago; grande"');
  });

  it("duplica las comillas internas", () => {
    expect(escaparCsv('El "drago"')).toBe('"El ""drago"""');
  });

  it("entrecomilla los valores con salto de línea", () => {
    expect(escaparCsv("linea1\nlinea2")).toBe('"linea1\nlinea2"');
  });

  it("deja intacto un valor simple", () => {
    expect(escaparCsv("Dracaena draco")).toBe("Dracaena draco");
  });

  it("un valor nulo se convierte en cadena vacía", () => {
    expect(escaparCsv(null)).toBe("");
    expect(escaparCsv(undefined)).toBe("");
  });

  it("un nombre con punto y coma no rompe la fila", () => {
    const csv = construirCsvProductos([{ ...PRODUCTOS[0], nombre_natural: "Drago; canario" }]);
    const fila = csv.split("\r\n")[1];
    expect(fila).toContain('"Drago; canario"');
  });
});

describe("CSV de productos · casos límite", () => {
  it("un catálogo vacío produce solo la cabecera", () => {
    expect(construirCsvProductos([])).toBe(CSV_HEADERS.join(";"));
  });

  it("tolera una entrada que no es un array", () => {
    expect(construirCsvProductos(null)).toBe(CSV_HEADERS.join(";"));
  });

  it("el nombre del fichero es estable", () => {
    expect(CSV_FILENAME).toBe("productos_vivero.csv");
  });
});

/* ══ Mutación: el contrato tiene que DETECTAR los cambios ═══════════════ */

describe("mutación · el contrato del CSV detecta cambios", () => {
  function comprueba(reales, pactadas) {
    try {
      expect(reales).toEqual(pactadas);
      return "pasa";
    } catch {
      return "falla";
    }
  }

  it("la salida sin mutar cumple el contrato", () => {
    expect(comprueba([...CSV_HEADERS], CSV_HEADERS)).toBe("pasa");
  });

  it("detecta un REORDENADO de columnas", () => {
    const mutadas = [...CSV_HEADERS];
    [mutadas[4], mutadas[5]] = [mutadas[5], mutadas[4]]; // Stock ↔ Stock mínimo
    expect(comprueba(mutadas, CSV_HEADERS)).toBe("falla");
  });

  it("detecta un RENOMBRADO de columna", () => {
    const mutadas = CSV_HEADERS.map((c) => (c === "Precio (€)" ? "Precio" : c));
    expect(comprueba(mutadas, CSV_HEADERS)).toBe("falla");
  });

  it("detecta una columna añadida o eliminada", () => {
    expect(comprueba([...CSV_HEADERS, "Zona"], CSV_HEADERS)).toBe("falla");
    expect(comprueba(CSV_HEADERS.slice(0, -1), CSV_HEADERS)).toBe("falla");
  });

  it("detecta el cambio de coma decimal a punto", () => {
    const bueno = filaCsv(PRODUCTOS[0])[6];
    const mutado = Number(PRODUCTOS[0].precio).toFixed(2); // sin reemplazar
    expect(bueno).toBe("34,50");
    expect(mutado).toBe("34.50");
    expect(mutado).not.toBe(bueno);
  });

  it("detecta el cambio de separador de campos", () => {
    const csv = construirCsvProductos(PRODUCTOS);
    const cabecera = csv.split("\r\n")[0];
    expect(cabecera.split(";")).toHaveLength(8);
    // Con coma, la cabecera no se partiría en ocho.
    expect(cabecera.split(",")).not.toHaveLength(8);
  });

  it("detecta que un precio nulo pase a escribirse como 0", () => {
    const bueno = filaCsv(PRODUCTOS[1])[6];
    const mutado = Number(PRODUCTOS[1].precio || 0).toFixed(2).replace(".", ",");
    expect(bueno).toBe("");
    expect(mutado).toBe("0,00");
  });
});
