/**
 * REVISIÓN ADVERSARIAL DE LA FASE 2.
 *
 * Estas pruebas no recorren el camino feliz: intentan ROMPER lo que la fase
 * promete. Cada bloque ataca una garantía concreta y exige que el sistema
 * resista, o que el guardarraíl correspondiente lo detecte.
 *
 * Donde hay un guardarraíl, se le aplican mutaciones: un guardarraíl que nunca
 * ha fallado no ha demostrado nada.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { Field, Input, StatusBadge, STATUS_TONES, StatusTone } from "../ui";
import { estadoPedido, estadoUsuario, VOCABULARIOS } from "../app/estado";

const RAIZ = resolve(process.cwd(), "src");

function ficherosApp(dir = RAIZ, acc = []) {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) { ficherosApp(full, acc); continue; }
    if (!/\.(jsx?|css)$/.test(e)) continue;
    const rel = relative(RAIZ, full).replace(/\\/g, "/");
    if (rel.startsWith("ui/") || rel.startsWith("styles/") || /\.(test|spec)\./.test(rel)) continue;
    acc.push({ path: rel, source: readFileSync(full, "utf8") });
  }
  return acc;
}
const APP = ficherosApp();

/* ══ 1. Guardarraíl de tokens — mutación por cada regla ══════════════════ */

describe("ataque al guardarraíl de tokens", () => {
  const objetivo = join(RAIZ, "pages/Lotetracking.jsx");

  /**
   * Inyecta una mutación, ejecuta el guardarraíl y restaura siempre.
   *
   * Comprueba ANTES que el ancla existe de verdad. Sin esa comprobación, si
   * alguien reescribe la pantalla y el ancla desaparece, `replace()` no cambia
   * nada, el guardarraíl sigue dando el mismo resultado y las pruebas de
   * mutación pasan sin haber mutado nada: exactamente el fallo que finge estar
   * probando algo. Pasó en la Fase 3 al reescribir esta pantalla.
   */
  function conMutacion(buscar, reemplazar) {
    const original = readFileSync(objetivo, "utf8");
    if (!original.includes(buscar)) {
      throw new Error(
        `El ancla de mutación ya no existe en ${objetivo}: ${JSON.stringify(buscar)}. ` +
          "Actualízala; sin ancla, la prueba no mide nada."
      );
    }
    try {
      writeFileSync(objetivo, original.replace(buscar, reemplazar));
      try {
        execFileSync("node", ["scripts/check-design-tokens.mjs"], { stdio: "pipe" });
        return 0; // no detectó nada
      } catch (e) {
        return e.status ?? 1; // salió distinto de 0 ⇒ detectado
      }
    } finally {
      writeFileSync(objetivo, original);
    }
  }

  /* Ancla estable de la pantalla reescrita. Se comprueba su existencia en cada
     mutación, así que un cambio futuro fallará ruidosamente en vez de vaciar la
     prueba en silencio. */
  const ancla = '<Card className="p-[var(--card-padding)]">';

  it("detecta un color hexadecimal nuevo", () => {
    expect(conMutacion(ancla, '<Card style={{color:"#ff00aa"}} className="p-[var(--card-padding)]">')).toBe(1);
  });

  it("detecta un peso tipográfico prohibido", () => {
    expect(conMutacion(ancla, '<Card style={{fontWeight:900}} className="p-[var(--card-padding)]">')).toBe(1);
  });

  it("detecta un radio fuera de la escala", () => {
    expect(conMutacion(ancla, '<Card style={{borderRadius:19}} className="p-[var(--card-padding)]">')).toBe(1);
  });

  it("detecta un degradado decorativo", () => {
    expect(conMutacion(ancla, '<Card style={{background:"linear-gradient(90deg,red,blue)"}} className="p-[var(--card-padding)]">')).toBe(1);
  });

  it("detecta un rgba() nuevo", () => {
    expect(conMutacion(ancla, '<Card style={{color:"rgba(1,2,3,0.5)"}} className="p-[var(--card-padding)]">')).toBe(1);
  });

  it("detecta un confirm() nativo, también sin `window.`", () => {
    // La forma suelta es la que usa Plataforma; si solo se vigilara
    // `window.confirm`, migrar a la corta evadiría el guardarraíl.
    expect(conMutacion("const buscar = async (e) => {", "const buscar = async (e) => { if(!confirm('¿seguro?')) return;")).toBe(1);
  });

  it("NO se dispara sin cambios — no es un guardarraíl que grite siempre", () => {
    expect(conMutacion(ancla, ancla)).toBe(0);
  });

  it("no cuenta la DOCUMENTACIÓN como deuda", () => {
    // Penalizar a quien explica en un comentario por qué quitó un color sería
    // el incentivo exactamente contrario al que se busca.
    expect(conMutacion(ancla, `{/* antes: color #0f5132, peso 900 */}\n      ${ancla}`)).toBe(0);
  });
});

/* ══ 2. Semántica de estados ════════════════════════════════════════════ */

describe("ataque a la semántica de estados", () => {
  it("ninguna pantalla se pinta sus propios colores de estado", () => {
    /*
     * El fallo que el sistema de estados vino a eliminar: cada pantalla con su
     * propia tabla de colores. Se buscan mapas que asocien un estado de
     * negocio a un color en crudo.
     */
    const sospechosos = [];
    for (const { path, source } of APP) {
      const sinComentarios = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      // p. ej.  RESERVA: "#f59e0b"   o   activo: { bg: "#dcfce7" }
      const re = /\b(RESERVA|APROBADO|DENEGADO|SERVIDO|CANCELADO|CADUCADO|activo|pendiente|bloqueado|inactivo)\b\s*:\s*\{?\s*(?:bg\s*:\s*)?["']#[0-9a-fA-F]{3,8}["']/g;
      for (const m of sinComentarios.matchAll(re)) sospechosos.push(`${path}: ${m[0]}`);
    }
    // Las pantallas sin migrar todavía los tienen; lo que no puede pasar es que
    // aparezcan en la migrada.
    expect(sospechosos.filter((s) => s.startsWith("pages/AdminUsuarios"))).toEqual([]);
  });

  it("el verde nunca significa dos cosas: ningún estado de acción es verde", () => {
    // Verde = estado, nunca acción. Se comprueba que el sistema no tenga
    // variante de botón verde de la que tirar.
    const button = readFileSync(join(RAIZ, "ui/components/button.tsx"), "utf8");
    expect(button).not.toMatch(/success\s*:\s*\[/);
  });

  it("un estado inventado no puede colarse con color propio", () => {
    // Aunque alguien invente "SUPER_APROBADO", cae en neutro y conserva texto.
    const r = estadoPedido("SUPER_APROBADO");
    expect(STATUS_TONES[r.status]).toBe(StatusTone.NEUTRAL);
    expect(r.label).toBe("SUPER_APROBADO");
  });

  it("los tonos de los cuatro estados de usuario son distinguibles entre sí", () => {
    const tonos = Object.keys(VOCABULARIOS.usuario).map((k) => STATUS_TONES[estadoUsuario(k).status]);
    // activo/inactivo/pendiente/bloqueado ⇒ al menos 3 tonos distintos
    // (activo y ninguno más comparten éxito).
    expect(new Set(tonos).size).toBeGreaterThanOrEqual(3);
  });

  it("StatusBadge no permite ocultar la etiqueta", () => {
    // No hay prop para renderizar solo color: un chip de color sin texto
    // incumple la SC 1.4.1 y es justo lo que este componente evita.
    const src = readFileSync(join(RAIZ, "ui/components/status-badge.tsx"), "utf8");
    expect(src).not.toMatch(/hideLabel|showLabel/);
    render(<StatusBadge status="approved" label="Aprobado" />);
    expect(screen.getByText("Aprobado")).toBeInTheDocument();
  });
});

/* ══ 3. Asociación de etiquetas ═════════════════════════════════════════ */

describe("ataque a la asociación de etiquetas", () => {
  it("dos Field con el MISMO texto de etiqueta siguen teniendo ids distintos", async () => {
    // El fallo sutil: dos "Email" en la misma página. Si el id se derivara del
    // texto, la segunda etiqueta enfocaría el primer campo.
    render(
      <>
        <Field label="Email"><Input data-testid="a" /></Field>
        <Field label="Email"><Input data-testid="b" /></Field>
      </>
    );
    const a = screen.getByTestId("a");
    const b = screen.getByTestId("b");
    expect(a.id).not.toBe(b.id);

    // Y cada etiqueta enfoca SU campo.
    const user = userEvent.setup();
    const etiquetas = screen.getAllByText("Email");
    await user.click(etiquetas[1]);
    expect(b).toHaveFocus();
  });

  it("un placeholder NO sustituye a la etiqueta en el piloto", () => {
    const src = APP.find((f) => f.path === "pages/AdminUsuarios.jsx").source;
    // Todo placeholder debe convivir con un Field/label; se comprueba que no
    // haya inputs sueltos con placeholder y sin envoltorio.
    const inputsSueltos = src.match(/<input\b(?![^>]*type="file")[^>]*placeholder=/g) || [];
    expect(inputsSueltos).toEqual([]);
  });

  it("el piloto no deja ningún control de formulario sin nombre accesible", async () => {
    const api = await import("../api/api");
    vi.spyOn(api, "adminListUsers").mockResolvedValue([]);
    vi.spyOn(api, "getClientes").mockResolvedValue([]);

    const { ToastProvider } = await import("../components/ui/ToastProvider");
    const AdminUsuarios = (await import("../pages/AdminUsuarios")).default;
    window.localStorage.setItem("user", JSON.stringify({ rol: "admin" }));

    render(<ToastProvider><AdminUsuarios /></ToastProvider>);
    await screen.findByRole("table");

    const sinNombre = [];
    for (const el of document.querySelectorAll("input, select, textarea")) {
      if (el.type === "file" || el.type === "hidden") continue;
      /*
       * Se excluye lo que NO está en el árbol de accesibilidad. Radix Select
       * renderiza un <select> nativo con aria-hidden y tabindex=-1 para que el
       * formulario envíe el valor; no lo anuncia ningún lector de pantalla y
       * no se puede tabular hasta él. Verificado en navegador.
       *
       * La exclusión es explícita a propósito: si esta prueba lo omitiera sin
       * decirlo, pasaría por casualidad en jsdom —donde ese nodo no siempre se
       * renderiza— y dejaría de comprobar lo que dice comprobar.
       */
      if (el.getAttribute("aria-hidden") === "true") continue;
      if (el.closest("[aria-hidden='true']")) continue;

      const porLabel = el.labels && el.labels.length > 0;
      const porAria = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby");
      if (!porLabel && !porAria) sinNombre.push(el.outerHTML.slice(0, 70));
    }
    expect(sinNombre).toEqual([]);
  });
});

/* ══ 4. Regresiones de las fases 0 y 1 ══════════════════════════════════ */

describe("las fases anteriores siguen intactas", () => {
  it("el shell mantiene el límite de error alrededor del contenido, no del shell", () => {
    const layout = readFileSync(join(RAIZ, "layout/Layout.jsx"), "utf8");
    const iErr = layout.indexOf("<ErrorBoundary");
    const iOutlet = layout.indexOf("<Outlet");
    const iShell = layout.indexOf("<AppShell");
    expect(iErr).toBeGreaterThan(-1);
    // El límite envuelve al Outlet…
    expect(iErr).toBeLessThan(iOutlet);
    // …y está DENTRO del AppShell, para que la navegación sobreviva al fallo.
    expect(iShell).toBeLessThan(iErr);
  });

  it("el contrato de Outlet context no ha cambiado", () => {
    const layout = readFileSync(join(RAIZ, "layout/Layout.jsx"), "utf8");
    expect(layout).toMatch(/context=\{\{\s*me,\s*isAdmin[^}]*collapsed/);
  });

  it("el modelo de permisos sigue siendo la única fuente de autorización", () => {
    // Ninguna pantalla puede volver a decidir rutas por su cuenta.
    const infractores = APP.filter(
      (f) => f.path.startsWith("pages/") && /isPathAllowedForRole|getVisibleNavItems/.test(f.source)
    ).map((f) => f.path);
    expect(infractores).toEqual([]);
  });

  it("ningún fichero fuera de api.js importa axios", () => {
    const infractores = APP.filter(
      (f) => f.path !== "api/api.js" && /^\s*import\s+.*\bfrom\s+["']axios["']/m.test(f.source)
    ).map((f) => f.path);
    expect(infractores).toEqual([]);
  });

  it("el rodeo del centrado del modal sigue en su sitio", () => {
    const appCss = readFileSync(join(RAIZ, "styles/app.css"), "utf8");
    expect(appCss).toContain("--devcon8-enter-x: -50%");
  });
});

/* ══ 5. Aislamiento por ayuntamiento ════════════════════════════════════ */

describe("aislamiento de tenant en el piloto", () => {
  it("solo el superadmin recibe el control para reasignar ayuntamiento", () => {
    const src = APP.find((f) => f.path === "pages/AdminUsuarios.jsx").source;
    // Toda aparición del campo de institución va condicionada a esSuperadmin.
    const bloques = src.split("Institución (ayuntamiento)");
    for (let i = 1; i < bloques.length; i++) {
      const antes = bloques[i - 1].slice(-420);
      expect(antes, `aparición ${i}`).toMatch(/esSuperadmin/);
    }
  });

  it("las herramientas globales siguen tras la condición de superadmin", () => {
    const src = APP.find((f) => f.path === "pages/AdminUsuarios.jsx").source;
    const iCond = src.indexOf("{esSuperadmin && (");
    const iHerr = src.indexOf("<HerramientasPlataforma");
    expect(iCond).toBeGreaterThan(-1);
    expect(iHerr).toBeGreaterThan(iCond);
  });

  it("el rol de plataforma no se puede conceder desde un ayuntamiento", async () => {
    const { rolesParaUsuario } = await import("../pages/AdminUsuarios.roles");
    expect(rolesParaUsuario(false).some((r) => r.value === "superadmin")).toBe(false);
  });
});

/* ══ 6. Contrato de los PDF ═════════════════════════════════════════════ */

describe("contrato de DataTable frente a los PDF", () => {
  it("ninguna pantalla con jspdf se ha migrado todavía a DataTable", () => {
    /*
     * La barrera del riesgo CRÍTICO de la auditoría: Informes comparte los
     * arrays de sus tablas con 17 llamadas a autoTable. Si alguien migra esa
     * pantalla sin leer el contrato, el orden de columnas del PDF puede
     * cambiar en silencio.
     */
    const conPdf = APP.filter((f) => /from ["']jspdf|autoTable\(/.test(f.source)).map((f) => f.path);
    const conflictivas = APP.filter(
      (f) => /from ["']jspdf|autoTable\(/.test(f.source) && /\bDataTable\b/.test(f.source)
    );

    // Control anti-vacío: si esta lista quedara vacía la prueba no comprobaría
    // nada, y es justo lo que pasaría si alguien renombra el import de jspdf.
    expect(conPdf, "no se encontró ninguna pantalla con generación de PDF").not.toEqual([]);

    // Cuando llegue el día de migrarlas, se exige que el fichero cite el
    // contrato — así quien lo haga se topa con la regla en vez de descubrirla
    // después, en un expediente ya impreso.
    for (const f of conflictivas) {
      expect(f.source, `${f.path} usa DataTable y genera PDF: debe referenciar docs/data-table-contract.md`)
        .toMatch(/data-table-contract/);
    }
  });

  it("el documento del contrato existe y nombra el riesgo", () => {
    const doc = readFileSync(resolve(process.cwd(), "docs/data-table-contract.md"), "utf8");
    expect(doc).toMatch(/autoTable/);
    expect(doc).toMatch(/orden/i);
  });
});

/* ══ 7. Impresión ══════════════════════════════════════════════════════ */

describe("hoja de impresión", () => {
  const print = readFileSync(join(RAIZ, "styles/print.css"), "utf8");

  it("oculta la navegación y el cromo", () => {
    expect(print).toMatch(/aside/);
    expect(print).toMatch(/Navegación principal/);
    expect(print).toMatch(/display:\s*none/);
  });

  it("repite la cabecera de la tabla en cada página", () => {
    expect(print).toMatch(/thead[\s\S]*?table-header-group/);
  });

  it("evita partir filas entre páginas", () => {
    expect(print).toMatch(/page-break-inside:\s*avoid/);
  });

  it("el estado no depende del color al imprimir", () => {
    // En blanco y negro, una insignia teñida no dice nada: se le pone borde.
    expect(print).toMatch(/data-estado|status-/);
    expect(print).toMatch(/border:\s*1px solid #000/);
  });

  it("no deja fondos ni sombras que emborronen el papel", () => {
    expect(print).toMatch(/box-shadow:\s*none/);
    expect(print).toMatch(/background-image:\s*none/);
  });
});
