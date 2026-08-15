/**
 * Barreras sobre las hojas de estilo.
 *
 * Son pruebas de arquitectura, no de apariencia: comprueban que ningún CSS de
 * la aplicación pueda volver a romper el foco visible ni volver a filtrar
 * reglas de elemento a toda la aplicación.
 *
 * Existen porque el fallo original era invisible desde la pantalla que lo
 * causaba: `Login.css` dejaba sin contorno de foco a las 13 rutas, y nadie
 * revisando el login lo habría notado.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const SRC = resolve(process.cwd(), "src");

function cssFiles(dir = SRC, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      cssFiles(full, acc);
      continue;
    }
    if (entry.endsWith(".css")) {
      acc.push({
        path: relative(SRC, full).replace(/\\/g, "/"),
        source: readFileSync(full, "utf8"),
      });
    }
  }
  return acc;
}

/** Quita comentarios para no analizar código de ejemplo ni notas. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Los tokens de DevCon8 son código vendorizado: se sincronizan aguas arriba. */
const VENDORED = /^styles\/tokens\.css$/;

describe("hojas de estilo de la aplicación", () => {
  const files = cssFiles().filter((f) => !VENDORED.test(f.path));

  it("encuentra al menos una hoja que analizar", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("ninguna suprime el foco sin dibujar un indicador equivalente", () => {
    const offenders = [];
    for (const { path, source } of files) {
      // Se examina cada bloque de reglas por separado: `outline: none` solo es
      // admisible si ESA MISMA regla dibuja un anillo en su lugar.
      const blocks = stripComments(source).split("}");
      for (const block of blocks) {
        if (!/outline\s*:\s*(none|0)\b/.test(block)) continue;
        const drawsRing = /outline\s*:\s*[^;]*\b(solid|auto|dotted|dashed)\b/.test(block)
          || /box-shadow\s*:[^;]*(inset\s+)?0\s+0\s+0/.test(block);
        if (!drawsRing) {
          offenders.push(`${path}: ${block.trim().split("\n")[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("ninguna aplica reglas a selectores de elemento desnudos", () => {
    // `input { … }` en cualquier hoja alcanza a toda la aplicación, porque Vite
    // inyecta el CSS de forma global. Un descendiente acotado como
    // `.loginCard input` es correcto; lo que no vale es el elemento a secas.
    const ELEMENTS =
      /^(input|select|textarea|button|label|body|html|a|h[1-6]|table|td|th|ul|ol|li|p|img|form)(:{1,2}[a-z-]+(\([^)]*\))?)*$/;
    const offenders = [];

    for (const { path, source } of files) {
      const css = stripComments(source);
      // Texto de selector = lo que hay entre el final del bloque anterior y `{`.
      for (const match of css.matchAll(/(^|[};])\s*([^{}@;]+?)\s*\{/g)) {
        for (const selector of match[2].split(",")) {
          const trimmed = selector.trim();
          if (ELEMENTS.test(trimmed)) offenders.push(`${path}: "${trimmed}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
