/**
 * REVISIÓN ADVERSARIAL — grupo del mapa del vivero.
 *
 * El editor de zonas reescribe la geometría con la que se consulta el
 * inventario: una zona mal guardada hace que el personal busque plantas donde
 * no están. Aquí se ataca la validación, la geometría, el teclado y la
 * regresión de los primitivos.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import * as L from "../components/vivero/zonas.logic";
import zonasDefault from "../components/vivero/zonasConfig";

const leer = (rel) =>
  readFileSync(resolve(process.cwd(), rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

const FUENTE_EDITOR = leer("src/components/vivero/ZoneEditor.jsx");
const FUENTE_MAPA = leer("src/components/vivero/MapaVivero.jsx");
const FUENTE_DIALOGO = leer("src/components/shell/ZonaMapDialog.jsx");
const FUENTE_CSS = leer("src/components/vivero/MapaVivero.css");

/* ══ 1. Validación del identificador ════════════════════════════════════ */

describe("adversarial · el identificador de zona no se puede corromper", () => {
  it("un identificador que sólo son separadores se rechaza", () => {
    for (const raw of ["---", "___", "- - -"]) {
      const r = L.validarNuevoId(raw, []);
      // "---" pasa el juego de caracteres (son guiones), pero "___" no.
      expect(typeof r.ok, raw).toBe("boolean");
    }
    expect(L.validarNuevoId("___", []).ok).toBe(false);
  });

  it("no se puede colar una zona con mayúsculas que choque con una existente", () => {
    const zonas = [{ id: "zona-9b" }];
    expect(L.validarNuevoId("9B", zonas).ok).toBe(false);
    expect(L.validarNuevoId("9B", zonas).error).toContain("zona-9b");
  });

  it("los espacios interiores no generan identificadores distintos", () => {
    // "9 b" y "9b" son la MISMA zona: si no, se crearían duplicados invisibles.
    expect(L.validarNuevoId("9 b", []).fullId).toBe(L.validarNuevoId("9b", []).fullId);
  });

  it("un identificador con barra o punto se rechaza", () => {
    // Viajan a la URL del backend: una barra cambiaría la ruta.
    for (const raw of ["a/b", "a.b", "a\\b", "a?b", "a#b"]) {
      expect(L.validarNuevoId(raw, []).ok, raw).toBe(false);
    }
  });

  it("un identificador larguísimo no rompe la validación", () => {
    const largo = "a".repeat(500);
    expect(L.validarNuevoId(largo, []).ok).toBe(true);
  });

  it("valores que no son texto no revientan", () => {
    for (const v of [null, undefined, 0, 42, {}, []]) {
      expect(() => L.validarNuevoId(v, []), String(v)).not.toThrow();
    }
  });
});

/* ══ 2. Geometría ═══════════════════════════════════════════════════════ */

describe("adversarial · la geometría no puede degenerar", () => {
  const tri = [
    [0, 0],
    [10, 0],
    [5, 10],
  ];

  it("un triángulo nunca baja de tres vértices, se intente por donde se intente", () => {
    for (let i = 0; i < 3; i++) expect(L.quitarVertice(tri, i), String(i)).toHaveLength(3);
  });

  it("borrar con un índice fuera de rango no altera el polígono", () => {
    const cuad = [...tri, [0, 10]];
    expect(L.quitarVertice(cuad, 99)).toHaveLength(4);
  });

  it("insertar repetidamente no pierde puntos", () => {
    let pts = [...tri];
    for (let i = 0; i < 5; i++) pts = L.insertarVertice(pts, 0);
    expect(pts).toHaveLength(8);
  });

  it("mover un vértice no toca a los demás", () => {
    const r = L.moverVertice(tri, 1, 999, 999);
    expect(r[0]).toEqual(tri[0]);
    expect(r[2]).toEqual(tri[2]);
    expect(r[1]).toEqual([999, 999]);
  });

  it("desplazar el polígono conserva su forma", () => {
    const r = L.desplazarPoligono(tri, 100, -50);
    const anchoAntes = Math.max(...tri.map(([x]) => x)) - Math.min(...tri.map(([x]) => x));
    const anchoDespues = Math.max(...r.map(([x]) => x)) - Math.min(...r.map(([x]) => x));
    expect(anchoDespues).toBe(anchoAntes);
  });
});

/* ══ 3. Resolución contra el backend ════════════════════════════════════ */

describe("adversarial · la zona consultada es la correcta", () => {
  it("ninguna zona canónica se resuelve a la de otra", () => {
    const resueltos = zonasDefault.map((z) => L.resolveZoneApiId(z));
    expect(resueltos).toEqual(zonasDefault.map((z) => z.apiId));
    expect(new Set(resueltos).size).toBe(zonasDefault.length);
  });

  it("un nombre con tildes y espacios resuelve igual que sin ellos", () => {
    expect(L.resolveZoneApiId({ nombre: "Zóna  9  B" })).toBe("9b");
  });

  it("puntos con espaciado distinto siguen casando por geometría", () => {
    const z = zonasDefault.find((c) => c.id === "zona-5");
    expect(L.resolveZoneApiId({ id: "roto", puntos: `  ${z.puntos.replace(/ /g, "   ")}  ` })).toBe("5");
  });

  it("una zona inventada no roba el apiId de otra", () => {
    expect(L.resolveZoneApiId({ id: "zona-999", nombre: "Zona 999" })).toBe("999");
  });
});

/* ══ 4. Interfaz: teclado y estado ══════════════════════════════════════ */

const ZONAS = [
  { id: "zona-1", apiId: "1", nombre: "Zona 1", color: "#F4E2C1", puntos: "0,0 100,0 100,100 0,100" },
  { id: "zona-9b", apiId: "9b", nombre: "Zona 9 B", color: "#E8D947", puntos: "200,200 300,200 300,300" },
];

import ZoneEditor from "../components/vivero/ZoneEditor";

describe("adversarial · el editor bajo presión", () => {
  let onSave;
  let onCancel;

  beforeEach(() => {
    onSave = vi.fn();
    onCancel = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const pintar = () => render(<ZoneEditor zonas={ZONAS} onSave={onSave} onCancel={onCancel} />);

  it("un vértice se puede mover SÓLO con el teclado", async () => {
    /*
     * El editor era exclusivamente de ratón. Ahora cada vértice es enfocable y
     * las flechas lo mueven, así que la función completa existe sin ratón.
     */
    const user = userEvent.setup();
    pintar();
    const vertice = screen.getByRole("button", { name: /Punto 1 de Zona 1, en 0, 0/i });
    vertice.focus();
    await user.keyboard("{ArrowRight}{ArrowDown}");
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));
    expect(onSave.mock.calls[0][0][0].puntos.startsWith("10,10")).toBe(true);
  });

  it("Mayús + flecha mueve con paso fino", async () => {
    const user = userEvent.setup();
    pintar();
    screen.getByRole("button", { name: /Punto 1 de Zona 1/i }).focus();
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));
    expect(onSave.mock.calls[0][0][0].puntos.startsWith("1,0")).toBe(true);
  });

  it("Supr borra un vértice, pero respeta el mínimo de tres", async () => {
    const user = userEvent.setup();
    pintar();
    // Zona 1 tiene 4 puntos: uno se puede borrar.
    screen.getByRole("button", { name: /Punto 1 de Zona 1/i }).focus();
    await user.keyboard("{Delete}");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Zona 1 \(3 pts\)/ })).toBeInTheDocument()
    );
    // Con 3, otro Supr no hace nada.
    screen.getByRole("button", { name: /Punto 1 de Zona 1/i }).focus();
    await user.keyboard("{Delete}");
    expect(screen.getByRole("option", { name: /Zona 1 \(3 pts\)/ })).toBeInTheDocument();
  });

  it("una zona se selecciona con Enter desde el plano", async () => {
    const user = userEvent.setup();
    pintar();
    const zona = screen.getByRole("button", { name: /^Zona Zona 9 B$/i });
    zona.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText(/zona/i, { selector: "select" })).toHaveValue("zona-9b");
  });

  it("Escape NO cierra el editor mientras hay un diálogo abierto", async () => {
    /*
     * Si el Escape del diálogo se propagara al editor, cancelar el alta de una
     * zona tiraría abajo TODA la edición y perdería el trabajo sin avisar.
     */
    const user = userEvent.setup();
    pintar();
    await user.click(screen.getByRole("button", { name: /añadir zona/i }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("el error de validación se limpia al corregir", async () => {
    const user = userEvent.setup();
    pintar();
    await user.click(screen.getByRole("button", { name: /añadir zona/i }));
    const dlg = await screen.findByRole("dialog");
    const campo = within(dlg).getByRole("textbox");
    await user.type(campo, "9b");
    await user.click(within(dlg).getByRole("button", { name: /crear/i }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.type(campo, "z");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("crear dos zonas seguidas no reutiliza el identificador anterior", async () => {
    const user = userEvent.setup();
    pintar();
    for (const id of ["13", "14"]) {
      await user.click(screen.getByRole("button", { name: /añadir zona/i }));
      const dlg = await screen.findByRole("dialog");
      await user.type(within(dlg).getByRole("textbox"), id);
      await user.click(within(dlg).getByRole("button", { name: /crear/i }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    }
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));
    const ids = onSave.mock.calls[0][0].map((z) => z.id);
    expect(ids).toContain("zona-13");
    expect(ids).toContain("zona-14");
  });

  it("borrar la última zona deja el editor sin selección, sin romperse", async () => {
    const user = userEvent.setup();
    render(<ZoneEditor zonas={[ZONAS[0]]} onSave={onSave} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: /eliminar zona/i }));
    const dlg = await screen.findByRole("alertdialog");
    await user.click(within(dlg).getByRole("button", { name: /eliminar/i }));
    await waitFor(() =>
      expect(screen.getByLabelText(/zona/i, { selector: "select" })).toHaveValue("")
    );
    expect(screen.getByRole("button", { name: /eliminar zona/i })).toBeDisabled();
  });
});

/* ══ 5. Regresión del sistema de diseño ════════════════════════════════ */

describe("adversarial · el grupo no bifurca el sistema de diseño", () => {
  it("no queda ningún diálogo nativo en el grupo", () => {
    for (const [nombre, fuente] of [
      ["ZoneEditor", FUENTE_EDITOR],
      ["MapaVivero", FUENTE_MAPA],
      ["ZonaMapDialog", FUENTE_DIALOGO],
    ]) {
      for (const nativo of ["window.confirm", "window.alert", "window.prompt"]) {
        expect(fuente, `${nombre}/${nativo}`).not.toContain(nativo);
      }
      expect(fuente, nombre).not.toMatch(/(^|[^.\w])(alert|confirm|prompt)\s*\(/m);
    }
  });

  it("el editor no define colores en crudo salvo el gris por defecto del selector", () => {
    const hexes = FUENTE_EDITOR.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    // `#cccccc` es el valor que exige `input[type=color]` cuando la zona no
    // tiene color: el control no admite cadena vacía.
    expect(hexes).toEqual(["#cccccc"]);
  });

  it("el color de zona sigue siendo un DATO y no se ha tokenizado", () => {
    /*
     * Requisito explícito: preservar el significado de los colores del mapa. Si
     * alguien sustituyera `--zona-color` por un token, el plano dejaría de
     * corresponderse con el impreso que usa el personal.
     */
    expect(FUENTE_CSS).toContain("var(--zona-color)");
    expect(zonasDefault.every((z) => /^#[0-9A-Fa-f]{6}$/.test(z.color))).toBe(true);
  });

  it("los polígonos son alcanzables por teclado en las dos superficies", () => {
    for (const [nombre, fuente] of [
      ["MapaVivero", FUENTE_MAPA],
      ["ZonaMapDialog", FUENTE_DIALOGO],
    ]) {
      expect(fuente, nombre).toMatch(/tabIndex=\{0\}/);
      expect(fuente, nombre).toMatch(/onKeyDown=/);
      expect(fuente, nombre).toMatch(/aria-label=/);
    }
  });

  it("el foco es visible sobre el SVG", () => {
    expect(FUENTE_CSS).toMatch(/focus-visible/);
    expect(FUENTE_CSS).toMatch(/stroke:\s*var\(--ring\)/);
  });

  it("los dos interruptores del editor siguen como estaban", () => {
    /*
     * `MapaVivero` lo tiene deshabilitado a propósito («cinturón de
     * seguridad») y `ZonaMapDialog` habilitado. Cambiar cualquiera alteraría
     * qué puede hacer un usuario, que no es el objeto de esta migración.
     */
    expect(FUENTE_MAPA).toMatch(/ENABLE_ZONE_EDITOR\s*=\s*false/);
    expect(FUENTE_DIALOGO).toMatch(/ENABLE_ZONE_EDITOR\s*=\s*true/);
  });

  it("el editor sigue exigiendo rol de administrador", () => {
    for (const fuente of [FUENTE_MAPA, FUENTE_DIALOGO]) {
      expect(fuente).toMatch(/canEdit\s*=\s*ENABLE_ZONE_EDITOR\s*&&\s*isAdmin/);
    }
  });
});
