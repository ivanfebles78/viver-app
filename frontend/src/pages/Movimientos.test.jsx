/**
 * MOVIMIENTOS — pruebas de comportamiento.
 *
 * La lógica pura ya está protegida por `movimientos.equivalence.test.js`, que
 * la compara con una copia literal de main sobre 400 movimientos y 60
 * combinaciones de filtros. Aquí se prueba lo que esa comparación no alcanza:
 * que la PANTALLA use esa lógica, que las once columnas sigan estando en su
 * orden, y que las acciones hagan lo que hacían.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../api/api", () => ({
  getMovimientos: vi.fn(),
  getProductos: vi.fn(),
  getPedidos: vi.fn(),
  createMovimiento: vi.fn(),
}));

vi.mock("../components/vivero/zonesStorage", () => ({
  loadZonasFromServer: vi.fn(),
}));

import { getMovimientos, getProductos, getPedidos, createMovimiento } from "../api/api";
import { loadZonasFromServer } from "../components/vivero/zonesStorage";
import Movimientos from "./Movimientos";

const MOVS = [
  {
    id: 1,
    fecha_movimiento: "2026-03-10T09:00:00Z",
    producto_id: 7,
    producto_nombre_cientifico: "Dracaena draco",
    producto_nombre_natural: "Drago",
    cantidad: 12,
    origen_tipo: "Vivero",
    destino_tipo: "UTE",
    zona_origen: "3a",
    tamano_origen: "M20",
    distrito_destino: "Anaga",
    barrio_destino: "San Andrés",
    direccion_destino: "Calle Mayor 3",
    uuid_lote: "lote-aaa",
    created_by: "maria.perez",
    pedido_id: 55,
    es_prestamo: true,
  },
  {
    id: 2,
    fecha_movimiento: "2026-04-02T11:30:00Z",
    producto_id: 9,
    producto_nombre_cientifico: "Phoenix canariensis",
    producto_nombre_natural: "Palmera canaria",
    cantidad: 4,
    origen_tipo: "Proveedores del vivero",
    destino_tipo: "Vivero",
    zona_destino: "12",
    tamano_destino: "M35",
    uuid_lote: "lote-bbb",
    created_by: "juan.lopez",
  },
  {
    id: 3,
    fecha_movimiento: "2026-04-02T12:00:00Z",
    producto_id: 7,
    producto_nombre_cientifico: "Dracaena draco",
    cantidad: 2,
    origen_tipo: "Vivero",
    destino_tipo: "Vivero",
    zona_origen: "3a",
    zona_destino: "12",
    tamano_origen: "M20",
    tamano_destino: "M35",
    uuid_lote: "lote-ccc",
    created_by: "maria.perez",
  },
  {
    id: 4,
    fecha_movimiento: "2026-05-01T08:00:00Z",
    producto_id: 9,
    producto_nombre_cientifico: "Phoenix canariensis",
    cantidad: 1,
    origen_tipo: "Colegio",
    destino_tipo: "Vivero",
    zona_destino: "3a",
    tamano_destino: "M35",
    uuid_lote: "",
    created_by: "ana.gil",
  },
];

const CABECERAS = [
  "Fecha",
  "Tipo",
  "Nombre científico",
  "Cant.",
  "Origen",
  "Destino",
  "Préstamo",
  "Usuario",
  "UUID lote",
  "Pedido",
  "Detalles",
];

beforeEach(() => {
  getMovimientos.mockResolvedValue(MOVS);
  getProductos.mockResolvedValue([
    { id: 7, nombre_cientifico: "Dracaena draco", nombre_natural: "Drago", categoria: "Árbol" },
    { id: 9, nombre_cientifico: "Phoenix canariensis", nombre_natural: "Palmera canaria", categoria: "Palmera" },
  ]);
  getPedidos.mockResolvedValue([]);
  loadZonasFromServer.mockResolvedValue([]);
  createMovimiento.mockResolvedValue({});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const pintar = () => render(<Movimientos />);

const esperarTabla = async () => {
  await screen.findByRole("table");
  return screen.getByRole("table");
};

/*
 * `DataTable` renderiza a la vez la vista de tabla y la de fichas —una se
 * oculta por CSS según el ancho—, así que cualquier consulta global encuentra
 * cada botón dos veces. Se acota a la tabla.
 */
const enTabla = () => within(screen.getByRole("table"));

describe("Movimientos · tabla", () => {
  it("mantiene las once columnas, en el mismo orden que antes", async () => {
    /*
     * El orden es contrato: el personal del vivero lee esta tabla a diario y
     * la imprime. Reordenar columnas «porque queda mejor» rompe la costumbre.
     */
    pintar();
    const tabla = await esperarTabla();
    const cabeceras = within(tabla).getAllByRole("columnheader").map((th) => th.textContent.trim());
    expect(cabeceras).toEqual(CABECERAS);
  });

  it("una fila por movimiento", async () => {
    pintar();
    const tabla = await esperarTabla();
    expect(within(tabla).getAllByRole("row").slice(1)).toHaveLength(MOVS.length);
  });

  it("deriva el tipo cuando el movimiento no lo trae", async () => {
    // Ninguno de los datos de prueba tiene `tipo_movimiento`: todos se derivan.
    pintar();
    const tabla = await esperarTabla();
    const texto = tabla.textContent;
    expect(texto).toContain("Salida"); // Vivero → UTE
    expect(texto).toContain("Entrada"); // Proveedores → Vivero
    expect(texto).toContain("Traslado"); // Vivero → Vivero
    expect(texto).toContain("Devolución"); // Colegio → Vivero
  });

  it("el tipo se lee como texto, no solo como color", async () => {
    // SC 1.4.1. Antes era `fontWeight: 900` con un color por tipo.
    pintar();
    const tabla = await esperarTabla();
    const celdas = within(tabla).getAllByRole("cell");
    expect(celdas.some((c) => /^Traslado$/.test(c.textContent.trim()))).toBe(true);
  });

  it("compone origen y destino con zona y tamaño", async () => {
    pintar();
    const tabla = await esperarTabla();
    expect(tabla.textContent).toContain("Vivero");
    // Destino externo: se añaden distrito, barrio y dirección.
    expect(tabla.textContent).toContain("Calle Mayor 3");
  });

  it("marca préstamo y devolución con texto", async () => {
    pintar();
    const tabla = await esperarTabla();
    const celdas = within(tabla).getAllByRole("cell").map((c) => c.textContent.trim());
    expect(celdas).toContain("Préstamo");
    expect(celdas.filter((t) => t === "Devolución").length).toBeGreaterThan(0);
  });

  it("la tabla tiene caption y cabeceras con scope", async () => {
    pintar();
    const tabla = await esperarTabla();
    expect(within(tabla).getByText(/movimientos registrados/i)).toBeInTheDocument();
    for (const th of within(tabla).getAllByRole("columnheader")) {
      expect(th).toHaveAttribute("scope", "col");
    }
  });
});

describe("Movimientos · filtros", () => {
  it("el filtro de producto busca por nombre", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    await user.type(screen.getByLabelText(/^producto/i), "phoenix");
    await waitFor(() => {
      const tabla = screen.getByRole("table");
      expect(within(tabla).getAllByRole("row").slice(1)).toHaveLength(2);
    });
  });

  it("el filtro de UUID busca por fragmento", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    await user.type(screen.getByLabelText(/uuid de lote/i), "aaa");
    await waitFor(() => {
      expect(within(screen.getByRole("table")).getAllByRole("row").slice(1)).toHaveLength(1);
    });
  });

  it("los filtros se combinan con Y lógico", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    await user.type(screen.getByLabelText(/^producto/i), "dracaena");
    await user.type(screen.getByLabelText(/uuid de lote/i), "ccc");
    await waitFor(() => {
      expect(within(screen.getByRole("table")).getAllByRole("row").slice(1)).toHaveLength(1);
    });
  });

  it("«Limpiar filtros» solo aparece cuando hay alguno puesto", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    expect(screen.queryByRole("button", { name: /limpiar filtros/i })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/^producto/i), "x");
    expect(await screen.findByRole("button", { name: /limpiar filtros/i })).toBeInTheDocument();
  });

  it("«Limpiar filtros» devuelve todas las filas", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    await user.type(screen.getByLabelText(/^producto/i), "phoenix");
    await waitFor(() =>
      expect(within(screen.getByRole("table")).getAllByRole("row").slice(1)).toHaveLength(2)
    );

    await user.click(screen.getByRole("button", { name: /limpiar filtros/i }));
    await waitFor(() =>
      expect(within(screen.getByRole("table")).getAllByRole("row").slice(1)).toHaveLength(MOVS.length)
    );
  });

  it("el pie de la tabla dice cuántas filas se están viendo", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    await user.type(screen.getByLabelText(/^producto/i), "phoenix");
    expect(await screen.findByText(/movimientos filtrados: 2 de 4/i)).toBeInTheDocument();
  });

  it("cuando ningún movimiento coincide, lo explica", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    await user.type(screen.getByLabelText(/^producto/i), "zzzznoexiste");
    expect(await screen.findByText(/ningún movimiento coincide/i)).toBeInTheDocument();
  });

  it("los siete filtros tienen etiqueta accesible", async () => {
    pintar();
    await esperarTabla();
    for (const etiqueta of [/^producto/i, /^tipo/i, /^zona/i, /uuid de lote/i, /^origen/i, /^destino/i, /^fecha/i]) {
      expect(screen.getByLabelText(etiqueta)).toBeInTheDocument();
    }
  });

  it("la barra de filtros se anuncia como búsqueda", async () => {
    pintar();
    await esperarTabla();
    expect(screen.getByRole("search", { name: /filtros de movimientos/i })).toBeInTheDocument();
  });
});

describe("Movimientos · estados", () => {
  it("anuncia la carga", async () => {
    let resolver;
    getMovimientos.mockReturnValue(new Promise((r) => { resolver = r; }));
    const { container } = pintar();
    /*
     * `DataTable` en carga pinta esqueletos, no un texto: se comprueba que hay
     * esqueletos y que aún no hay filas de datos, no una cadena concreta.
     */
    await waitFor(() =>
      expect(container.querySelectorAll("[data-slot='skeleton'], .animate-pulse").length).toBeGreaterThan(0)
    );
    resolver([]);
    await waitFor(() =>
      expect(container.querySelectorAll("[data-slot='skeleton'], .animate-pulse").length).toBe(0)
    );
  });

  it("sin movimientos, invita a registrar el primero", async () => {
    getMovimientos.mockResolvedValue([]);
    pintar();
    expect(await screen.findByText(/todavía no hay movimientos/i)).toBeInTheDocument();
  });

  it("si falla la carga lo dice y no deja la pantalla muda", async () => {
    /*
     * `Promise.all`, no `allSettled`: si falla una fuente no hay datos. Es el
     * comportamiento anterior y se conserva a propósito.
     */
    getPedidos.mockRejectedValue({ response: { data: { detail: "503 Service Unavailable" } } });
    pintar();
    expect(await screen.findByRole("alert")).toHaveTextContent("503 Service Unavailable");
  });

  it("si falla la carga de zonas, la pantalla sigue funcionando", async () => {
    loadZonasFromServer.mockRejectedValue(new Error("sin conexión"));
    pintar();
    await esperarTabla();
    expect(screen.getByLabelText(/^zona/i)).toBeInTheDocument();
  });
});

describe("Movimientos · copiar UUID", () => {
  it("copia al portapapeles y confirma", async () => {
    const user = userEvent.setup();
    /*
     * El stub va DESPUÉS de `userEvent.setup()`: userEvent v14 instala el suyo
     * al arrancar y sobrescribiría este. Y se define en vez de asignarse,
     * porque `navigator.clipboard` solo tiene getter.
     */
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    pintar();
    await esperarTabla();

    await user.click(enTabla().getByRole("button", { name: /copiar el uuid del lote lote-aaa/i }));
    expect(writeText).toHaveBeenCalledWith("lote-aaa");
    expect(await screen.findByRole("status")).toHaveTextContent("lote-aaa");
  });

  it("es un BOTÓN, no un div clicable", async () => {
    /*
     * En main había un botón «Copiar» y, al lado, un div con el mismo onClick.
     * El div no era enfocable: con teclado, media interacción no existía.
     */
    pintar();
    await esperarTabla();
    const boton = enTabla().getByRole("button", { name: /copiar el uuid del lote lote-aaa/i });
    expect(boton.tagName).toBe("BUTTON");
    expect(boton).toHaveTextContent("lote-aaa");
  });

  it("un movimiento sin UUID no ofrece copiar", async () => {
    pintar();
    await esperarTabla();
    expect(enTabla().queryByRole("button", { name: /copiar el uuid del lote $/i })).not.toBeInTheDocument();
  });

  it("si el portapapeles falla, lo dice", async () => {
    // Igual que arriba: el stub va DESPUÉS de `userEvent.setup()`.
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denegado")) },
      configurable: true,
    });
    pintar();
    await esperarTabla();

    await user.click(enTabla().getByRole("button", { name: /copiar el uuid del lote lote-aaa/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudo copiar/i);
  });
});

describe("Movimientos · mensajes", () => {
  it("el aviso se puede descartar a mano", async () => {
    /*
     * DEFECTO INTRODUCIDO Y CORREGIDO: al migrar pasé `onClose` a `Alert`,
     * que espera `onDismiss`. React no avisa de props desconocidas en
     * componentes propios, así que el botón de cerrar desaparecía en silencio
     * y el aviso solo se iba solo a los 3 s. En main se podía cerrar.
     */
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denegado")) },
      configurable: true,
    });
    pintar();
    await esperarTabla();

    await user.click(enTabla().getByRole("button", { name: /copiar el uuid del lote lote-aaa/i }));
    const aviso = await screen.findByRole("alert");

    const cerrar = within(aviso).getByRole("button", { name: /descartar aviso/i });
    await user.click(cerrar);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});

describe("Movimientos · detalle", () => {
  it("abre el detalle con los datos del movimiento", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    await user.click(enTabla().getByRole("button", { name: /ver el detalle del movimiento 1/i }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText(/detalle del movimiento #1/i)).toBeInTheDocument();
    // `formatUsername` capitaliza cada parte: "maria.perez" → "Maria.Perez".
    expect(within(dialogo).getByText(/Maria\.Perez/i)).toBeInTheDocument();
    expect(within(dialogo).getByText("lote-aaa")).toBeInTheDocument();
  });

  it("el detalle se cierra con Escape", async () => {
    // Antes era un div fijo: Escape no hacía nada.
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    await user.click(enTabla().getByRole("button", { name: /ver el detalle del movimiento 1/i }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("muestra la dirección solo cuando la hay", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    await user.click(enTabla().getByRole("button", { name: /ver el detalle del movimiento 1/i }));
    let dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText(/dirección destino/i)).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(enTabla().getByRole("button", { name: /ver el detalle del movimiento 2/i }));
    dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).queryByText(/dirección destino/i)).not.toBeInTheDocument();
  });
});

describe("Movimientos · cabecera", () => {
  it("un solo h1", async () => {
    pintar();
    await esperarTabla();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("las dos acciones siguen estando", async () => {
    pintar();
    await esperarTabla();
    expect(screen.getByRole("button", { name: /nuevo movimiento/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /servir pedido/i })).toBeInTheDocument();
  });

  it("«Nuevo movimiento» abre la cesta", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    await user.click(screen.getByRole("button", { name: /nuevo movimiento/i }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByRole("tab", { name: /salida/i })).toBeInTheDocument();
  });

  it("«Servir pedido» abre el asistente en el paso 1", async () => {
    const user = userEvent.setup();
    pintar();
    await esperarTabla();

    await user.click(screen.getByRole("button", { name: /servir pedido/i }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText(/qué tipo de movimiento/i)).toBeInTheDocument();
    expect(within(dialogo).getByRole("radiogroup", { name: /tipo de movimiento/i })).toBeInTheDocument();
  });
});
