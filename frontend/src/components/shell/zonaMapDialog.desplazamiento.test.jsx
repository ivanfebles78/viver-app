/**
 * EL INVENTARIO DE UNA ZONA TIENE QUE PODER DESPLAZARSE.
 *
 * Con una zona grande, sólo se llegaba a los productos que cabían en la
 * pantalla. El resto quedaba recortado y sin forma de alcanzarlo — incluido el
 * botón «Mostrar más», que era precisamente la manera de traer los que
 * faltaban.
 *
 * La causa no estaba en el panel sino en su padre. La rejilla tenía
 * `max-h-[75dvh]` y `lg:overflow-hidden`, pero su FILA se dimensionaba por el
 * contenido: las columnas se estiraban hasta esa altura, y el
 * `overflow-y: auto` del panel no llegaba a activarse nunca porque su altura ya
 * era la de su contenido. Medido en navegador con 60 productos: el panel medía
 * 1572px dentro de una caja de 600px, y el botón «Mostrar más» caía a 1649px,
 * fuera de una ventana de 800.
 *
 * jsdom no calcula disposición, así que aquí NO se mide geometría: eso se
 * verificó en navegador a 320, 375, 768, 1024 y 1440. Lo que se fija aquí es la
 * ESTRUCTURA que hace posible el desplazamiento, que es lo que un cambio futuro
 * puede romper sin darse cuenta:
 *
 *   · la lista es su propia caja desplazable, y puede encogerse;
 *   · la fila de la rejilla puede encogerse por debajo de su contenido;
 *   · la cabecera y las acciones NO viajan dentro de la lista;
 *   · nadie tapa el defecto con `overflow: hidden`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("../../api/api", () => ({
  getZonaItems: vi.fn(),
  getZonasConfig: vi.fn(),
  marcarZonaInterna: vi.fn(),
  updateZonasConfig: vi.fn(),
  fetchMapaImagenUrl: vi.fn(),
  uploadMapaImagen: vi.fn(),
}));

import * as api from "../../api/api";
import ZonaMapDialog from "./ZonaMapDialog";

/** Sesenta productos: la zona grande que destapó el defecto. */
const MUCHISIMOS = Array.from({ length: 60 }, (_, i) => ({
  producto_id: 200 + i,
  nombre_cientifico: `Especie numero ${i + 1}`,
  nombre_natural: `Nombre comun del producto ${i + 1}`,
  categoria: "Arbol",
  cantidad: (i + 1) * 3,
  tamanos: [{ tamano: "C15", cantidad: i + 1 }],
}));

beforeEach(() => {
  api.getZonaItems.mockResolvedValue({ items: MUCHISIMOS, todos_internos: false });
  api.getZonasConfig.mockResolvedValue([]);
  api.fetchMapaImagenUrl.mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

const pintar = () => render(<ZonaMapDialog open onClose={vi.fn()} isAdmin />);

async function abrirZonaConMuchos(user) {
  pintar();
  const zonas = await screen.findAllByRole("button", { name: /consultar inventario/i });
  await user.click(zonas[0]);
  await screen.findByText(/Especie numero 1$/);
}

/* ══ 1. La lista es su propia caja desplazable ══════════════════════════ */

describe("el inventario se desplaza por su cuenta", () => {
  it("la lista de productos es desplazable y puede encogerse", async () => {
    const user = userEvent.setup();
    await abrirZonaConMuchos(user);

    const lista = screen.getByRole("list");
    const clases = lista.className;

    // `overflow-y-auto` sin `min-h-0` no sirve de nada: el mínimo automático de
    // un elemento flexible es el tamaño de su contenido, así que la caja nunca
    // baja de ahí y no hay nada que desplazar. Los tres van juntos o no van.
    expect(clases, "la lista debe poder desplazarse").toMatch(/overflow-y-auto/);
    expect(clases, "la lista debe poder encogerse (min-h-0)").toMatch(/min-h-0/);
    expect(clases, "la lista debe repartirse el alto disponible (flex-1)").toMatch(/flex-1/);
  });

  it("la lista NO se oculta con overflow hidden", async () => {
    const user = userEvent.setup();
    await abrirZonaConMuchos(user);

    // Recortar es lo que hacía el defecto. Es la diferencia entre «no cabe,
    // despláza­te» y «no cabe, olvídalo».
    expect(screen.getByRole("list").className).not.toMatch(/overflow-hidden/);
  });

  it("todos los productos de la página están en el DOM, no recortados", async () => {
    const user = userEvent.setup();
    await abrirZonaConMuchos(user);

    // La paginación es de ocho en ocho: los ocho tienen que estar presentes.
    const lista = screen.getByRole("list");
    expect(lista.children.length).toBe(8);
    expect(screen.getByText(/Especie numero 8$/)).toBeInTheDocument();
  });
});

/* ══ 2. Cabecera y acciones quedan fuera del desplazamiento ═════════════ */

describe("cabecera y acciones no viajan con la lista", () => {
  it("el nombre de la zona no está dentro de la lista desplazable", async () => {
    const user = userEvent.setup();
    await abrirZonaConMuchos(user);

    const lista = screen.getByRole("list");
    const titulo = screen.getByRole("heading", { level: 3 });

    // Si el título viajara dentro, con sesenta productos habría que recorrer
    // todo el inventario para volver a leer de qué zona es.
    expect(lista.contains(titulo)).toBe(false);
  });

  it("«Mostrar más» no está dentro de la lista desplazable", async () => {
    const user = userEvent.setup();
    await abrirZonaConMuchos(user);

    const lista = screen.getByRole("list");
    const mas = await screen.findByRole("button", { name: /Mostrar más/i });

    // Es la forma de traer el resto del inventario: tenerla al final de un
    // desplazamiento largo era justo lo contrario de lo útil.
    expect(lista.contains(mas)).toBe(false);
  });

  it("«Mostrar más» sigue trayendo la página siguiente", async () => {
    const user = userEvent.setup();
    await abrirZonaConMuchos(user);

    await user.click(await screen.findByRole("button", { name: /Mostrar más/i }));
    await waitFor(() => expect(screen.getByRole("list").children.length).toBe(16));
  });
});

/* ══ 3. El contenedor deja encoger a sus hijos ══════════════════════════ */

/*
 * SIN COMENTARIOS. La primera versión leía el fichero tal cual, y no servía: el
 * propio comentario que explica por qué hace falta `minmax(0,1fr)` contiene esa
 * cadena, así que quitar la clase de verdad dejaba la prueba en verde. Se
 * descubrió al mutar el código a propósito, que es exactamente para lo que está.
 */
const FUENTE = readFileSync(resolve(process.cwd(), "src/components/shell/ZonaMapDialog.jsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

describe("la rejilla deja que sus columnas se encojan", () => {
  it("la fila se declara con minmax(0, …) en dos columnas", () => {
    /*
     * `1fr` a secas tiene un mínimo automático de `auto`, es decir el tamaño del
     * contenido: la fila no bajaría de los 1572px del inventario y volveríamos
     * al recorte. `minmax(0, 1fr)` es lo que le permite encoger.
     *
     * Se comprueba sobre el código porque jsdom no resuelve rejillas; la
     * medición real está en el informe de la corrección.
     */
    expect(FUENTE).toMatch(/lg:grid-rows-\[minmax\(0,1fr\)\]/);
  });

  it("el diálogo se acota contra la ventana, no contra un alto fijo", () => {
    // `dvh` y no `px`: un alto fijo acierta en un portátil y falla en todo lo
    // demás, que es el arreglo que había que evitar.
    expect(FUENTE).toMatch(/max-h-\[75dvh\]/);
    expect(FUENTE).not.toMatch(/max-h-\[\d+px\]/);
  });

  it("el panel de inventario puede encogerse dentro de la rejilla", () => {
    expect(FUENTE).toMatch(/flex min-h-0 flex-col p-4/);
  });
});
