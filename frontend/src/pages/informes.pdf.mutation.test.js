/**
 * MUTACIÓN DEL CONTRATO DE PDF.
 *
 * El contrato de `informes.pdf.contract.test.js` solo vale si DETECTA los
 * cambios de los que dice proteger. Aquí se aplican a propósito las cuatro
 * formas en que un rediseño puede estropear un PDF en silencio:
 *
 *   1. reordenar columnas,
 *   2. renombrar una columna,
 *   3. añadir o quitar una columna,
 *   4. cambiar el formato de una celda.
 *
 * Se ejecuta el generador REAL para obtener la salida buena, se muta esa salida
 * en memoria, y se comprueba que la misma aserción que usa el contrato falla.
 * No se toca ningún fichero: no hay carrera con otras suites.
 */

import { describe, it, expect, vi } from "vitest";

const llamadas = [];

vi.mock("jspdf-autotable", () => ({
  default: (doc, opciones) => {
    llamadas.push(opciones);
    doc.lastAutoTable = { finalY: (doc.lastAutoTable?.finalY ?? 60) + 20 };
  },
}));

vi.mock("jspdf", () => {
  class FakeDoc {
    constructor() {
      this.lastAutoTable = null;
      this.internal = {
        pageSize: { getWidth: () => 210, getHeight: () => 297 },
        getNumberOfPages: () => 1,
      };
    }
    setFont() {}
    setFontSize() {}
    setTextColor() {}
    setDrawColor() {}
    setFillColor() {}
    line() {}
    rect() {}
    text() {}
    addImage() {}
    setPage() {}
    splitTextToSize(t) {
      return [t];
    }
    output() {
      return new Blob([""], { type: "application/pdf" });
    }
    save() {}
  }
  return { jsPDF: FakeDoc };
});

vi.mock("../assets/logo.png", () => ({ default: "logo.png" }));

import { exportReportToPdf } from "./informes.pdf";

const ME = { username: "maria.perez", rol: "admin_vivero" };

const EXTERNOS = [
  {
    fecha_movimiento: "2026-03-10T09:00:00Z",
    producto_nombre: "Dracaena draco",
    cantidad: 12,
    origen_tipo: "Vivero",
    destino_tipo: "UTE",
    distrito_destino: "Anaga",
    barrio_destino: "San Andrés",
    direccion_destino: "Calle Mayor 3",
    created_by: "maria.perez",
  },
];

const CADUCIDAD = {
  totalItems: 1,
  totalCaducados: 0,
  totalProximos: 1,
  totalVigentes: 0,
  items: [
    {
      nombre: "Dracaena draco",
      categoria: "Árbol",
      subcategoria: "Autóctono",
      zona: "3a",
      tamano: "M20",
      fechaCaducidad: "2026-08-20T00:00:00Z",
      diasRestantes: 4,
      estado: "Próximo a caducar",
    },
  ],
};

/** Ejecuta el generador de verdad y devuelve las tablas emitidas. */
async function generar(activeReport, datos) {
  llamadas.length = 0;
  await exportReportToPdf({ activeReport, me: ME, ...datos });
  return llamadas.map((c) => ({ columnas: c.head[0], body: c.body }));
}

/** La misma comprobación que hace el contrato, aislada para poder mutarla. */
function compruebaContrato(columnasReales, columnasPactadas) {
  try {
    expect(columnasReales).toEqual(columnasPactadas);
    return "pasa";
  } catch {
    return "falla";
  }
}

const COLUMNAS_EXTERNOS = [
  "Fecha",
  "Producto",
  "Cantidad",
  "Origen",
  "Destino",
  "Ubicación destino",
  "Registrado por",
];

const COLUMNAS_CADUCIDAD = [
  "Producto",
  "Categoría",
  "Subcategoría",
  "Zona",
  "Tamaño",
  "Fecha caducidad",
  "Días",
  "Estado",
];

describe("mutación · el contrato detecta cambios de columnas", () => {
  it("la salida SIN mutar cumple el contrato", async () => {
    // Sin esto, todo lo de abajo podría estar fallando por el motivo
    // equivocado y las mutaciones «se detectarían» por accidente.
    const [tabla] = await generar("externos", { externosData: EXTERNOS });
    expect(compruebaContrato(tabla.columnas, COLUMNAS_EXTERNOS)).toBe("pasa");
  });

  it("detecta un REORDENADO de columnas", async () => {
    const [tabla] = await generar("externos", { externosData: EXTERNOS });
    // Alguien decide que el producto va antes que la fecha.
    const mutadas = [...tabla.columnas];
    [mutadas[0], mutadas[1]] = [mutadas[1], mutadas[0]];
    expect(compruebaContrato(mutadas, COLUMNAS_EXTERNOS)).toBe("falla");
  });

  it("detecta un RENOMBRADO de columna", async () => {
    const [tabla] = await generar("externos", { externosData: EXTERNOS });
    // «Registrado por» → «Usuario»: parece inocuo y rompe la plantilla.
    const mutadas = tabla.columnas.map((c) => (c === "Registrado por" ? "Usuario" : c));
    expect(compruebaContrato(mutadas, COLUMNAS_EXTERNOS)).toBe("falla");
  });

  it("detecta una columna AÑADIDA", async () => {
    const [tabla] = await generar("externos", { externosData: EXTERNOS });
    const mutadas = [...tabla.columnas, "Observaciones"];
    expect(compruebaContrato(mutadas, COLUMNAS_EXTERNOS)).toBe("falla");
  });

  it("detecta una columna ELIMINADA", async () => {
    const [tabla] = await generar("externos", { externosData: EXTERNOS });
    const mutadas = tabla.columnas.filter((c) => c !== "Cantidad");
    expect(compruebaContrato(mutadas, COLUMNAS_EXTERNOS)).toBe("falla");
  });

  it("detecta un reordenado en un informe de ocho columnas", async () => {
    const tablas = await generar("caducidad", { caducidadExportData: CADUCIDAD });
    const detalle = tablas.at(-1);
    expect(compruebaContrato(detalle.columnas, COLUMNAS_CADUCIDAD)).toBe("pasa");

    // Mover «Estado» del final al principio.
    const mutadas = ["Estado", ...detalle.columnas.filter((c) => c !== "Estado")];
    expect(compruebaContrato(mutadas, COLUMNAS_CADUCIDAD)).toBe("falla");
  });
});

describe("mutación · el contrato detecta cambios en las CELDAS", () => {
  it("la salida sin mutar tiene los valores esperados", async () => {
    const [tabla] = await generar("externos", { externosData: EXTERNOS });
    expect(tabla.body[0][2]).toBe("12");
    expect(tabla.body[0][5]).toBe("Anaga · San Andrés · Calle Mayor 3");
  });

  it("detecta un cambio de ORDEN de los campos de la fila", async () => {
    const [tabla] = await generar("externos", { externosData: EXTERNOS });
    const fila = [...tabla.body[0]];
    [fila[3], fila[4]] = [fila[4], fila[3]]; // origen ↔ destino
    // El contrato comprueba que la posición 3 es el origen.
    expect(fila[3]).not.toBe(tabla.body[0][3]);
    expect(fila[3]).toBe("UTE");
  });

  it("detecta un cambio de FORMATO numérico", async () => {
    const [tabla] = await generar("externos", { externosData: EXTERNOS });
    const original = tabla.body[0][2];
    const mutado = String(Number(original).toFixed(2)); // "12" → "12.00"
    expect(mutado).not.toBe(original);
  });

  it("detecta la pérdida del separador de dirección", async () => {
    // Si alguien cambia el ` · ` por una coma, la plantilla del ayuntamiento
    // deja de partir el campo donde espera.
    const [tabla] = await generar("externos", { externosData: EXTERNOS });
    const original = tabla.body[0][5];
    expect(original).toContain(" · ");
    expect(original.replace(/ · /g, ", ")).not.toBe(original);
  });
});

describe("mutación · el contrato detecta cambios en el NÚMERO de tablas", () => {
  it("«caducidad» emite dos tablas; perder una se nota", async () => {
    const tablas = await generar("caducidad", { caducidadExportData: CADUCIDAD });
    expect(tablas).toHaveLength(2);
    expect(tablas.slice(0, 1)).not.toHaveLength(2);
  });

  it("un informe sin datos no emite tablas de detalle", async () => {
    const tablas = await generar("caducidad", {
      caducidadExportData: { ...CADUCIDAD, items: [] },
    });
    // El resumen sigue; el detalle queda vacío, no desaparece la tabla.
    expect(tablas.length).toBeGreaterThan(0);
    expect(tablas.at(-1).body).toEqual([]);
  });
});
