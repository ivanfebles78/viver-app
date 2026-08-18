/**
 * REVISIÓN ADVERSARIAL — Plataforma.
 *
 * Es el panel del dueño del SaaS: da de alta ayuntamientos, decide lo que paga
 * cada uno y puede volcar una copia de seguridad sobre sus datos. Aquí se ataca
 * el dinero, la importación destructiva y el flujo de confirmación.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import * as L from "../pages/plataforma.logic";

const FUENTE = readFileSync(resolve(process.cwd(), "src/pages/Plataforma.jsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

/* ══ 1. La cuota es dinero ══════════════════════════════════════════════ */

describe("adversarial · la cuota no se puede corromper", () => {
  it("un valor absurdo NO produce un número que llegue al backend", () => {
    for (const v of ["abc", "--5", "1,2,3", "e", "+-1", "NaN"]) {
      expect(L.parsearCuota(v).valida, v).toBe(false);
    }
  });

  it("«Infinity» se rechaza: no es una cuota facturable", () => {
    // `Number("Infinity")` es finito para `isNaN` pero no para facturar.
    const r = L.parsearCuota("Infinity");
    expect(Number.isFinite(r.num)).toBe(false);
  });

  it("un negativo con espacios tampoco cuela", () => {
    expect(L.parsearCuota("  -0.01  ").valida).toBe(false);
  });

  it("la notación exponencial se interpreta como número, no como texto", () => {
    // Es el comportamiento de main; se fija para que no cambie por accidente.
    expect(L.parsearCuota("1e3").num).toBe(1000);
  });

  it("el vacío y el cero NO son intercambiables", () => {
    /*
     * `null` = «cuota por defecto de la plataforma»; `0` = «este ayuntamiento
     * no paga». Confundirlos cambia la facturación en silencio.
     */
    expect(L.parsearCuota("").num).toBeNull();
    expect(L.parsearCuota("0").num).toBe(0);
    expect(L.parsearCuota("").num).not.toBe(L.parsearCuota("0").num);
  });

  it("`set_cuota` viaja siempre, incluso al limpiar", () => {
    // Sin él, el backend no distingue «no lo toques» de «ponlo por defecto».
    expect(L.construirPayloadCuota(null).set_cuota).toBe(true);
  });
});

/* ══ 2. El slug ═════════════════════════════════════════════════════════ */

describe("adversarial · el slug", () => {
  it("un nombre solo con símbolos produce un slug vacío, no basura", () => {
    expect(L.slugify("### !!! ---")).toBe("");
  });

  it("no deja guiones sueltos en los extremos", () => {
    for (const n of ["-Arico-", "  Arico  ", "(Arico)", "¡Arico!"]) {
      const s = L.slugify(n);
      expect(s.startsWith("-"), n).toBe(false);
      expect(s.endsWith("-"), n).toBe(false);
    }
  });

  it("los diacríticos se pierden pero la letra se conserva", () => {
    expect(L.slugify("Güímar")).toBe("guimar");
    expect(L.slugify("San Cristóbal")).toBe("san-cristobal");
  });

  it("un valor nulo no rompe", () => {
    for (const v of [null, undefined, 0, {}]) {
      expect(() => L.slugify(v), String(v)).not.toThrow();
    }
  });
});

/* ══ 3. Interfaz: importación y confirmación ════════════════════════════ */

vi.mock("../api/api", () => ({
  getSuperadminStats: vi.fn(),
  enrollAyuntamiento: vi.fn(),
  setActiveClienteId: vi.fn(),
  updateCliente: vi.fn(),
  importClienteData: vi.fn(),
}));

import * as api from "../api/api";
import Plataforma from "../pages/Plataforma";

const STATS = {
  resumen: { ayuntamientos_total: 2, ayuntamientos_activos: 1, usuarios_total: 35, productos_total: 120, pedidos_total: 40, movimientos_total: 900 },
  facturacion: { ingreso_mensual_estimado: 398, ingreso_anual_estimado: 4776, ayuntamientos_facturables: 2, cuota_mensual_por_defecto: 199 },
  evolucion_altas: [{ mes: "2026-01", acumulado: 1 }],
  por_cliente: [
    { id: 1, nombre: "Ayuntamiento de Santa Cruz de Tenerife", slug: "santa-cruz", activo: true, usuarios: 24, productos: 100, pedidos: 30, movimientos: 700, cuota_mensual: 199, cuota_personalizada: false },
    { id: 2, nombre: "Ayuntamiento de La Laguna", slug: "la-laguna", activo: false, usuarios: 11, productos: 20, pedidos: 10, movimientos: 200, cuota_mensual: 150, cuota_personalizada: true },
  ],
};

const copia = () => new File(["{}"], "copia.json", { type: "application/json" });

describe("adversarial · la importación bajo presión", () => {
  beforeEach(() => {
    api.getSuperadminStats.mockResolvedValue(STATS);
    api.importClienteData.mockResolvedValue({ importado: { productos: 12 } });
    api.updateCliente.mockResolvedValue({});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const filaDe = async (nombre) => (await screen.findByText(nombre)).closest("tr");

  it("Escape en la confirmación NO importa", async () => {
    const user = userEvent.setup();
    render(<Plataforma />);
    const fila = await filaDe("Ayuntamiento de La Laguna");
    await user.upload(within(fila).getByLabelText(/importar/i), copia());
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.importClienteData).not.toHaveBeenCalled();
  });

  it("importar en un ayuntamiento NO afecta al otro", async () => {
    const user = userEvent.setup();
    render(<Plataforma />);
    const fila = await filaDe("Ayuntamiento de Santa Cruz de Tenerife");
    await user.upload(within(fila).getByLabelText(/importar/i), copia());
    const dlg = await screen.findByRole("alertdialog");
    expect(dlg.textContent).toMatch(/Santa Cruz/);
    expect(dlg.textContent).not.toMatch(/La Laguna/);
    await user.click(within(dlg).getByRole("button", { name: /importar/i }));
    await waitFor(() => expect(api.importClienteData).toHaveBeenCalledWith(1, expect.any(File)));
  });

  it("la confirmación avisa de que la operación no se deshace", async () => {
    const user = userEvent.setup();
    render(<Plataforma />);
    const fila = await filaDe("Ayuntamiento de La Laguna");
    await user.upload(within(fila).getByLabelText(/importar/i), copia());
    const dlg = await screen.findByRole("alertdialog");
    expect(dlg.textContent).toMatch(/no se puede deshacer/i);
  });

  it("un cero como cuota se guarda: «gratis» es una decisión legítima", async () => {
    const user = userEvent.setup();
    render(<Plataforma />);
    const fila = await filaDe("Ayuntamiento de La Laguna");
    await user.click(within(fila).getByRole("button", { name: /cuota/i }));
    const campo = within(fila).getByRole("spinbutton");
    await user.clear(campo);
    await user.type(campo, "0");
    await user.click(within(fila).getByRole("button", { name: /guardar/i }));
    await waitFor(() => expect(api.updateCliente).toHaveBeenCalledWith(2, { set_cuota: true, cuota_mensual: 0 }));
  });

  it("un fallo del backend al guardar la cuota se comunica", async () => {
    api.updateCliente.mockRejectedValue({ response: { data: { detail: "cuota bloqueada" } } });
    const user = userEvent.setup();
    render(<Plataforma />);
    const fila = await filaDe("Ayuntamiento de La Laguna");
    await user.click(within(fila).getByRole("button", { name: /cuota/i }));
    await user.click(within(fila).getByRole("button", { name: /guardar/i }));
    expect(await screen.findByText(/cuota bloqueada/)).toBeInTheDocument();
  });

  it("un listado vacío de ayuntamientos no rompe la pantalla", async () => {
    api.getSuperadminStats.mockResolvedValue({ ...STATS, por_cliente: [] });
    render(<Plataforma />);
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("estadísticas incompletas no rompen los KPIs", async () => {
    api.getSuperadminStats.mockResolvedValue({ por_cliente: [], evolucion_altas: [] });
    render(<Plataforma />);
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    // Sin resumen, los KPIs muestran 0 en vez de «undefined».
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
  });

  it("un nombre de ayuntamiento larguísimo no desborda la celda", async () => {
    const largo = "Ayuntamiento Mancomunado de la Comarca Nordeste de la Isla de Tenerife y Zonas Limítrofes";
    api.getSuperadminStats.mockResolvedValue({
      ...STATS,
      por_cliente: [{ ...STATS.por_cliente[0], nombre: largo }],
    });
    render(<Plataforma />);
    const celda = (await screen.findByText(largo)).closest("td");
    // La celda rompe por palabra en vez de estirar la tabla sin fin.
    expect(celda.className).toMatch(/break-words|overflow-wrap/);
  });
});

/* ══ 4. Regresión de primitivos y de la fase ════════════════════════════ */

describe("adversarial · Plataforma no bifurca el sistema de diseño", () => {
  it("no quedan diálogos nativos, ni con `window.` ni sueltos", () => {
    for (const nativo of ["window.confirm", "window.alert", "window.prompt"]) {
      expect(FUENTE, nativo).not.toContain(nativo);
    }
    expect(FUENTE).not.toMatch(/(^|[^.\w])(alert|confirm|prompt)\s*\(/m);
  });

  it("no quedan colores en crudo ni degradados", () => {
    expect(FUENTE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(FUENTE).not.toMatch(/rgba?\(/);
    expect(FUENTE).not.toMatch(/linear-gradient/);
  });

  it("la confirmación se ESPERA antes de tocar el backend", () => {
    expect(FUENTE).toMatch(/const ok = await confirmar\(/);
    expect(FUENTE).toMatch(/if \(!ok\) return;/);
  });

  it("el fichero se captura ANTES de vaciar el input", () => {
    /*
     * Si se invirtiera el orden, tras el `await` el input ya estaría vacío y se
     * importaría `undefined`. Es el fallo clásico al pasar de un confirm
     * síncrono a uno asíncrono.
     */
    const i = FUENTE.indexOf("const f = e.target.files?.[0];");
    const j = FUENTE.indexOf('e.target.value = "";');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(-1);
    expect(i).toBeLessThan(j);
  });

  it("la tabla puede desplazarse y tiene celdas con relleno", () => {
    expect(FUENTE).toMatch(/overflow-x-auto/);
    expect(FUENTE).toMatch(/\[&_td\]:p-3/);
    expect(FUENTE).toMatch(/minWidth:/);
  });
});
