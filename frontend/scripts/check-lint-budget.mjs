#!/usr/bin/env node
/**
 * TRINQUETE DE LINT.
 *
 * El proyecto arrastra problemas de ESLint en pantallas todavía sin migrar, así
 * que no se puede exigir cero. Pero dejar el lint en «informativo» significa
 * que nadie se entera si la cifra sube.
 *
 * Esto compara contra un techo versionado: la build falla si la cuenta AUMENTA,
 * y avisa —sin fallar— cuando baja, para que el techo se actualice y quede
 * registrado en el historial. Mismo criterio que el guardarraíl de tokens.
 *
 * Bajar el techo es una decisión consciente que se hace en un commit; subirlo
 * exige justificarlo en la revisión.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const BASE = resolve(AQUI, "lint-budget.json");
const actualizar = process.argv.includes("--update");

function contarProblemas() {
  let salida = "";
  try {
    // ESLint devuelve código 1 cuando hay errores; el JSON sale igualmente.
    salida = execFileSync("npx", ["eslint", ".", "--format", "json"], {
      cwd: resolve(AQUI, ".."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
  } catch (e) {
    salida = e.stdout || "";
  }

  if (!salida.trim()) {
    throw new Error("ESLint no devolvió resultados; no se puede medir el techo.");
  }

  const resultados = JSON.parse(salida);
  return resultados.reduce(
    (acc, f) => ({
      errores: acc.errores + f.errorCount,
      avisos: acc.avisos + f.warningCount,
    }),
    { errores: 0, avisos: 0 }
  );
}

const actual = contarProblemas();
const total = actual.errores + actual.avisos;

if (actualizar || !existsSync(BASE)) {
  writeFileSync(BASE, `${JSON.stringify({ total, ...actual }, null, 2)}\n`);
  console.log(`Techo de lint fijado en ${total} (${actual.errores} errores, ${actual.avisos} avisos).`);
  process.exit(0);
}

const techo = JSON.parse(readFileSync(BASE, "utf8"));

console.log(`Lint: ${total} problema(s) — ${actual.errores} errores, ${actual.avisos} avisos.`);
console.log(`Techo versionado: ${techo.total}.`);

if (total > techo.total) {
  console.error(
    `\nLA DEUDA DE LINT HA SUBIDO: ${techo.total} → ${total} (+${total - techo.total}).\n` +
      "Corrige los problemas nuevos. Si el aumento es legítimo, ejecuta\n" +
      "`npm run lint:budget:update` y explícalo en el PR."
  );
  process.exit(1);
}

if (total < techo.total) {
  console.log(
    `\nHa BAJADO ${techo.total - total}. Ejecuta \`npm run lint:budget:update\` para consolidarlo.`
  );
}

process.exit(0);
