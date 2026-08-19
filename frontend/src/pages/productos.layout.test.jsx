/**
 * REGRESIÓN DE MAQUETACIÓN — Productos.
 *
 * Defecto reportado: «los botones de acción se solapan». Verificado en
 * navegador a 320/375/768/1024/1440 y reducido a DOS causas concretas dentro
 * del modal «Gestionar productos»:
 *
 *   1. CABECERA DUPLICADA. El modal pintaba su propia cabecera (título,
 *      bajada y un botón «Cerrar») DENTRO de un `DialogContent` que ya pinta
 *      las tres cosas. Dos títulos idénticos y dos controles de cierre, y las
 *      cabeceras añadían su propio `padding: 18px 22px` sobre el relleno de
 *      24 px del diálogo: a 375 px el contenido medía 330 px en una caja de
 *      278 px con `overflow: visible` y se salía por los lados.
 *
 *   2. TABLA QUE APLASTA SUS PROPIAS CELDAS. `width: 100%` +
 *      `table-layout: fixed` con anchos en porcentaje impide que la tabla
 *      supere nunca a su contenedor, así que el `overflow-x: auto` del
 *      envoltorio no llegaba a activarse. Las columnas se comprimían a
 *      16-24 px y los botones «Editar»/«Eliminar», con ancho mínimo
 *      intrínseco mayor, se salían de su celda y se pintaban ENCIMA de la
 *      contigua.
 *
 * jsdom no tiene motor de maquetación: `getBoundingClientRect` devuelve ceros,
 * así que aquí NO se puede medir un solape. Lo que sí se puede fijar —y es lo
 * que evita la reaparición— son las dos causas estructurales.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const FUENTE_BRUTA = readFileSync(resolve(process.cwd(), "src/pages/Productos.jsx"), "utf8");

/*
 * Se quitan los comentarios antes de buscar: si no, la propia explicación de
 * por qué se eliminó `tabBtnS` haría fallar la comprobación de que ya no
 * existe. El guardarraíl mira el CÓDIGO, no la prosa.
 */
const FUENTE = FUENTE_BRUTA.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

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
];

beforeEach(() => {
  outletContext.me = { username: "admin", rol: "admin" };
  api.getProductos.mockResolvedValue(PRODUCTOS);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const abrirGestion = async (user) => {
  render(<Productos />);
  await screen.findByText("Dracaena draco");
  await user.click(screen.getByRole("button", { name: /gestionar productos/i }));
  return screen.findByRole("dialog");
};

describe("Productos · el modal de gestión no duplica la cabecera", () => {
  it("hay UN solo control de cierre", async () => {
    /*
     * Éste es el fallo original: el «×» de `DialogContent` MÁS un botón
     * «Cerrar» propio. Dos afordancias para lo mismo, y la heredada usaba
     * `--warning-subtle-foreground` (un marrón pensado para TEXTO) como FONDO.
     */
    const dlg = await abrirGestion(userEvent.setup());
    const cierres = within(dlg)
      .getAllByRole("button")
      .filter((b) => /cerrar/i.test(b.textContent || "") || /cerrar/i.test(b.getAttribute("aria-label") || ""));
    expect(cierres).toHaveLength(1);
  });

  it("el título «Gestionar productos» no aparece dos veces dentro del modal", async () => {
    const dlg = await abrirGestion(userEvent.setup());
    expect(within(dlg).getAllByText(/^Gestionar productos$/)).toHaveLength(1);
  });

  it("ya no queda el botón «Cerrar» heredado con fondo marrón", () => {
    // Guardarraíl sobre la fuente: el token de TEXTO no puede volver como FONDO.
    expect(FUENTE).not.toContain('background: "var(--warning-subtle-foreground)"');
  });
});

describe("Productos · las pestañas del modal son un tablist real", () => {
  it("las tres pestañas existen y se pueden envolver", async () => {
    /*
     * Eran tres `<button>` en un flex SIN `flex-wrap`: a 375 px la tercera
     * («Importar CSV/Excel») quedaba cortada por el borde del diálogo y no se
     * podía pulsar. `TabsList` con `flex-wrap` las baja de línea.
     */
    const dlg = await abrirGestion(userEvent.setup());
    const tabs = within(dlg).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "Listado",
      "Nuevo producto",
      "Importar CSV/Excel",
    ]);
    expect(within(dlg).getByRole("tablist").className).toContain("flex-wrap");
  });

  it("la pestaña activa se marca por estado, no por un color claro sobre claro", async () => {
    const dlg = await abrirGestion(userEvent.setup());
    const activa = within(dlg).getAllByRole("tab").find((t) => t.getAttribute("aria-selected") === "true");
    expect(activa).toBeTruthy();
    expect(activa.textContent).toBe("Listado");
    // El helper que pintaba la activa con `--muted` de fondo y
    // `--primary-foreground` de texto (gris claro + casi blanco) ya no existe.
    expect(FUENTE).not.toContain("tabBtnS");
  });

  it("cambiar de pestaña muestra el panel correspondiente", async () => {
    const user = userEvent.setup();
    const dlg = await abrirGestion(user);
    await user.click(within(dlg).getByRole("tab", { name: /importar/i }));
    expect(await within(dlg).findByText(/Formato del archivo/i)).toBeInTheDocument();
  });
});

describe("Productos · la tabla del modal puede desplazarse en vez de aplastarse", () => {
  it("la tabla declara un ancho mínimo dentro de un contenedor con scroll", () => {
    /*
     * Sin `minWidth`, `table-layout: fixed` + porcentajes hacían que la tabla
     * se encogiera hasta el ancho del contenedor y el `overflow-x: auto` fuera
     * decorativo. Con él, el envoltorio desplaza y las celdas conservan su
     * ancho útil, que es lo que impide que los botones se salgan.
     */
    expect(FUENTE).toMatch(/overflowX:\s*"auto"/);
    expect(FUENTE).toMatch(/minWidth:\s*760/);
  });

  it("las acciones de fila usan el Button del sistema, no botones con estilo suelto", async () => {
    const dlg = await abrirGestion(userEvent.setup());
    for (const nombre of [/^editar$/i, /^eliminar$/i]) {
      const b = within(dlg).getAllByRole("button", { name: nombre })[0];
      expect(b, String(nombre)).toBeTruthy();
      // Los botones sueltos no llevaban clases; los del sistema sí.
      expect(b.className.length).toBeGreaterThan(0);
      expect(b.getAttribute("style") || "").toBe("");
    }
  });
});

describe("Productos · la tabla principal tiene relleno real en las celdas", () => {
  /*
   * DEFECTO SEPARADO del solape del modal: «Pedir más» se veía pegado a la
   * fila siguiente.
   *
   * CAUSA RAÍZ: la tabla se maquetaba con los atributos de presentación de
   * HTML4 `border="1" cellPadding="8"`. El reinicio de CSS de Tailwind declara
   * `padding: 0` en todos los elementos, y una regla CSS gana siempre a un
   * atributo de presentación: `cellPadding` quedaba MUERTO.
   *
   * Sin relleno, la altura de la fila la fijaba su control más alto —el botón,
   * 28 px— así que la fila medía 28 px y el hueco vertical entre botones de
   * filas consecutivas era de 0 px. Medido en navegador antes y después:
   *
   *              filaH   botonH   hueco mínimo
   *   antes       28       28          0 px
   *   después     53       28         25 px
   *
   * jsdom no maqueta, así que aquí se fija la CAUSA: que las celdas declaren
   * relleno por CSS y que no vuelvan los atributos de presentación.
   */

  it("no quedan atributos de presentación de HTML4 en la tabla", () => {
    // Son los que el reinicio de CSS anula en silencio.
    expect(FUENTE).not.toMatch(/cellPadding/i);
    expect(FUENTE).not.toMatch(/<table[^>]*\sborder="1"/i);
  });

  it("las celdas declaran relleno por CSS", () => {
    // `[&_td]:p-3` aplica a TODAS las celdas, incluidas las de `ProductoRow`,
    // que es un componente aparte y no podría recibirlo fila a fila.
    expect(FUENTE).toMatch(/\[&_td\]:p-3/);
    expect(FUENTE).toMatch(/\[&_th\]:p-3/);
  });

  it("la separación NO se consigue con recursos prohibidos", () => {
    /*
     * El arreglo tiene que ser estructural. Se comprueba que no se haya
     * colado ninguna de las salidas fáciles en la tabla principal.
     */
    expect(FUENTE).not.toMatch(/position:\s*"absolute"/);
    expect(FUENTE).not.toMatch(/margin\w*:\s*-\d/);
    expect(FUENTE).not.toMatch(/height:\s*\d+,\s*\/\/\s*fila/);
    // Ninguna altura de fila fija.
    expect(FUENTE).not.toMatch(/rowHeight/i);
  });

  it("la tabla principal puede desplazarse en vez de aplastarse", () => {
    expect(FUENTE).toMatch(/minWidth:\s*720/);
  });

  it("las filas siguen renderizándose con su botón dentro", async () => {
    const user = userEvent.setup();
    render(<Productos />);
    await screen.findByText("Dracaena draco");
    const botones = screen.getAllByRole("button", { name: /pedir m[áa]s/i });
    expect(botones.length).toBeGreaterThan(0);
    for (const b of botones) {
      // Cada botón vive DENTRO de una fila, nunca suelto entre filas.
      expect(b.closest("tr")).not.toBeNull();
      expect(b.closest("td")).not.toBeNull();
    }
    void user;
  });

  it("la cabecera de la tabla principal es semántica", async () => {
    render(<Productos />);
    await screen.findByText("Dracaena draco");
    const cabeceras = screen.getAllByRole("columnheader");
    expect(cabeceras.length).toBeGreaterThanOrEqual(5);
    for (const th of cabeceras) expect(th).toHaveAttribute("scope", "col");
  });
});

describe("Productos · los modales de cesta usan el Dialog del sistema", () => {
  /*
   * HALLAZGO DE LA AUDITORÍA FINAL. La Fase 5 migró «Gestionar productos» a
   * `Dialog` pero dejó dos superpuestos hechos a mano: «Pedir más» y la cesta.
   * Eran `div` con `position: fixed`, sin `role="dialog"`, sin trampa de foco,
   * sin cierre con Escape y sin devolver el foco al abrir y cerrar.
   *
   * Un usuario de teclado quedaba tabulando por detrás del modal sin saberlo, y
   * la única salida era encontrar el botón de cerrar. axe no lo detecta: el
   * atrapamiento del foco no se ve en una foto del DOM.
   */

  it("«Pedir más» abre un diálogo de verdad", async () => {
    const user = userEvent.setup();
    render(<Productos />);
    await screen.findByText("Dracaena draco");
    await user.click(screen.getAllByRole("button", { name: /pedir m[áa]s/i })[0]);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("«Pedir más» se cierra con Escape", async () => {
    const user = userEvent.setup();
    render(<Productos />);
    await screen.findByText("Dracaena draco");
    await user.click(screen.getAllByRole("button", { name: /pedir m[áa]s/i })[0]);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("la cesta abre un diálogo de verdad y se cierra con Escape", async () => {
    const user = userEvent.setup();
    render(<Productos />);
    await screen.findByText("Dracaena draco");
    await user.click(screen.getByRole("button", { name: /cesta/i }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("no quedan superpuestos hechos a mano en la pantalla", () => {
    // Guardarraíl sobre la fuente: un `position: fixed` a pantalla completa es
    // la firma de un modal casero.
    expect(FUENTE).not.toMatch(/position:\s*"fixed"/);
  });
});
