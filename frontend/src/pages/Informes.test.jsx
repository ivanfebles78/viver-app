/**
 * INFORMES — pruebas de comportamiento.
 *
 * El contrato de los PDF vive aparte (`informes.pdf.contract.test.js`, 29
 * comprobaciones, más 12 de mutación). Aquí se prueba la PANTALLA, y sobre todo
 * lo que esta tiene y Movimientos no: **control de acceso por rol**.
 *
 * A diferencia de Movimientos, Informes sí decide por sí misma qué ve cada rol,
 * así que esa lógica es parte de lo que la migración no puede alterar.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const outletContext = { me: { username: "maria.perez", rol: "admin" } };

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig()),
  useOutletContext: () => outletContext,
}));

vi.mock("../api/api", () => ({
  getDistribucionReporte: vi.fn(),
  getMovimientosExternosReporte: vi.fn(),
  getTrazabilidadReporte: vi.fn(),
  getProductos: vi.fn(),
  getMovimientos: vi.fn(),
  getPedidos: vi.fn(),
  getActiveClienteId: vi.fn(),
  getMiAyuntamiento: vi.fn(),
  getPresupuesto: vi.fn(),
  getDistribucionEconomica: vi.fn(),
}));

vi.mock("./informes.pdf", () => ({ exportReportToPdf: vi.fn() }));

import * as api from "../api/api";
import { exportReportToPdf } from "./informes.pdf";
import Informes from "./Informes";

/** Todos los informes, en el orden en que los declara la pantalla. */
const TODOS = [
  "Trazabilidad",
  "Distribución",
  "Inventario vivero",
  "Existencias",
  "Caducidad",
  "Movimientos externos",
  "Préstamos",
  "Abastecimiento",
  "Baja vivero",
  "Estadísticas",
  "Distribución económica",
];

function conRol(rol) {
  outletContext.me = { username: "u", rol };
}

beforeEach(() => {
  conRol("admin");
  api.getProductos.mockResolvedValue([]);
  api.getMovimientos.mockResolvedValue([]);
  api.getPedidos.mockResolvedValue([]);
  api.getTrazabilidadReporte.mockResolvedValue(null);
  api.getDistribucionReporte.mockResolvedValue(null);
  api.getMovimientosExternosReporte.mockResolvedValue([]);
  api.getActiveClienteId.mockReturnValue(null);
  api.getMiAyuntamiento.mockResolvedValue({ nombre: "Ayuntamiento de Prueba" });
  api.getPresupuesto.mockResolvedValue({ anio: 2026, importe: null, tiene_presupuesto: false, consumido: 0, restante: null, moneda: "EUR" });
  api.getDistribucionEconomica.mockResolvedValue({ grupos: [], total_valor: 0, total_unidades: 0, moneda: "EUR" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Nombres de los informes visibles, leídos de los controles de la pantalla. */
function informesVisibles() {
  return TODOS.filter((n) => screen.queryByRole("button", { name: new RegExp(`^${n}$`, "i") }));
}

describe("Informes · acceso por rol", () => {
  it("un administrador ve todos los informes (incluida Distribución económica)", async () => {
    conRol("admin");
    render(<Informes />);
    await screen.findByRole("heading", { level: 1 });
    expect(informesVisibles()).toEqual(TODOS);
  });

  it("«Distribución económica» genera el informe por distrito y barrio", async () => {
    conRol("admin");
    api.getDistribucionEconomica.mockResolvedValue({
      grupos: [
        { distrito: "Centro", barrio: "Barrio A", valor: 250, unidades: 3, lineas: 2 },
        { distrito: "Centro", barrio: "Barrio B", valor: 200, unidades: 4, lineas: 1 },
      ],
      total_valor: 450,
      total_unidades: 7,
      moneda: "EUR",
    });
    const user = userEvent.setup();
    render(<Informes />);
    await screen.findByRole("heading", { level: 1 });
    await user.click(screen.getByRole("button", { name: /^Distribución económica$/i }));
    await user.click(screen.getByRole("button", { name: /generar informe/i }));

    expect(await screen.findByText("Barrio A")).toBeInTheDocument();
    expect(screen.getByText("Barrio B")).toBeInTheDocument();
    await vi.waitFor(() => expect(api.getDistribucionEconomica).toHaveBeenCalled());
  });

  it("el super-admin SIN ayuntamiento seleccionado no puede generar informes", async () => {
    // Un informe es de un ayuntamiento concreto: sin uno elegido, se pide
    // seleccionarlo y no se muestra ningún informe.
    conRol("superadmin");
    api.getActiveClienteId.mockReturnValue(null);
    render(<Informes />);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByText(/selecciona un ayuntamiento/i)).toBeInTheDocument();
    expect(informesVisibles()).toEqual([]);
  });

  it("el super-admin CON ayuntamiento seleccionado sí ve los informes", async () => {
    conRol("superadmin");
    api.getActiveClienteId.mockReturnValue(3);
    render(<Informes />);
    await screen.findByRole("heading", { level: 1 });
    expect(informesVisibles()).toEqual(TODOS);
  });

  it("una empresa externa ve SOLO «Movimientos externos»", async () => {
    /*
     * Es el rol más restringido y el que más importa: una empresa externa no
     * debe poder consultar existencias ni costes del vivero.
     */
    conRol("empresa_externa");
    render(<Informes />);
    await screen.findByRole("heading", { level: 1 });
    expect(informesVisibles()).toEqual(["Movimientos externos"]);
  });

  it("un técnico ve distribución, inventario y existencias, y nada más", async () => {
    conRol("tecnico");
    render(<Informes />);
    await screen.findByRole("heading", { level: 1 });
    expect(informesVisibles()).toEqual(["Distribución", "Inventario vivero", "Existencias"]);
  });

  it("«Estadísticas» es SOLO para administrador", async () => {
    // Incluye costes de reposición: no lo ve ni el gestor ni el manager.
    for (const rol of ["manager", "gestor_vivero"]) {
      conRol(rol);
      const { unmount } = render(<Informes />);
      await screen.findByRole("heading", { level: 1 });
      expect(informesVisibles()).not.toContain("Estadísticas");
      unmount();
    }
  });

  it("un gestor de vivero ve todo menos estadísticas", async () => {
    conRol("gestor_vivero");
    render(<Informes />);
    await screen.findByRole("heading", { level: 1 });
    expect(informesVisibles()).toEqual(TODOS.filter((n) => n !== "Estadísticas"));
  });

  it("un rol sin acceso ve un aviso, no una pantalla en blanco", async () => {
    conRol("rol_inventado");
    render(<Informes />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/no tienes permisos/i);
  });

  it("el informe activo inicial respeta la restricción del rol", async () => {
    // Una empresa externa no puede arrancar en «Trazabilidad».
    conRol("empresa_externa");
    render(<Informes />);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("button", { name: /^Trazabilidad$/i })).not.toBeInTheDocument();
  });
});

describe("Informes · exportación", () => {
  it("no se puede exportar hasta que hay datos", async () => {
    render(<Informes />);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByRole("button", { name: /exportar/i })).toBeDisabled();
  });

  it("el botón explica por qué está deshabilitado", async () => {
    render(<Informes />);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByRole("button", { name: /exportar/i })).toHaveAttribute(
      "title",
      expect.stringMatching(/genera primero/i)
    );
  });

  it("no llama al generador de PDF si no hay informe", async () => {
    const user = userEvent.setup();
    render(<Informes />);
    await screen.findByRole("heading", { level: 1 });

    const boton = screen.getByRole("button", { name: /exportar/i });
    await user.click(boton).catch(() => {});
    expect(exportReportToPdf).not.toHaveBeenCalled();
  });
});

describe("Informes · estructura", () => {
  it("un solo h1", async () => {
    render(<Informes />);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("cada informe se elige con un botón, accesible por teclado", async () => {
    render(<Informes />);
    await screen.findByRole("heading", { level: 1 });
    for (const nombre of TODOS) {
      const boton = screen.getByRole("button", { name: new RegExp(`^${nombre}$`, "i") });
      expect(boton.tagName).toBe("BUTTON");
    }
  });

  it("cambiar de informe cambia el contenido", async () => {
    const user = userEvent.setup();
    render(<Informes />);
    await screen.findByRole("heading", { level: 1 });

    await user.click(screen.getByRole("button", { name: /^Distribución$/i }));
    expect(await screen.findByText(/en qué zonas del vivero/i)).toBeInTheDocument();
  });
});

describe("Informes · trazabilidad", () => {
  it("consulta el lote y muestra sus movimientos", async () => {
    const user = userEvent.setup();
    api.getTrazabilidadReporte.mockResolvedValue({
      uuid_lote: "lote-aaa",
      producto_nombre: "Dracaena draco",
      cantidad_inicial: 100,
      fecha_entrada: "2026-01-15T10:00:00Z",
      movimientos: [
        {
          fecha_movimiento: "2026-02-20T09:30:00Z",
          cantidad: 30,
          origen_tipo: "Vivero",
          destino_tipo: "UTE",
          descripcion: "Salida",
        },
      ],
      inventario_actual: [],
    });

    render(<Informes />);
    await screen.findByRole("heading", { level: 1 });

    const campos = screen.getAllByRole("textbox");
    await user.type(campos[0], "lote-aaa");
    await user.click(screen.getByRole("button", { name: /generar informe/i }));

    expect(await screen.findByText("Dracaena draco")).toBeInTheDocument();
    expect(api.getTrazabilidadReporte).toHaveBeenCalledWith("lote-aaa");
  });

  it("con datos, el botón de exportar se habilita", async () => {
    const user = userEvent.setup();
    api.getTrazabilidadReporte.mockResolvedValue({
      uuid_lote: "lote-aaa",
      producto_nombre: "Dracaena draco",
      cantidad_inicial: 100,
      movimientos: [],
      inventario_actual: [],
    });

    render(<Informes />);
    await screen.findByRole("heading", { level: 1 });
    const campos = screen.getAllByRole("textbox");
    await user.type(campos[0], "lote-aaa");
    await user.click(screen.getByRole("button", { name: /generar informe/i }));

    await screen.findByText("Dracaena draco");
    expect(screen.getByRole("button", { name: /exportar/i })).not.toBeDisabled();
  });

  it("el informe se genera con el NOMBRE del ayuntamiento activo", async () => {
    // Requisito: el informe debe incluir el nombre del ayuntamiento que lo pide.
    // Se resuelve con /mi-ayuntamiento y se pasa al generador del PDF.
    const user = userEvent.setup();
    api.getMiAyuntamiento.mockResolvedValue({ nombre: "Ayuntamiento de La Laguna" });
    api.getTrazabilidadReporte.mockResolvedValue({
      uuid_lote: "lote-aaa",
      producto_nombre: "Dracaena draco",
      cantidad_inicial: 100,
      movimientos: [],
      inventario_actual: [],
    });

    render(<Informes />);
    await screen.findByRole("heading", { level: 1 });
    const campos = screen.getAllByRole("textbox");
    await user.type(campos[0], "lote-aaa");
    await user.click(screen.getByRole("button", { name: /generar informe/i }));
    await screen.findByText("Dracaena draco");

    // «Exportar» abre un menú; el PDF está en «Exportar a PDF».
    await user.click(screen.getByRole("button", { name: /^exportar$/i }));
    await user.click(await screen.findByRole("menuitem", { name: /exportar a pdf/i }));

    await vi.waitFor(() => expect(exportReportToPdf).toHaveBeenCalledTimes(1));
    const arg = exportReportToPdf.mock.calls[0][0];
    expect(arg.me.cliente_nombre).toBe("Ayuntamiento de La Laguna");
  });
});

describe("Informes · estados de las tablas", () => {
  it("la tabla de existencias del lote lleva cabeceras de columna", async () => {
    const user = userEvent.setup();
    api.getTrazabilidadReporte.mockResolvedValue({
      uuid_lote: "lote-aaa",
      producto_nombre: "Dracaena draco",
      cantidad_inicial: 100,
      movimientos: [
        {
          fecha_movimiento: "2026-02-20T09:30:00Z",
          cantidad: 30,
          origen_tipo: "Vivero",
          destino_tipo: "UTE",
          descripcion: "Salida",
        },
      ],
      inventario_actual: [{ zona: "3a", tamano: "M20", cantidad_disponible: 40 }],
    });

    render(<Informes />);
    await screen.findByRole("heading", { level: 1 });
    const campos = screen.getAllByRole("textbox");
    await user.type(campos[0], "lote-aaa");
    await user.click(screen.getByRole("button", { name: /generar informe/i }));

    const tabla = await screen.findByRole("table");
    expect(within(tabla).getAllByRole("columnheader").length).toBeGreaterThan(0);
  });
});
