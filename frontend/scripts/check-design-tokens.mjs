#!/usr/bin/env node
/**
 * GUARDARRAÍL DE TOKENS — impide deuda visual NUEVA.
 *
 * La aplicación arrastra 22.000 líneas con valores visuales en crudo. Exigir
 * que se migren todas a la vez pararía el trabajo; no exigir nada deja que la
 * deuda vuelva a crecer mientras se migra. Así que esto no mide la deuda
 * absoluta: mide si ha SUBIDO respecto a una línea base congelada.
 *
 * Por fichero, no global: mover código entre ficheros no puede disfrazar una
 * regresión, y arreglar una pantalla no da crédito para empeorar otra.
 *
 *   node scripts/check-design-tokens.mjs            comprueba contra la base
 *   node scripts/check-design-tokens.mjs --update   regraba la base (bajadas)
 *
 * El fichero de base se versiona: un aumento aparece en el diff del PR y hay
 * que justificarlo, en lugar de colarse en silencio.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const RAIZ = resolve(process.cwd(), "src");
const BASE = resolve(process.cwd(), "scripts/design-debt-baseline.json");

/**
 * Rutas exentas.
 *
 * `ui/` y `styles/tokens.css`+`theme.css` son código VENDORIZADO: su
 * contenido se sincroniza aguas arriba y contarlo aquí mediría a
 * devcon8-platform, no a ViverApp. `app.css` es nuestro, pero contiene el
 * rodeo documentado del defecto de centrado del modal.
 */
const EXENTOS = [/^ui\//, /^styles\//, /\.(test|spec)\.(js|jsx)$/];

/**
 * Reglas.
 *
 * Cada una detecta un valor visual que el sistema de diseño exige expresar
 * como token. No se busca la perfección del análisis: se busca que un número
 * suba cuando alguien escribe un color a mano.
 */
const REGLAS = [
  {
    id: "hex",
    descripcion: "Color hexadecimal en crudo",
    // Se excluyen los de dentro de un comentario de una línea, que suelen ser
    // documentación del valor antiguo.
    patron: /#[0-9a-fA-F]{3,8}\b/g,
  },
  {
    id: "rgb",
    descripcion: "rgb()/rgba() en crudo",
    patron: /\brgba?\s*\(/g,
  },
  {
    id: "peso-tipografico",
    descripcion: "Peso tipográfico fuera de 400/500/600/700",
    // El sistema permite solo cuatro pesos; 800, 900 y 950 no existen en él.
    patron: /fontWeight\s*:\s*["']?(?:8\d0|9\d0|950)["']?/g,
  },
  {
    id: "radio",
    descripcion: "Radio de borde fuera de la escala (0/4/6/8/12/16/full)",
    patron: /borderRadius\s*:\s*["']?(?:1[01379]|1[45]|2[0-9]|3[0-9]|[57]|9(?!99))\d*\b/g,
  },
  {
    id: "estilo-en-linea",
    descripcion: "Objeto de estilo en línea",
    patron: /style=\{\{/g,
  },
  {
    id: "gradiente",
    descripcion: "Degradado decorativo",
    patron: /\b(?:linear|radial|conic)-gradient\s*\(/g,
  },
  {
    id: "dialogo-nativo",
    descripcion: "alert()/confirm()/prompt() nativo del navegador",
    /*
     * Cubre tanto `window.confirm(...)` como la llamada suelta `confirm(...)`.
     * Si solo se buscara la forma con `window.`, migrar a la forma corta
     * evadiría el guardarraíl sin quitar un solo diálogo nativo — Plataforma
     * ya usa la forma suelta.
     *
     * El `(?<![.\w])` evita contar `this.confirm(` o `miAlert(`.
     */
    patron: /(?<![.\w])(?:window\s*\.\s*)?(?:alert|confirm|prompt)\s*\(/g,
  },
];

function ficheros(dir = RAIZ, acc = []) {
  for (const entrada of readdirSync(dir)) {
    const completo = join(dir, entrada);
    if (statSync(completo).isDirectory()) {
      ficheros(completo, acc);
      continue;
    }
    if (!/\.(jsx?|css)$/.test(entrada)) continue;
    const rel = relative(RAIZ, completo).replace(/\\/g, "/");
    if (EXENTOS.some((r) => r.test(rel))) continue;
    acc.push(rel);
  }
  return acc;
}

/**
 * Quita comentarios antes de medir.
 *
 * Sin esto, el guardarraíl cuenta la DOCUMENTACIÓN como deuda: un comentario
 * que explica «esto sustituye a `window.confirm()`» se contabiliza como un
 * `window.confirm()`, y un `// antes: #0f5132` como un color en crudo.
 *
 * El efecto perverso sería el peor posible: penalizar precisamente a quien
 * documenta por qué quitó algo. Se sustituyen por espacios para no alterar la
 * longitud y que cualquier futura referencia a posiciones siga cuadrando.
 */
function quitarComentarios(fuente) {
  return fuente
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}

/** Cuenta ocurrencias por regla en un fichero. */
function medir(rel) {
  const fuente = quitarComentarios(readFileSync(join(RAIZ, rel), "utf8"));
  const conteos = {};
  for (const regla of REGLAS) {
    const n = (fuente.match(regla.patron) || []).length;
    if (n > 0) conteos[regla.id] = n;
  }
  return conteos;
}

function medirTodo() {
  const resultado = {};
  for (const rel of ficheros().sort()) {
    const c = medir(rel);
    if (Object.keys(c).length > 0) resultado[rel] = c;
  }
  return resultado;
}

const actual = medirTodo();
const totales = {};
for (const c of Object.values(actual)) {
  for (const [id, n] of Object.entries(c)) totales[id] = (totales[id] || 0) + n;
}

if (process.argv.includes("--update")) {
  writeFileSync(BASE, JSON.stringify({ generado: "manual", ficheros: actual }, null, 2) + "\n");
  console.log(`Línea base regrabada: ${Object.keys(actual).length} ficheros con deuda.`);
  console.table(totales);
  process.exit(0);
}

if (!existsSync(BASE)) {
  console.error("No existe la línea base. Genérala con: node scripts/check-design-tokens.mjs --update");
  process.exit(1);
}

const base = JSON.parse(readFileSync(BASE, "utf8")).ficheros;
const regresiones = [];
const mejoras = [];

for (const [rel, conteos] of Object.entries(actual)) {
  for (const [id, n] of Object.entries(conteos)) {
    const previo = base[rel]?.[id] ?? 0;
    if (n > previo) {
      const regla = REGLAS.find((r) => r.id === id);
      regresiones.push(`  ${rel}\n      ${regla.descripcion}: ${previo} → ${n}  (+${n - previo})`);
    }
  }
}
for (const [rel, conteos] of Object.entries(base)) {
  for (const [id, previo] of Object.entries(conteos)) {
    const n = actual[rel]?.[id] ?? 0;
    if (n < previo) mejoras.push(`  ${rel}: ${id} ${previo} → ${n}`);
  }
}

console.log("Deuda visual actual (solo código de aplicación):");
console.table(totales);

if (mejoras.length > 0) {
  console.log(`\n${mejoras.length} mejora(s) respecto a la línea base:`);
  console.log(mejoras.slice(0, 20).join("\n"));
  console.log("\nEjecuta `npm run tokens:update` para consolidarlas en la base.");
}

if (regresiones.length > 0) {
  console.error(`\nDEUDA VISUAL NUEVA en ${regresiones.length} punto(s):\n`);
  console.error(regresiones.join("\n"));
  console.error(
    "\nUsa tokens del sistema de diseño en lugar de valores en crudo.\n" +
      "Si el aumento es legítimo, actualiza la base y explícalo en el PR."
  );
  process.exit(1);
}

console.log("\nSin deuda visual nueva.");
