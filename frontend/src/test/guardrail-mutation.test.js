/**
 * MUTACIÓN DEL GUARDARRAÍL DE TOKENS.
 *
 * Un guardarraíl que nunca ha fallado no ha demostrado nada. Aquí se le mete
 * una infracción de cada regla y se exige que salte, y una no-infracción para
 * exigir que NO salte.
 *
 * POR QUÉ ESTÁ TODO EN UN SOLO FICHERO. Vitest ejecuta los ficheros de prueba
 * en paralelo. Estas pruebas escriben en disco y ejecutan un escáner que lee
 * TODO `src/`, así que dos suites mutando a la vez se pisan: una ve la
 * infracción de la otra y falla sin motivo. Juntas en un fichero se ejecutan en
 * serie y el problema desaparece.
 *
 * Y por eso mutan `fixtures/guardrail-target.jsx` y no una pantalla real:
 * reescribir `Movimientos.jsx` mientras otra suite lo importa provocó una
 * ejecución con 40 fallos que no se reprodujo a la siguiente.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const RAIZ = resolve(process.cwd(), "src");
const DIANA = join(RAIZ, "test/fixtures/guardrail-target.jsx");

/** Ejecuta el guardarraíl. 0 = no protestó, 1 = detectó deuda nueva. */
function ejecutarGuardarrail() {
  try {
    execFileSync("node", ["scripts/check-design-tokens.mjs"], { stdio: "pipe" });
    return 0;
  } catch (e) {
    return e.status ?? 1;
  }
}

/**
 * Inyecta una mutación en la diana, ejecuta el guardarraíl y restaura siempre.
 *
 * Comprueba antes que el ancla existe: sin esa comprobación, si la diana
 * cambiara, `replace()` no mutaría nada y la prueba pasaría sin haber probado
 * nada. Pasó de verdad en la Fase 3 con las anclas de Lotetracking.
 */
function conMutacion(buscar, reemplazar) {
  const original = readFileSync(DIANA, "utf8");
  if (!original.includes(buscar)) {
    throw new Error(`El ancla ya no existe en la diana: ${JSON.stringify(buscar)}`);
  }
  try {
    writeFileSync(DIANA, original.replace(buscar, reemplazar));
    return ejecutarGuardarrail();
  } finally {
    writeFileSync(DIANA, original);
  }
}

const ANCLA = '<Card className="p-[var(--card-padding)]">';

describe("guardarraíl de tokens · detecta cada infracción", () => {
  beforeAll(() => {
    // Si la base ya estuviera sucia, todo lo de abajo daría 1 por el motivo
    // equivocado y las pruebas pasarían por accidente.
    expect(ejecutarGuardarrail(), "la línea base debe estar limpia antes de mutar").toBe(0);
  });

  it("detecta un color hexadecimal nuevo", () => {
    expect(conMutacion(ANCLA, '<Card style={{ color: "#ff00aa" }} className="p-[var(--card-padding)]">')).toBe(1);
  });

  it("detecta un rgba() nuevo", () => {
    expect(conMutacion(ANCLA, '<Card style={{ color: "rgba(1,2,3,0.5)" }} className="p-[var(--card-padding)]">')).toBe(1);
  });

  it("detecta un peso tipográfico prohibido", () => {
    expect(conMutacion(ANCLA, '<Card style={{ fontWeight: 900 }} className="p-[var(--card-padding)]">')).toBe(1);
  });

  it("detecta un radio fuera de la escala", () => {
    expect(conMutacion(ANCLA, '<Card style={{ borderRadius: 19 }} className="p-[var(--card-padding)]">')).toBe(1);
  });

  it("detecta un degradado decorativo", () => {
    expect(
      conMutacion(ANCLA, '<Card style={{ background: "linear-gradient(90deg,red,blue)" }} className="p-[var(--card-padding)]">')
    ).toBe(1);
  });

  it("detecta un confirm() nativo, también sin `window.`", () => {
    // La forma suelta es la que usaba Plataforma; vigilar solo `window.confirm`
    // dejaría una puerta abierta.
    expect(
      conMutacion(
        "export default function GuardrailTarget() {",
        "export default function GuardrailTarget() {\n  if (!confirm('¿seguro?')) return null;"
      )
    ).toBe(1);
  });

  it("detecta un alert() nativo", () => {
    expect(
      conMutacion(
        "export default function GuardrailTarget() {",
        "export default function GuardrailTarget() {\n  alert('hola');"
      )
    ).toBe(1);
  });
});

describe("guardarraíl de tokens · no protesta sin motivo", () => {
  it("NO se dispara sin cambios", () => {
    expect(conMutacion(ANCLA, ANCLA)).toBe(0);
  });

  it("no cuenta la DOCUMENTACIÓN como deuda", () => {
    // Penalizar a quien explica en un comentario por qué quitó un color sería
    // el incentivo exactamente contrario al que se busca.
    expect(conMutacion(ANCLA, `{/* antes: color #0f5132, peso 900 */}\n      ${ANCLA}`)).toBe(0);
  });

  it("no cuenta un token del sistema como valor en crudo", () => {
    expect(
      conMutacion(ANCLA, '<Card className="p-[var(--card-padding)] rounded-[var(--radius-lg)] bg-[var(--muted)]">')
    ).toBe(0);
  });

  it("la diana queda restaurada después de mutarla", () => {
    // La restauración va en un `finally`, pero conviene comprobarlo: si fallara,
    // el repositorio quedaría sucio y el resto de pruebas darían falsos fallos.
    const contenido = readFileSync(DIANA, "utf8");
    expect(contenido).toContain(ANCLA);
    expect(contenido).not.toContain("#ff00aa");
    expect(contenido).not.toContain("fontWeight");
    expect(ejecutarGuardarrail()).toBe(0);
  });
});
