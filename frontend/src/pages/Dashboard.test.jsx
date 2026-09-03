/**
 * PANEL DE CONTROL — pruebas.
 *
 * El panel es la pieza central de la Fase 3 y la que más cambió de forma, así
 * que lo primero que se prueba NO es el aspecto sino que las cifras siguen
 * siendo las mismas.
 *
 * La equivalencia se comprueba contra una copia literal de la lógica de
 * `Dashboard.jsx@main` —pegada abajo, sin tocar una coma— sobre conjuntos de
 * datos generados. Se compara contra lo que el usuario LEE en pantalla, no
 * contra una función interna: así la prueba también cubre el formateo y la
 * composición, que es donde un rediseño rompe las cosas sin querer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../api/api", () => ({
  getMe: vi.fn(),
  getProductos: vi.fn(),
  getPedidos: vi.fn(),
  getDashboardAnalytics: vi.fn(),
}));

import { getMe, getProductos, getPedidos } from "../api/api";
import Dashboard from "./Dashboard";

/* ══════════════════════════════════════════════════════════════════════════
 * COPIA LITERAL DE main — no editar para «arreglar» un fallo.
 * Si esto y el panel discrepan, el que ha cambiado de comportamiento es el
 * panel, y hay que justificarlo, no reescribir el testigo.
 * ══════════════════════════════════════════════════════════════════════════ */

function estadoNormalizado_main(value) {
  return String(value || "").trim().toUpperCase();
}

function pedidoGroupLabel_main(value) {
  const e = estadoNormalizado_main(value);
  if (e === "RESERVA" || e === "PENDIENTE") return "RESERVA";
  if (e === "APROBADO" || e === "APROBADO_PARCIAL") return "APROBADO";
  if (e === "SERVIDO") return "SERVIDO";
  if (e === "DENEGADO") return "DENEGADO";
  if (e === "CANCELADO" || e === "CADUCADO") return "CANCELADO";
  return "OTROS";
}

function metrics_main(productos, pedidos) {
  const prods = productos || [];
  const peds = pedidos || [];
  const totalProductos = prods.length;
  const stockTotal = prods.reduce((acc, p) => acc + Number(p?.stock ?? p?.stock_real ?? 0), 0);
  const bajoMinimo = prods.filter((p) => {
    const stock = Number(p?.stock ?? p?.stock_real ?? 0);
    const min = Number(p?.stock_minimo ?? 0);
    return Number.isFinite(min) && min > 0 && stock < min;
  }).length;

  return {
    totalProductos,
    stockTotal,
    bajoMinimo,
    reserva: peds.filter((p) => pedidoGroupLabel_main(p?.estado) === "RESERVA").length,
    aprobados: peds.filter((p) => pedidoGroupLabel_main(p?.estado) === "APROBADO").length,
    totalPedidos: peds.length,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */

const numero = (n) => new Intl.NumberFormat("es-ES").format(Number(n || 0));

/** Generador determinista: mismos datos en cada ejecución y en CI. */
function generarDatos(semilla) {
  let s = semilla;
  const rnd = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const estados = [
    "RESERVA", "reserva", " PENDIENTE ", "APROBADO", "aprobado_parcial",
    "SERVIDO", "DENEGADO", "CANCELADO", "CADUCADO", "", null, "INVENTADO",
  ];
  const productos = Array.from({ length: 1 + Math.floor(rnd() * 12) }, (_, i) => {
    const usarStockReal = rnd() > 0.5;
    const stock = Math.floor(rnd() * 200);
    return {
      id: i + 1,
      nombre_natural: `Producto ${i + 1}`,
      categoria: ["Árbol", "Palmera", "Arbusto", ""][Math.floor(rnd() * 4)],
      // Mitad usa `stock`, mitad `stock_real`: el respaldo forma parte del contrato.
      ...(usarStockReal ? { stock_real: stock } : { stock }),
      stock_minimo: [0, 10, 50, undefined, null][Math.floor(rnd() * 5)],
    };
  });
  const pedidos = Array.from({ length: Math.floor(rnd() * 15) }, () => ({
    estado: estados[Math.floor(rnd() * estados.length)],
  }));
  return { productos, pedidos };
}

function pintar() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

beforeEach(() => {
  getMe.mockResolvedValue({ id: 1, rol: "admin_vivero" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Dashboard · equivalencia de negocio con main", () => {
  /*
   * §20. «Sin cambios funcionales» hay que demostrarlo. Se generan 20 conjuntos
   * distintos —con estados en minúscula, con espacios, nulos y desconocidos, y
   * con productos que usan `stock` o `stock_real` indistintamente— y se
   * comprueba que las cuatro cifras del panel coinciden con las que calculaba
   * main.
   */
  for (let semilla = 1; semilla <= 20; semilla += 1) {
    it(`conjunto ${semilla}: las cifras coinciden con las de main`, async () => {
      const { productos, pedidos } = generarDatos(semilla * 7919);
      getProductos.mockResolvedValue(productos);
      getPedidos.mockResolvedValue(pedidos);

      const esperado = metrics_main(productos, pedidos);
      const { container } = pintar();

      await screen.findByText("Productos");

      const textos = container.textContent;
      // Cada cifra tiene que aparecer formateada en es-ES.
      expect(textos).toContain(numero(esperado.totalProductos));
      expect(textos).toContain(numero(esperado.stockTotal));
      expect(textos).toContain(
        `${numero(esperado.reserva)} en reserva · ${numero(esperado.aprobados)} aprobados`
      );
      // «Pedidos activos» = reserva + aprobados, igual que en main.
      expect(textos).toContain(numero(esperado.reserva + esperado.aprobados));
    });
  }
});

describe("Dashboard · estructura y jerarquía", () => {
  beforeEach(() => {
    getProductos.mockResolvedValue([
      { id: 1, nombre_natural: "Drago", categoria: "Árbol", stock: 2, stock_minimo: 10 },
      { id: 2, nombre_natural: "Palmera", categoria: "Palmera", stock: 80, stock_minimo: 10 },
    ]);
    getPedidos.mockResolvedValue([{ estado: "RESERVA" }, { estado: "APROBADO" }]);
  });

  it("hay un solo h1 y es el título de la página", async () => {
    pintar();
    const h1s = await screen.findAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("Panel de control");
  });

  it("cada indicador dice qué mide, no solo un número suelto", async () => {
    pintar();
    await screen.findByText("Productos");
    // Sin la pista, «2» no distingue unidades de lotes ni de productos.
    expect(screen.getByText("En catálogo")).toBeInTheDocument();
    expect(screen.getByText("Unidades en existencias")).toBeInTheDocument();
    expect(screen.getByText("Productos por reponer")).toBeInTheDocument();
  });

  it("marca «bajo mínimo» solo cuando hay algo que reponer", async () => {
    pintar();
    expect(await screen.findByText("Requiere reposición")).toBeInTheDocument();
  });

  it("no marca «bajo mínimo» cuando el valor es 0", async () => {
    // Un 0 aquí es lo normal: teñirlo sería celebrar la ausencia de problemas.
    getProductos.mockResolvedValue([{ id: 1, nombre_natural: "Drago", stock: 80, stock_minimo: 10 }]);
    pintar();
    await screen.findByText("Productos");
    expect(screen.queryByText("Requiere reposición")).not.toBeInTheDocument();
  });

  it("lista QUÉ productos están bajo mínimo, no solo cuántos", async () => {
    /*
     * El panel anterior calculaba este conjunto y lo tiraba: mostraba «1» sin
     * decir cuál. Es dato que ya existía, no funcionalidad nueva.
     */
    pintar();
    const tablas = await screen.findAllByRole("table");
    const texto = tablas.map((t) => t.textContent).join(" ");
    expect(texto).toContain("Drago");
    expect(texto).not.toContain("Palmera");
  });

  it("cuando no hay nada urgente lo dice, en vez de dejar un hueco", async () => {
    getProductos.mockResolvedValue([{ id: 1, nombre_natural: "Drago", stock: 80, stock_minimo: 10 }]);
    getPedidos.mockResolvedValue([]);
    pintar();
    expect(await screen.findByText(/no hay nada pendiente|sin nada que requiera/i)).toBeInTheDocument();
  });
});

describe("Dashboard · caducidades", () => {
  /** Fecha relativa a hoy, para no depender del día en que se ejecute. */
  const enDias = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  beforeEach(() => {
    getPedidos.mockResolvedValue([]);
  });

  it("ordena por urgencia: lo caducado antes que lo próximo a caducar", async () => {
    getProductos.mockResolvedValue([
      {
        id: 1,
        nombre_natural: "Vigente",
        lotes: [{ uuid: "u-vig", cantidad: 1, fecha_caducidad: enDias(200) }],
      },
      {
        id: 2,
        nombre_natural: "Proximo",
        lotes: [{ uuid: "u-pro", cantidad: 1, fecha_caducidad: enDias(3) }],
      },
      {
        id: 3,
        nombre_natural: "Caducado",
        lotes: [{ uuid: "u-cad", cantidad: 1, fecha_caducidad: enDias(-10) }],
      },
    ]);
    pintar();

    const tabla = (await screen.findAllByRole("table"))[0];
    const filas = within(tabla).getAllByRole("row").slice(1);
    const nombres = filas.map((f) => f.textContent);

    expect(nombres[0]).toContain("Caducado");
    expect(nombres[1]).toContain("Proximo");
    // Lo vigente no requiere atención y no entra en esta tabla.
    expect(nombres.join(" ")).not.toContain("Vigente");
  });

  it("fusiona el mismo lote llegue por alertas_caducidad o por lotes", async () => {
    // La clave de deduplicación de main omite `id` y `source` justo para esto.
    getProductos.mockResolvedValue([
      {
        id: 1,
        nombre_natural: "Drago",
        alertas_caducidad: [
          { uuid_lote: "L1", zona: "A", tamano: "M", cantidad: 5, fecha_caducidad: enDias(-1) },
        ],
        lotes: [{ uuid: "L1", zona: "A", tamano: "M", cantidad: 5, fecha_caducidad: enDias(-1) }],
      },
    ]);
    pintar();

    const tabla = (await screen.findAllByRole("table"))[0];
    const filas = within(tabla).getAllByRole("row").slice(1);
    expect(filas).toHaveLength(1);
  });

  it("el estado nunca se comunica solo con color", async () => {
    // SC 1.4.1. La versión anterior teñía la fila y ya está.
    getProductos.mockResolvedValue([
      { id: 1, nombre_natural: "Drago", lotes: [{ uuid: "L1", cantidad: 1, fecha_caducidad: enDias(-1) }] },
    ]);
    pintar();
    const tabla = (await screen.findAllByRole("table"))[0];
    // Una celda con la palabra escrita, no un fondo rojo. Se busca en las
    // celdas de datos para no contar la cabecera ni el resumen.
    const celdas = within(tabla).getAllByRole("cell");
    const conTexto = celdas.filter((c) => /caducado/i.test(c.textContent));
    expect(conTexto.length).toBeGreaterThan(0);
  });
});

describe("Dashboard · datos parciales y errores", () => {
  it("si falla una fuente, muestra el resto y dice qué falta", async () => {
    getProductos.mockResolvedValue([{ id: 1, nombre_natural: "Drago", stock: 5 }]);
    getPedidos.mockRejectedValue(new Error("502 Bad Gateway"));
    pintar();

    expect(await screen.findByText(/no se han podido cargar/i)).toBeInTheDocument();
    expect(screen.getByText(/Pedidos:/)).toBeInTheDocument();
    // Y aun así el resto del panel está.
    expect(screen.getByText("Productos")).toBeInTheDocument();
  });

  it("si fallan las dos fuentes sigue habiendo panel, no pantalla en blanco", async () => {
    getProductos.mockRejectedValue(new Error("timeout"));
    getPedidos.mockRejectedValue(new Error("timeout"));
    pintar();

    expect(await screen.findByText(/no se han podido cargar/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Panel de control");
  });

  it("un fallo de /me no rompe el panel", async () => {
    // main lo pedía y descartaba el resultado; se conserva esa tolerancia.
    getMe.mockRejectedValue(new Error("401"));
    getProductos.mockResolvedValue([]);
    getPedidos.mockResolvedValue([]);
    pintar();
    expect(await screen.findByText("Productos")).toBeInTheDocument();
  });

  it("anuncia la carga en vez de dejar la pantalla muda", async () => {
    let resolver;
    getProductos.mockReturnValue(new Promise((r) => { resolver = r; }));
    getPedidos.mockResolvedValue([]);
    pintar();
    expect(screen.getByText(/cargando el estado del vivero/i)).toBeInTheDocument();
    resolver([]);
    await screen.findByText("Productos");
  });
});

describe("Dashboard · accesos rápidos", () => {
  it("son enlaces, no botones", async () => {
    /*
     * Navegar es un enlace. Un <button> que navega no se abre en pestaña
     * nueva, no ofrece menú contextual y se anuncia como «botón».
     */
    getProductos.mockResolvedValue([]);
    getPedidos.mockResolvedValue([]);
    pintar();

    const enlace = await screen.findByRole("link", { name: /productos/i });
    expect(enlace).toHaveAttribute("href");
  });
});
