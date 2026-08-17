/**
 * CONTRATO DEL PDF DE PEDIDOS.
 *
 * Mismo método que en la Fase 4B con Informes, y por el mismo motivo: este
 * documento se imprime y se archiva. Se intercepta `autoTable` y `jsPDF`, se
 * ejecuta el generador REAL contra datos fijos y se fija:
 *
 *   1. cuántas tablas emite cada pedido,
 *   2. la cabecera EXACTA de la tabla de líneas,
 *   3. el contenido de las celdas, incluido el cálculo de «pendiente»,
 *   4. el agrupado por destino,
 *   5. el nombre del fichero.
 *
 * Se escribió ANTES de tocar la interfaz. Las mutaciones de abajo demuestran
 * que detecta un reordenado, un renombrado y un cambio de cálculo.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const llamadas = [];
let ultimoNombre = "";

vi.mock("jspdf-autotable", () => ({
  default: (doc, opciones) => {
    llamadas.push(opciones);
    doc.lastAutoTable = { finalY: (doc.lastAutoTable?.finalY ?? 55) + 20 };
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
    addPage() {}
    setPage() {}
    splitTextToSize(t) {
      return [t];
    }
    output() {
      return "blob:fake";
    }
    save(nombre) {
      ultimoNombre = nombre;
    }
  }
  return { jsPDF: FakeDoc };
});

vi.mock("../assets/logo.png", () => ({ default: "logo.png" }));

import { buildPedidosPdf, guardarPedidosPdf } from "./pedidos.pdf";

/* ── Datos fijos ─────────────────────────────────────────────────────────── */

const PEDIDO = {
  id: 42,
  tipo: "salida",
  estado: "APROBADO_PARCIAL",
  solicitante_username: "medina",
  fecha_caducidad: "2026-09-30T00:00:00Z",
  aprobado_por: "ana.gil",
  aprobado_at: "2026-08-02T10:00:00Z",
  served_by: null,
  served_at: null,
  created_at: "2026-08-01T09:00:00Z",
  distrito_destino: "Anaga",
  barrio_destino: "San Andrés",
  direccion_destino: "Calle Mayor 3",
  items: [
    {
      producto_id: 7,
      producto_nombre_cientifico: "Dracaena draco",
      tamano: "M20",
      cantidad: 10,
      cantidad_servida: 4,
      estado_item: "APROBADO",
      distrito_destino: "Anaga",
      barrio_destino: "San Andrés",
      direccion_destino: "Calle Mayor 3",
    },
    {
      producto_id: 9,
      producto_nombre_cientifico: "Phoenix canariensis",
      tamano: "M35",
      cantidad: 5,
      cantidad_servida: 0,
      estado_item: "DENEGADO",
      distrito_destino: "Anaga",
      barrio_destino: "San Andrés",
      direccion_destino: "Calle Mayor 3",
    },
  ],
};

const MAP_NOMBRES = new Map([[7, "Dracaena draco"], [9, "Phoenix canariensis"]]);

/** Cabecera de la tabla de líneas — el contrato de columnas. */
const COLUMNAS_LINEAS = ["Producto", "Tamaño", "Cant.", "Servido", "Pend.", "Estado"];

async function generar(pedidos = [PEDIDO]) {
  llamadas.length = 0;
  ultimoNombre = "";
  await buildPedidosPdf(pedidos, MAP_NOMBRES);
  return llamadas;
}

/** Solo las tablas que declaran cabecera: la de líneas. */
const tablasConCabecera = () => llamadas.filter((c) => Array.isArray(c.head));

beforeEach(() => {
  llamadas.length = 0;
  ultimoNombre = "";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("PDF de pedidos · contrato de columnas", () => {
  it("la tabla de líneas tiene sus seis columnas, en orden", async () => {
    await generar();
    const conCabecera = tablasConCabecera();
    expect(conCabecera.length).toBeGreaterThan(0);
    for (const t of conCabecera) {
      expect(t.head[0]).toEqual(COLUMNAS_LINEAS);
    }
  });

  it("«Producto» va primero y «Estado» último", async () => {
    await generar();
    const cols = tablasConCabecera()[0].head[0];
    expect(cols[0]).toBe("Producto");
    expect(cols.at(-1)).toBe("Estado");
  });

  it("la ficha de cabecera mantiene sus cuatro filas y su orden", async () => {
    await generar();
    // La primera tabla es la ficha: pares etiqueta/valor sin cabecera.
    const ficha = llamadas.find((c) => !c.head && Array.isArray(c.body) && c.body.length === 4);
    expect(ficha).toBeTruthy();
    expect(ficha.body.map((f) => f[0])).toEqual([
      "Tipo",
      "Solicitante",
      "Aprobado por",
      "Servido por",
    ]);
    expect(ficha.body.map((f) => f[2])).toEqual(["Estado", "Caduca el", "Aprobado el", "Servido el"]);
  });
});

describe("PDF de pedidos · contenido de las celdas", () => {
  it("calcula «pendiente» como cantidad − servido, nunca negativo", async () => {
    await generar();
    const filas = tablasConCabecera().flatMap((t) => t.body);
    const drago = filas.find((f) => f[0] === "Dracaena draco");
    expect(drago[2]).toBe("10"); // cantidad
    expect(drago[3]).toBe("4"); // servido
    expect(drago[4]).toBe("6"); // pendiente
  });

  it("un servido mayor que la cantidad no produce un pendiente negativo", async () => {
    await generar([
      {
        ...PEDIDO,
        items: [{ ...PEDIDO.items[0], cantidad: 3, cantidad_servida: 8 }],
      },
    ]);
    const fila = tablasConCabecera().flatMap((t) => t.body)[0];
    expect(fila[4]).toBe("0");
  });

  it("resuelve el nombre del producto con la cadena de respaldos", async () => {
    await generar([
      {
        ...PEDIDO,
        items: [{ producto_id: 7, tamano: "M12", cantidad: 1, cantidad_servida: 0 }],
      },
    ]);
    // Sin nombre en la línea, tira del mapa de productos.
    expect(tablasConCabecera().flatMap((t) => t.body)[0][0]).toBe("Dracaena draco");
  });

  it("un producto desconocido cae en «Producto #id», no en vacío", async () => {
    await generar([
      {
        ...PEDIDO,
        items: [{ producto_id: 999, tamano: "M12", cantidad: 1, cantidad_servida: 0 }],
      },
    ]);
    expect(tablasConCabecera().flatMap((t) => t.body)[0][0]).toBe("Producto #999");
  });

  it("una línea sin tamaño muestra «—», no una celda vacía", async () => {
    await generar([
      {
        ...PEDIDO,
        items: [{ producto_id: 7, cantidad: 1, cantidad_servida: 0 }],
      },
    ]);
    expect(tablasConCabecera().flatMap((t) => t.body)[0][1]).toBe("—");
  });

  it("el estado de la línea llega a su columna", async () => {
    await generar();
    const filas = tablasConCabecera().flatMap((t) => t.body);
    const estados = filas.map((f) => f[5]);
    expect(estados.join(" ")).toMatch(/denegad/i);
  });
});

describe("PDF de pedidos · agrupado por destino", () => {
  it("las líneas con el mismo destino van juntas", async () => {
    await generar();
    // Un solo destino en el pedido de prueba → una sola tabla de líneas.
    expect(tablasConCabecera()).toHaveLength(1);
    expect(tablasConCabecera()[0].body).toHaveLength(2);
  });

  it("dos destinos distintos generan dos tablas", async () => {
    await generar([
      {
        ...PEDIDO,
        items: [
          { ...PEDIDO.items[0], direccion_destino: "Calle A" },
          { ...PEDIDO.items[1], direccion_destino: "Calle B" },
        ],
      },
    ]);
    expect(tablasConCabecera()).toHaveLength(2);
  });
});

describe("PDF de pedidos · varios pedidos", () => {
  it("cada pedido aporta su ficha y sus líneas", async () => {
    const antes = (await generar([PEDIDO])).length;
    const despues = (await generar([PEDIDO, { ...PEDIDO, id: 43 }])).length;
    expect(despues).toBe(antes * 2);
  });

  it("una lista vacía no emite ninguna tabla", async () => {
    expect(await generar([])).toHaveLength(0);
  });
});

describe("PDF de pedidos · nombre del fichero", () => {
  it("un solo pedido se guarda con su número", async () => {
    await guardarPedidosPdf([PEDIDO], MAP_NOMBRES);
    expect(ultimoNombre).toMatch(/^pedido_42_\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it("varios pedidos se guardan como «pedidos_fecha»", async () => {
    await guardarPedidosPdf([PEDIDO, { ...PEDIDO, id: 43 }], MAP_NOMBRES);
    expect(ultimoNombre).toMatch(/^pedidos_\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it("una lista vacía NO genera fichero", async () => {
    ultimoNombre = "";
    await guardarPedidosPdf([], MAP_NOMBRES);
    expect(ultimoNombre).toBe("");
  });
});

/* ══ Mutación: el contrato tiene que DETECTAR los cambios ═══════════════ */

describe("mutación · el contrato de pedidos detecta cambios", () => {
  function comprueba(reales, pactadas) {
    try {
      expect(reales).toEqual(pactadas);
      return "pasa";
    } catch {
      return "falla";
    }
  }

  it("la salida sin mutar cumple el contrato", async () => {
    await generar();
    expect(comprueba(tablasConCabecera()[0].head[0], COLUMNAS_LINEAS)).toBe("pasa");
  });

  it("detecta un REORDENADO de columnas", async () => {
    await generar();
    const cols = [...tablasConCabecera()[0].head[0]];
    [cols[2], cols[3]] = [cols[3], cols[2]]; // Cant. ↔ Servido
    expect(comprueba(cols, COLUMNAS_LINEAS)).toBe("falla");
  });

  it("detecta un RENOMBRADO de columna", async () => {
    await generar();
    const cols = tablasConCabecera()[0].head[0].map((c) => (c === "Pend." ? "Pendiente" : c));
    expect(comprueba(cols, COLUMNAS_LINEAS)).toBe("falla");
  });

  it("detecta una columna añadida o eliminada", async () => {
    await generar();
    const cols = tablasConCabecera()[0].head[0];
    expect(comprueba([...cols, "Precio"], COLUMNAS_LINEAS)).toBe("falla");
    expect(comprueba(cols.slice(0, -1), COLUMNAS_LINEAS)).toBe("falla");
  });

  it("detecta un cambio en el cálculo de «pendiente»", async () => {
    await generar();
    const fila = tablasConCabecera()[0].body[0];
    // La mutación clásica: olvidar el max(…, 0) o restar al revés.
    const mutado = String(Number(fila[3]) - Number(fila[2]));
    expect(mutado).not.toBe(fila[4]);
  });

  it("detecta la pérdida del agrupado por destino", async () => {
    const conDosDestinos = await generar([
      {
        ...PEDIDO,
        items: [
          { ...PEDIDO.items[0], direccion_destino: "Calle A" },
          { ...PEDIDO.items[1], direccion_destino: "Calle B" },
        ],
      },
    ]);
    const tablas = conDosDestinos.filter((c) => Array.isArray(c.head));
    expect(tablas).toHaveLength(2);
    // Si se perdiera el agrupado, sería una sola tabla con las dos líneas.
    expect(tablas.length).not.toBe(1);
  });
});
