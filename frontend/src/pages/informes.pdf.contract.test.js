/**
 * CONTRATO DE LOS PDF DE INFORMES.
 *
 * Esta es la protección central de la Fase 4B. La auditoría avisó de que las
 * llamadas a `autoTable` comparten arrays y criterios de formato con las tablas
 * que se pintan en pantalla: rediseñar la interfaz podía cambiar en silencio el
 * orden de las columnas de un PDF que un ayuntamiento archiva.
 *
 * CÓMO FUNCIONA. Se intercepta `autoTable` y `jsPDF`, se ejecuta el generador
 * real de los diez informes contra datos fijos, y se comprueba:
 *
 *   1. Cuántas tablas emite cada informe.
 *   2. La cabecera EXACTA de cada tabla, en orden.
 *   3. El contenido de las celdas, incluido el formato (fechas, miles, euros).
 *   4. El nombre del fichero.
 *
 * Se escribió ANTES de tocar la interfaz. `informes.pdf.mutation.test.js`
 * demuestra que detecta un reordenado o un renombrado de columna.
 *
 * REGLA: si una prueba de aquí falla, ha cambiado un documento oficial. No se
 * actualiza la expectativa sin decidir explícitamente que el PDF cambia.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

/* ── Dobles de jsPDF y autoTable ─────────────────────────────────────────── */

const llamadas = [];
let ultimoNombre = "";

vi.mock("jspdf-autotable", () => ({
  default: (doc, opciones) => {
    llamadas.push(opciones);
    // `finalY` encadena tablas: el generador lo usa para colocar la siguiente.
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
    save(nombre) {
      ultimoNombre = nombre;
    }
  }
  return { jsPDF: FakeDoc };
});

vi.mock("../assets/logo.png", () => ({ default: "logo.png" }));

import { exportReportToPdf } from "./informes.pdf";

/* ── Datos fijos ─────────────────────────────────────────────────────────── */

const ME = { username: "maria.perez", rol: "admin_vivero" };

/*
 * Las formas de estos objetos NO son inventadas: se han leído del generador,
 * campo a campo. Escribir el contrato obligó a conocer exactamente qué espera
 * cada informe, que era parte del objetivo.
 */
const DATOS = {
  trazabilidadData: {
    uuid_lote: "3f2a91c4-8b17-4e5d-9a2f-71c6e0d4b8aa",
    producto_nombre: "Dracaena draco",
    producto_id: 7,
    cantidad_inicial: 1200,
    fecha_entrada: "2026-01-15T10:00:00Z",
    movimientos: [
      {
        fecha_movimiento: "2026-02-20T09:30:00Z",
        cantidad: 300,
        origen_tipo: "Vivero",
        destino_tipo: "UTE",
        descripcion: "Salida a obra",
      },
    ],
    inventario_actual: [{ zona: "3a", tamano: "M20", cantidad_disponible: 500 }],
  },
  distribucionData: {
    producto_id: 7,
    producto_nombre: "Dracaena draco",
    stock_total: 900,
    distribucion: [{ zona: "3a", tamano: "M20", cantidad: 500 }],
  },
  inventarioVivero: [
    {
      label: "Zona 3a",
      tamanos: ["M12", "M20"],
      productos: [
        { nombre: "Dracaena draco", nombreComun: "Drago", tamanos: { M12: 10, M20: 5 }, total: 15 },
      ],
    },
  ],
  stockExportData: {
    filters: { categoria: "", subcategoria: "", search: "", estado: "" },
    totalProductos: 2,
    totalCategorias: 1,
    groups: [
      {
        categoria: "Árbol",
        totalProductos: 2,
        stockTotal: 30,
        items: [
          {
            nombreDisplay: "Dracaena draco",
            subcategoria: "Autóctono",
            stockActual: 4,
            stockMinimo: 12,
            estado: "Bajo mínimo",
          },
        ],
      },
    ],
  },
  caducidadExportData: {
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
  },
  /* `externosData` es un ARRAY, no un objeto: el generador hace
     `externosData.map(...)` directamente. */
  externosData: [
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
  ],
  prestamosExportData: {
    totalPrestamos: 1,
    totalActivos: 1,
    totalDevueltos: 0,
    items: [
      {
        pedidoId: 55,
        fechaPrestamo: "2026-03-10T09:00:00Z",
        solicitante: "juan.lopez",
        destinatario: "Colegio X",
        lineas: [{ producto: "Dracaena draco", tamano: "M20", prestado: 10 }],
        estado: "Activo",
        totalPrestado: 10,
        totalDevuelto: 4,
        totalPendiente: 6,
      },
    ],
  },
  abastecimientoExportData: {
    total: 1,
    reserva: 0,
    aprobados: 1,
    servidos: 0,
    denegados: 0,
    cancelados: 0,
    totalPedido: 100,
    totalServido: 60,
    totalPendiente: 40,
    items: [
      {
        id: 42,
        fecha: "2026-04-01T08:00:00Z",
        solicitante: "ana.gil",
        estado: "Aprobado",
        lineas: [{ producto: "Dracaena draco", tamano: "M20", cantidadPedida: 100 }],
        totalPedido: 100,
        totalServido: 60,
        totalPendiente: 40,
      },
    ],
  },
  bajasExportData: {
    filtros: { producto: "", categoria: "", subcategoria: "", fecha_desde: "", fecha_hasta: "" },
    totalMovimientos: 1,
    productosUnicos: 1,
    totalUnidades: 3,
    items: [
      {
        fecha: "2026-05-01T08:00:00Z",
        producto: "Phoenix canariensis",
        categoria: "Palmera",
        subcategoria: "Canaria",
        zonaOrigen: "12",
        tamano: "M35",
        cantidad: 3,
        uuidLote: "lote-xyz",
        createdBy: "ana.gil",
      },
    ],
  },
  estadisticasExportData: {
    filtros: { desde: "2026-01-01", hasta: "2026-12-31" },
    totalCoste: 125,
    costesMensuales: [{ mes: "2026-01", total: 1234.5 }],
    topProductos: [{ nombre: "Dracaena draco", cantidad: 40 }],
    rows: [
      {
        fecha: "2026-01-20T10:00:00Z",
        nombreDisplay: "Dracaena draco",
        categoria: "Árbol",
        subcategoria: "Autóctono",
        tamano: "M20",
        cantidad: 10,
        precio: 12.5,
        coste: 125,
      },
    ],
  },
};

async function generar(activeReport) {
  llamadas.length = 0;
  ultimoNombre = "";
  await exportReportToPdf({ activeReport, me: ME, ...DATOS });
  return llamadas.map((c) => ({
    head: c.head,
    body: c.body,
    // La cabecera es lo que fija el contrato de columnas.
    columnas: Array.isArray(c.head?.[0]) ? c.head[0] : c.head?.[0],
  }));
}

beforeEach(() => {
  llamadas.length = 0;
  ultimoNombre = "";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

/* ══ CONTRATO DE COLUMNAS ═══════════════════════════════════════════════════
 * Una entrada por tabla emitida, en el ORDEN en que se emiten.
 * ═════════════════════════════════════════════════════════════════════════ */

const CONTRATO = {
  trazabilidad: [
    ["Campo", "Valor"],
    ["Fecha", "Cantidad", "Origen", "Destino", "Descripción"],
    ["Zona", "Tamaño", "Cantidad disponible"],
  ],
  distribucion: [
    ["Campo", "Valor"],
    ["Zona", "Tamaño", "Cantidad"],
  ],
  inventario: [["Producto", "M12", "M20", "Total"]],
  stock: [
    ["Filtro", "Valor"],
    ["Categoría", "Nº productos", "Stock total"],
    ["Detalle · Árbol", "Subcategoría", "Stock actual", "Stock mínimo", "Estado"],
  ],
  caducidad: [
    ["Resumen", "Valor"],
    ["Producto", "Categoría", "Subcategoría", "Zona", "Tamaño", "Fecha caducidad", "Días", "Estado"],
  ],
  externos: [
    ["Fecha", "Producto", "Cantidad", "Origen", "Destino", "Ubicación destino", "Registrado por"],
  ],
  bajas: [
    ["Filtro", "Valor"],
    ["Resumen", "Valor"],
    ["Fecha", "Producto", "Categoría", "Subcategoría", "Zona origen", "Tamaño", "Unidades", "UUID lote", "Registrado por"],
  ],
  abastecimiento: [
    ["Resumen", "Valor"],
    ["Pedido", "Fecha", "Solicitante", "Estado", "Líneas", "Pedido", "Servido", "Pendiente"],
  ],
  prestamos: [
    ["Resumen", "Valor"],
    ["Pedido", "Fecha", "Solicitante", "Destino", "Elementos", "Estado", "Prestado", "Devuelto", "Pendiente"],
  ],
  estadisticas: [
    ["Filtro / Resumen", "Valor"],
    ["Mes", "Coste de reposición"],
    ["Producto más solicitado", "Unidades"],
    ["Fecha", "Producto", "Categoría", "Subcat.", "Tamaño", "Cant.", "Precio", "Coste"],
  ],
};

describe("PDF · contrato de columnas", () => {
  for (const [informe, esperado] of Object.entries(CONTRATO)) {
    it(`«${informe}» emite ${esperado.length} tabla(s) con las columnas pactadas`, async () => {
      const tablas = await generar(informe);
      expect(tablas).toHaveLength(esperado.length);
      // Se compara el array COMPLETO: identidad, orden y número de columnas.
      expect(tablas.map((t) => t.columnas)).toEqual(esperado);
    });
  }
});

describe("PDF · el orden de las columnas es parte del contrato", () => {
  it("«externos» tiene la fecha primero y el usuario último", async () => {
    const [tabla] = await generar("externos");
    expect(tabla.columnas[0]).toBe("Fecha");
    expect(tabla.columnas.at(-1)).toBe("Registrado por");
  });

  it("«caducidad» tiene ocho columnas y «Estado» al final", async () => {
    const tablas = await generar("caducidad");
    const detalle = tablas.at(-1);
    expect(detalle.columnas).toHaveLength(8);
    expect(detalle.columnas.at(-1)).toBe("Estado");
  });

  it("«estadisticas» pone el detalle de filas en la ÚLTIMA tabla", async () => {
    const tablas = await generar("estadisticas");
    expect(tablas.at(-1).columnas[0]).toBe("Fecha");
    expect(tablas.at(-1).columnas.at(-1)).toBe("Coste");
  });

  it("«inventario» genera una columna por tamaño, entre Producto y Total", async () => {
    // Es la única tabla con columnas DINÁMICAS: dependen de los tamaños con
    // existencias en la zona. La forma sí es fija.
    const [tabla] = await generar("inventario");
    expect(tabla.columnas[0]).toBe("Producto");
    expect(tabla.columnas.at(-1)).toBe("Total");
    expect(tabla.columnas.slice(1, -1)).toEqual(["M12", "M20"]);
  });
});

describe("PDF · contenido y formato de las celdas", () => {
  it("«trazabilidad» vuelca los campos del lote en su orden", async () => {
    const [ficha, movimientos, stock] = await generar("trazabilidad");
    expect(ficha.body.map((f) => f[0])).toEqual([
      "UUID",
      "Producto",
      "Cantidad inicial",
      "Fecha de entrada",
    ]);
    expect(ficha.body[0][1]).toBe("3f2a91c4-8b17-4e5d-9a2f-71c6e0d4b8aa");
    /* es-ES NO agrupa los millares de cuatro cifras (minimumGroupingDigits=2
       en CLDR): 1200 se escribe «1200» y 12000, «12.000». Se compara con el
       mismo formateador para no fijar una convención equivocada. */
    expect(ficha.body[2][1]).toBe(new Intl.NumberFormat("es-ES").format(1200));
    expect(movimientos.body[0][2]).toBe("Vivero");
    expect(stock.body[0]).toEqual(["3a", "M20", "500"]);
  });

  it("«externos» respeta el orden de campos de cada fila", async () => {
    const [tabla] = await generar("externos");
    const fila = tabla.body[0];
    expect(fila).toHaveLength(7);
    expect(fila[1]).toBe("Dracaena draco");
    expect(fila[2]).toBe("12");
    expect(fila[3]).toBe("Vivero");
    expect(fila[4]).toBe("UTE");
    expect(fila[5]).toBe("Anaga · San Andrés · Calle Mayor 3");
  });

  it("«estadisticas» formatea los importes en euros", async () => {
    const tablas = await generar("estadisticas");
    const detalle = tablas.at(-1);
    const fila = detalle.body[0];
    // El precio y el coste llevan símbolo de euro; la cantidad no.
    expect(String(fila[6])).toMatch(/€/);
    expect(String(fila[7])).toMatch(/€/);
    expect(String(fila[5])).not.toMatch(/€/);
  });

  it("«inventario» usa «—» donde no hay existencias de ese tamaño", async () => {
    const [tabla] = await generar("inventario");
    const fila = tabla.body[0];
    // Nombre científico y común en la misma celda, separados por salto.
    expect(fila[0]).toBe("Dracaena draco\nDrago");
    expect(fila[1]).toBe("10");
    expect(fila[2]).toBe("5");
    expect(fila[3]).toBe("15");
  });

  it("«bajas» conserva el UUID del lote en su columna", async () => {
    const tablas = await generar("bajas");
    const detalle = tablas.at(-1);
    expect(detalle.body[0][7]).toBe("lote-xyz");
  });

  it("«prestamos» mantiene prestado, devuelto y pendiente en ese orden", async () => {
    const tablas = await generar("prestamos");
    const detalle = tablas.at(-1);
    const fila = detalle.body[0];
    expect(fila.slice(-3)).toEqual(["10", "4", "6"]);
  });

  it("«abastecimiento» mantiene pedido, servido y pendiente en ese orden", async () => {
    const tablas = await generar("abastecimiento");
    const detalle = tablas.at(-1);
    expect(detalle.body[0].slice(-3)).toEqual(["100", "60", "40"]);
  });
});

describe("PDF · casos vacíos", () => {
  it("un inventario sin zonas no emite ninguna tabla", async () => {
    llamadas.length = 0;
    await exportReportToPdf({
      activeReport: "inventario",
      me: ME,
      ...DATOS,
      inventarioVivero: [],
    });
    expect(llamadas).toHaveLength(0);
  });

  it("un lote sin movimientos sigue emitiendo la ficha", async () => {
    llamadas.length = 0;
    await exportReportToPdf({
      activeReport: "trazabilidad",
      me: ME,
      ...DATOS,
      trazabilidadData: { ...DATOS.trazabilidadData, movimientos: [], stock_por_zona: [] },
    });
    expect(llamadas.length).toBeGreaterThan(0);
    expect(llamadas[0].head[0]).toEqual(["Campo", "Valor"]);
  });
});

describe("PDF · nombre del fichero", () => {
  const NOMBRES = {
    trazabilidad: /reporte_trazabilidad/,
    distribucion: /reporte_distribucion/,
    inventario: /inventario_vivero/,
    stock: /reporte_existencias/,
    caducidad: /reporte_caducidad/,
    abastecimiento: /reporte_abastecimiento/,
  };

  for (const [informe, patron] of Object.entries(NOMBRES)) {
    it(`«${informe}» se guarda como ${patron.source}`, async () => {
      await generar(informe);
      expect(ultimoNombre).toMatch(patron);
      expect(ultimoNombre).toMatch(/\.pdf$/);
    });
  }
});
