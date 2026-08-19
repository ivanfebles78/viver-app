/**
 * NINGUNA SUPRESIÓN DE LINT SIN MOTIVO.
 *
 * Un `eslint-disable` es una decisión: alguien miró la regla, entendió por qué
 * salta y decidió que aquí no aplica. Sin el motivo escrito, lo que queda es
 * indistinguible de haber silenciado la regla para que el contador bajara — y
 * quien lo lea dentro de seis meses no tendrá forma de saber cuál de las dos
 * cosas fue, así que no se atreverá a quitarlo.
 *
 * Esto no limita CUÁNTAS puede haber. Limita que haya alguna sin explicar, que
 * es lo que de verdad se degrada solo.
 *
 * Las pruebas quedan fuera: ahí una supresión suele ser andamiaje del propio
 * caso y su motivo es el nombre de la prueba.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const RAIZ = resolve(process.cwd(), "src");

function fuentes(dir) {
  const out = [];
  for (const entrada of readdirSync(dir)) {
    const completo = join(dir, entrada);
    if (statSync(completo).isDirectory()) out.push(...fuentes(completo));
    else if (/\.(jsx?|tsx?)$/.test(entrada) && !/\.test\./.test(entrada)) out.push(completo);
  }
  return out;
}

/**
 * El motivo tiene que ir TRAS `--` en la misma línea.
 *
 * Es la sintaxis que ESLint mismo define para describir una supresión, y es la
 * única que se puede comprobar sin ambigüedad. La primera versión de esto
 * aceptaba también «un comentario justo encima», y no servía: cualquier bloque
 * de documentación que terminase ahí la daba por buena, así que una supresión
 * metida bajo un JSDoc ajeno pasaba el filtro. Se descubrió porque la
 * comprobación por mutación NO la detectó — que es exactamente para lo que está.
 *
 * Puede haber además una explicación larga encima; esto sólo exige que la línea
 * de la supresión diga por sí sola de qué va.
 */
function tieneMotivo(lineas, i) {
  return /eslint-disable[^\n]*--\s*\S/.test(lineas[i]);
}

describe("supresiones de lint", () => {
  it("todas dicen por qué", () => {
    const sinMotivo = [];
    for (const fichero of fuentes(RAIZ)) {
      const lineas = readFileSync(fichero, "utf8").split("\n");
      lineas.forEach((linea, i) => {
        if (!linea.includes("eslint-disable")) return;
        if (!tieneMotivo(lineas, i)) {
          sinMotivo.push(`${fichero.replace(RAIZ, "src")}:${i + 1}`);
        }
      });
    }
    expect(sinMotivo).toEqual([]);
  });
});
