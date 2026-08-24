/**
 * EXISTENCIAS EN LA TABLA DE PRODUCTOS — stock, reservado y disponible.
 *
 * Las tres cifras las calcula el backend y aquí NO se recalcula ninguna: hacerlo
 * crearía una segunda fuente de verdad que se desviaría el día que cambie una
 * regla de negocio. Lo que se fija aquí es cómo se PRESENTAN, y sobre todo dos
 * cosas que son fáciles de romper sin darse cuenta:
 *
 *   1. Que cada cifra quede asociada a su producto Y a su columna para quien usa
 *      un lector de pantalla. Un número suelto no dice nada.
 *   2. Que cuando `disponible` no es `stock − reservado` se EXPLIQUE. En este
 *      vivero eso es normal —semillero, tamaños insuficientes, entradas
 *      madurando— y un número que no cuadra sin explicación se lee como un
 *      fallo de la aplicación.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

const outletContext = { me: { username: "admin", rol: "admin" } };

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig()),
  useOutletContext: () => outletContext,
}));

vi.mock("../api/api", () => ({
  getProductos: vi.fn(),
  createPedido: vi.fn(),
  updateProductoInterno: vi.fn(),
  createProducto: vi.fn(),
  updateProducto: vi.fn(),
  deleteProducto: vi.fn(),
  importarProductos: vi.fn(),
}));

import * as api from "../api/api";
import Productos from "./Productos";
import { existenciasDe, explicacionDisponible } from "./productos.logic";

const producto = (extra = {}) => ({
  id: 1,
  nombre_cientifico: "Ficus benjamina",
  nombre_natural: "Ficus",
  categoria: "Planta",
  subcategoria: "Arbol",
  stock: 100,
  reservado: 25,
  disponible: 75,
  stock_minimo: 10,
  es_interno: false,
  ...extra,
});

beforeEach(() => {
  outletContext.me = { username: "admin", rol: "admin" };
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.clearAllMocks());

/** La fila de un producto, para poder leer sus celdas por columna. */
async function filaDe(nombreCientifico) {
  const celda = await screen.findByText(nombreCientifico);
  return celda.closest("tr");
}

/** El valor de una columna en una fila, localizado por su encabezado. */
function valorEnColumna(fila, encabezado) {
  const tabla = fila.closest("table");
  const cabeceras = [...tabla.querySelectorAll("thead th")];
  const i = cabeceras.findIndex((th) => th.textContent.trim() === encabezado);
  expect(i, `no existe la columna «${encabezado}»`).toBeGreaterThanOrEqual(0);
  return fila.querySelectorAll("td")[i];
}

/* ══ 1. La aritmética que se enseña ═══════════════════════════════════════ */

describe("las tres cifras", () => {
  it("el caso de manual: 100 en stock, 25 reservadas, 75 disponibles", async () => {
    api.getProductos.mockResolvedValue([producto()]);
    render(<Productos />);
    const fila = await filaDe("Ficus benjamina");

    expect(valorEnColumna(fila, "Stock").textContent).toMatch(/100/);
    expect(valorEnColumna(fila, "Reservado").textContent).toMatch(/25/);
    expect(valorEnColumna(fila, "Disponible").textContent).toMatch(/75/);
  });

  it("sin reservas, disponible es todo el stock", async () => {
    api.getProductos.mockResolvedValue([producto({ reservado: 0, disponible: 100 })]);
    render(<Productos />);
    const fila = await filaDe("Ficus benjamina");
    expect(valorEnColumna(fila, "Reservado").textContent).toMatch(/\b0\b/);
    expect(valorEnColumna(fila, "Disponible").textContent).toMatch(/100/);
  });

  it("la última unidad reservada deja disponible en cero", async () => {
    api.getProductos.mockResolvedValue([producto({ stock: 1, reservado: 1, disponible: 0 })]);
    render(<Productos />);
    const fila = await filaDe("Ficus benjamina");
    expect(valorEnColumna(fila, "Reservado").textContent).toMatch(/\b1\b/);
    expect(valorEnColumna(fila, "Disponible").textContent).toMatch(/\b0\b/);
  });

  it("un producto sin existencias no rompe la fila", async () => {
    api.getProductos.mockResolvedValue([producto({ stock: 0, reservado: 0, disponible: 0 })]);
    render(<Productos />);
    const fila = await filaDe("Ficus benjamina");
    expect(valorEnColumna(fila, "Disponible").textContent).toMatch(/\b0\b/);
  });

  it("DISPONIBLE NUNCA SE ENSEÑA EN NEGATIVO", async () => {
    /*
     * El backend ya recorta a cero por tamaño, pero si alguna vez llegara un
     * negativo, enseñárselo a alguien que gestiona un vivero no ayuda a nadie.
     */
    api.getProductos.mockResolvedValue([producto({ stock: 10, reservado: 25, disponible: -15 })]);
    render(<Productos />);
    const fila = await filaDe("Ficus benjamina");
    expect(valorEnColumna(fila, "Disponible").textContent).not.toMatch(/-\s*\d/);
  });
});

/* ══ 2. Cuando no cuadra, se explica ══════════════════════════════════════ */

describe("cuando disponible no es stock menos reservado", () => {
  it("lo explica con TEXTO, no sólo con un asterisco", async () => {
    /*
     * Adelfa con 60 en semillero: stock 100, reservado 0, disponible 40. Las
     * tres cifras son correctas y aun así la resta no sale. Sin explicación,
     * quien lo lee piensa que la aplicación se ha equivocado.
     */
    api.getProductos.mockResolvedValue([
      producto({ nombre_cientifico: "Nerium oleander", stock: 100, reservado: 0, disponible: 40 }),
    ]);
    render(<Productos />);
    const fila = await filaDe("Nerium oleander");
    const celda = valorEnColumna(fila, "Disponible");

    expect(celda.textContent).toMatch(/40/);
    expect(celda.textContent).toMatch(/no se pueden servir/i);
    expect(celda.textContent).toMatch(/semillero/i);
  });

  it("una fila que cuadra NO lleva explicación: nada de ruido", async () => {
    api.getProductos.mockResolvedValue([producto()]);
    render(<Productos />);
    const fila = await filaDe("Ficus benjamina");
    const celda = valorEnColumna(fila, "Disponible");
    expect(celda.textContent).not.toMatch(/no se pueden servir/i);
    expect(celda.textContent.trim()).toMatch(/^\s*75/);
  });

  it("más reservado que stock se marca como inconsistencia, no se disimula", async () => {
    /*
     * No debería ocurrir: el alta de pedido comprueba `stock − reservado` antes
     * de aceptar. Si aparece, es un dato roto y hay que verlo, no recortarlo a
     * cero en silencio.
     */
    api.getProductos.mockResolvedValue([producto({ stock: 10, reservado: 25, disponible: 0 })]);
    render(<Productos />);
    const fila = await filaDe("Ficus benjamina");
    expect(valorEnColumna(fila, "Disponible").textContent).toMatch(/revisa el inventario/i);
  });
});

/* ══ 3. Semántica para lectores de pantalla ══════════════════════════════ */

describe("las columnas se pueden leer sin ver la tabla", () => {
  it("los encabezados nuevos son th con scope de columna", async () => {
    api.getProductos.mockResolvedValue([producto()]);
    render(<Productos />);
    await filaDe("Ficus benjamina");

    for (const nombre of ["Stock", "Reservado", "Disponible"]) {
      const th = screen.getByRole("columnheader", { name: nombre });
      expect(th.tagName).toBe("TH");
      expect(th).toHaveAttribute("scope", "col");
    }
  });

  it("el orden es Stock → Reservado → Disponible", async () => {
    // Se leen como una resta; en otro orden no se entienden de un vistazo.
    api.getProductos.mockResolvedValue([producto()]);
    render(<Productos />);
    const fila = await filaDe("Ficus benjamina");
    const cabeceras = [...fila.closest("table").querySelectorAll("thead th")].map((th) =>
      th.textContent.trim()
    );
    const i = cabeceras.indexOf("Stock");
    expect(cabeceras[i + 1]).toBe("Reservado");
    expect(cabeceras[i + 2]).toBe("Disponible");
  });

  it("la explicación NO vive sólo en un tooltip", async () => {
    /*
     * `title` no lo anuncian de forma fiable los lectores de pantalla y no
     * existe con el teclado en muchos navegadores. El texto va además en un
     * nodo para lectura, y el asterisco queda oculto para las ayudas técnicas.
     */
    api.getProductos.mockResolvedValue([producto({ stock: 100, reservado: 0, disponible: 40 })]);
    render(<Productos />);
    const fila = await filaDe("Ficus benjamina");
    const celda = valorEnColumna(fila, "Disponible");

    const soloLectura = celda.querySelector(".sr-only");
    expect(soloLectura).not.toBeNull();
    expect(soloLectura.textContent).toMatch(/semillero/i);

    const asterisco = [...celda.querySelectorAll("[aria-hidden='true']")];
    expect(asterisco.length).toBeGreaterThan(0);
  });

  it("cada cifra sigue asociada a su producto", async () => {
    api.getProductos.mockResolvedValue([
      producto({ id: 1, nombre_cientifico: "Ficus benjamina", disponible: 75 }),
      producto({ id: 2, nombre_cientifico: "Dracaena draco", stock: 8, reservado: 0, disponible: 0 }),
    ]);
    render(<Productos />);

    const ficus = await filaDe("Ficus benjamina");
    const drago = await filaDe("Dracaena draco");
    expect(valorEnColumna(ficus, "Disponible").textContent).toMatch(/75/);
    expect(valorEnColumna(drago, "Disponible").textContent).toMatch(/\b0\b/);
    expect(within(drago).queryByText(/75/)).toBeNull();
  });
});

/* ══ 4. La lógica, en frío ═══════════════════════════════════════════════ */

describe("existenciasDe", () => {
  it("no recalcula: usa lo que manda el backend", () => {
    // Si esto empezara a calcular `stock - reservado`, la tabla dejaría de
    // reflejar las reglas del vivero y diría que se puede pedir lo que no.
    const ex = existenciasDe({ stock: 100, reservado: 0, disponible: 40 });
    expect(ex.disponible).toBe(40);
    expect(ex.cuadra).toBe(false);
    expect(ex.noServible).toBe(60);
  });

  it("tolera decimales sin inventar desajustes", () => {
    // Numeric(12,3): comparar flotantes con === marca diferencias que no existen.
    const ex = existenciasDe({ stock: 10.5, reservado: 0.25, disponible: 10.25 });
    expect(ex.cuadra).toBe(true);
    expect(ex.noServible).toBe(0);
  });

  it("sobrevive a datos ausentes o basura", () => {
    for (const p of [{}, null, undefined, { stock: null, reservado: "x", disponible: undefined }]) {
      const ex = existenciasDe(p);
      expect(ex.stock).toBe(0);
      expect(ex.reservado).toBe(0);
      expect(ex.disponible).toBe(0);
    }
  });

  it("detecta reservado mayor que stock", () => {
    expect(existenciasDe({ stock: 10, reservado: 25, disponible: 0 }).inconsistente).toBe(true);
    expect(existenciasDe({ stock: 25, reservado: 25, disponible: 0 }).inconsistente).toBe(false);
  });
});

describe("explicacionDisponible", () => {
  it("calla cuando no hay nada que explicar", () => {
    expect(explicacionDisponible(existenciasDe({ stock: 100, reservado: 25, disponible: 75 }))).toBeNull();
  });

  it("la inconsistencia manda sobre el resto", () => {
    const ex = existenciasDe({ stock: 10, reservado: 25, disponible: 0 });
    expect(explicacionDisponible(ex)).toMatch(/revisa el inventario/i);
  });

  it("no promete nada sobre cuándo estará disponible", () => {
    // No hay dato de cuándo madura un lote a nivel de producto: decirlo sería
    // inventárselo.
    const texto = explicacionDisponible(existenciasDe({ stock: 100, reservado: 0, disponible: 40 }));
    expect(texto).not.toMatch(/en \d+ (día|semana|mes)/i);
    expect(texto).not.toMatch(/estará disponible el/i);
  });
});

/* ══ 5. La tabla se desplaza a lo ancho, y se puede usar sin ratón ═══════ */

describe("la tabla desplazable en móvil", () => {
  /*
   * DECISIÓN DE PRODUCTO: en móvil no se ocultan Reservado ni Disponible. Diez
   * columnas no caben en 320 px, así que la tabla se desplaza en horizontal —
   * deliberadamente.
   *
   * Eso obliga a algo que se olvida casi siempre: un `overflow-x: auto` a secas
   * es una trampa. El contenido está, se ve arrastrando con el dedo, y es
   * INALCANZABLE con teclado, porque entre una columna y la siguiente no hay
   * nada que reciba el foco y las flechas nunca llegan a desplazar el
   * contenedor.
   */
  it("es una región con nombre, no un div mudo", async () => {
    api.getProductos.mockResolvedValue([producto()]);
    render(<Productos />);
    await filaDe("Ficus benjamina");

    const region = screen.getByRole("region", { name: /catálogo de productos/i });
    expect(region).toBeInTheDocument();
    // Y contiene la tabla, no es una región cualquiera de la página.
    expect(region.querySelector("table")).not.toBeNull();
  });

  it("entra en el orden de tabulación para poder desplazarla con el teclado", async () => {
    api.getProductos.mockResolvedValue([producto()]);
    render(<Productos />);
    await filaDe("Ficus benjamina");

    const region = screen.getByRole("region", { name: /catálogo de productos/i });
    expect(region).toHaveAttribute("tabindex", "0");
  });

  it("el nombre AVISA de que hay más contenido a los lados", async () => {
    /*
     * Quien escucha la página necesita saber que la tabla se desplaza; si no,
     * se queda con las cuatro primeras columnas creyendo que son todas.
     */
    api.getProductos.mockResolvedValue([producto()]);
    render(<Productos />);
    await filaDe("Ficus benjamina");

    const region = screen.getByRole("region", { name: /catálogo de productos/i });
    expect(region.getAttribute("aria-label")).toMatch(/desplazable|horizontal/i);
  });

  it("y las columnas siguen ahí: no se ocultan en ningún ancho", async () => {
    // El equipo usa el móvil en el vivero. Esconder Disponible es esconder
    // justo el número por el que se mira la pantalla.
    api.getProductos.mockResolvedValue([producto()]);
    render(<Productos />);
    await filaDe("Ficus benjamina");

    for (const nombre of ["Stock", "Reservado", "Disponible"]) {
      const th = screen.getByRole("columnheader", { name: nombre });
      expect(th.className).not.toMatch(/hidden|sm:table-cell|md:table-cell/);
    }
  });
});
