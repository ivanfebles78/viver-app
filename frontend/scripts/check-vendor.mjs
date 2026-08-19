#!/usr/bin/env node
/**
 * GUARDARRAÍL DE CÓDIGO VENDORIZADO.
 *
 * `src/ui/` es una copia del paquete `@devcon8/ui`. La regla del proyecto es
 * que NO se edita aquí: si algo tiene que cambiar, cambia aguas arriba y se
 * vuelve a copiar. Sin esta comprobación, la regla es sólo un comentario en un
 * fichero — y un parche local puesto con buena intención sobrevive hasta la
 * siguiente sincronización, que lo borra en silencio.
 *
 * Comprueba DOS cosas, y la distinción importa:
 *
 *   1. INTEGRIDAD (siempre). Cada fichero vendorizado se contrasta con el
 *      hash registrado en `vendor-manifest.json`. Detecta cualquier edición
 *      local, y funciona en CI, donde el repositorio del paquete no existe.
 *
 *   2. ACTUALIDAD (si el paquete está al lado). Si se encuentra
 *      `devcon8-platform`, se compara además fichero a fichero contra su
 *      código fuente, que es lo único capaz de decir si la copia se ha quedado
 *      ATRÁS respecto al paquete.
 *
 * Uso:
 *   node scripts/check-vendor.mjs             comprobar
 *   node scripts/check-vendor.mjs --update    regenerar el manifiesto tras una
 *                                             sincronización legítima
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const RAIZ = resolve(process.cwd());
const VENDOR = join(RAIZ, "src/ui");
const MANIFIESTO = join(RAIZ, "scripts/vendor-manifest.json");

/**
 * Ficheros que ViverApp AÑADE al paquete y que por tanto no se comparan con
 * aguas arriba. Cada uno lleva su motivo: una lista de excepciones sin motivo
 * es una lista que crece sola.
 */
const PROPIOS = {
  "index.js": "Punto de entrada propio: el paquete exporta index.ts y aquí se consume como JS.",
  "contract.test.js": "Pruebas de ViverApp CONTRA el paquete; no forman parte de él.",
  "theme-script.test.js": "Ídem: comprueba el script de tema desde el lado del consumidor.",
  "focus-restore.test.jsx": "Ídem: fija la devolución del foco (UF-7) contra el componente real.",
};

/**
 * Divergencias ACEPTADAS respecto al código de aguas arriba, con su motivo.
 * Sólo pueden ser adaptaciones de empaquetado, nunca de diseño.
 */
const DIVERGENCIAS = {
  // ViverApp aplana el monorepo: los tokens no están tres niveles más arriba.
  "styles/theme.css": "Sólo la ruta relativa del @import de tokens.css.",
};

/**
 * Ficheros del paquete que ViverApp NO copia, con su motivo.
 *
 * Sin esta lista, la comprobación de «qué ha aparecido aguas arriba» no podría
 * distinguir entre un componente nuevo que hay que portar y una reubicación
 * deliberada, y acabaría avisando siempre — que es lo mismo que no avisar.
 */
const NO_PORTADOS = {
  "index.ts": "ViverApp expone su propio index.js.",
  "styles/theme.css": "Reubicado a src/styles/theme.css: el proyecto no es un monorepo.",
};

/* ── Utilidades ────────────────────────────────────────────────────────── */

/**
 * Hash del contenido NORMALIZANDO el fin de línea.
 *
 * El paquete se desarrolla con LF y este repositorio se clona en Windows con
 * CRLF. Comparar bytes en crudo marcaría cada fichero como modificado y el
 * guardarraíl se volvería ruido que nadie mira.
 */
const hash = (texto) => createHash("sha256").update(texto.replace(/\r\n/g, "\n")).digest("hex");

const leer = (p) => readFileSync(p, "utf8");

function listar(dir, base = dir) {
  const out = [];
  for (const entrada of readdirSync(dir)) {
    const completo = join(dir, entrada);
    if (statSync(completo).isDirectory()) out.push(...listar(completo, base));
    else out.push(relative(base, completo).split("\\").join("/"));
  }
  return out.sort();
}

/** Busca el paquete al lado del proyecto, sin exigir que esté. */
function localizarUpstream() {
  const candidatos = [
    resolve(RAIZ, "../../devcon8-platform/packages/ui/src"),
    resolve(RAIZ, "../../../devcon8-platform/packages/ui/src"),
  ];
  return candidatos.find((c) => existsSync(c)) || null;
}

/* ── Comprobación ──────────────────────────────────────────────────────── */

const ficheros = listar(VENDOR).filter((f) => !(f in PROPIOS));
const actualizar = process.argv.includes("--update");

if (actualizar) {
  const manifiesto = {
    generado: "manual",
    nota:
      "Hashes SHA-256 del código vendorizado, con el fin de línea normalizado a LF. " +
      "Regenerar SÓLO tras copiar desde el paquete, nunca para tapar una edición local.",
    ficheros: Object.fromEntries(ficheros.map((f) => [f, hash(leer(join(VENDOR, f)))])),
  };
  writeFileSync(MANIFIESTO, `${JSON.stringify(manifiesto, null, 2)}\n`);
  console.log(`Manifiesto regenerado con ${ficheros.length} fichero(s).`);
  process.exit(0);
}

if (!existsSync(MANIFIESTO)) {
  console.error("No existe scripts/vendor-manifest.json. Genéralo con --update.");
  process.exit(1);
}

const manifiesto = JSON.parse(leer(MANIFIESTO));
const registrados = manifiesto.ficheros || {};
const problemas = [];

for (const f of ficheros) {
  const esperado = registrados[f];
  if (!esperado) {
    problemas.push(`AÑADIDO sin registrar: ${f}`);
    continue;
  }
  if (hash(leer(join(VENDOR, f))) !== esperado) {
    problemas.push(`EDITADO en local: ${f}`);
  }
}
for (const f of Object.keys(registrados)) {
  if (!ficheros.includes(f)) problemas.push(`BORRADO: ${f}`);
}

console.log(`Integridad: ${ficheros.length} fichero(s) vendorizado(s) contrastados con el manifiesto.`);

/* ── Actualidad frente al paquete, si está disponible ──────────────────── */

const upstream = localizarUpstream();
if (!upstream) {
  console.log("Actualidad: el paquete no está junto al proyecto; se omite (normal en CI).");
} else {
  let desfasados = 0;
  let ausentes = 0;
  for (const f of ficheros) {
    const arriba = join(upstream, f);
    if (!existsSync(arriba)) {
      ausentes++;
      continue;
    }
    if (hash(leer(arriba)) !== hash(leer(join(VENDOR, f)))) {
      if (DIVERGENCIAS[f]) {
        console.log(`  divergencia aceptada · ${f}: ${DIVERGENCIAS[f]}`);
      } else {
        problemas.push(`DESFASADO respecto al paquete: ${f}`);
        desfasados++;
      }
    }
  }
  /*
   * Lo que el paquete tiene y aquí no. Es la única señal capaz de avisar de un
   * componente NUEVO aguas arriba: comparando sólo los ficheros locales, una
   * copia incompleta parece perfectamente al día.
   */
  const sinPortar = listar(upstream).filter(
    (f) => !ficheros.includes(f) && !(f in NO_PORTADOS)
  );
  for (const f of sinPortar) problemas.push(`NUEVO aguas arriba, sin portar: ${f}`);

  console.log(
    `Actualidad: comparado con ${upstream.split("\\").join("/")} — ` +
      `${desfasados} desfasado(s), ${ausentes} sin equivalente aguas arriba, ` +
      `${sinPortar.length} sin portar.`
  );
}

if (problemas.length > 0) {
  console.error("\nEL CÓDIGO VENDORIZADO NO CUADRA:\n");
  for (const p of problemas) console.error(`  · ${p}`);
  console.error(
    "\n`src/ui/` no se edita aquí. Cambia aguas arriba, vuelve a copiar y\n" +
      "regenera el manifiesto con `npm run check:vendor -- --update`.\n"
  );
  process.exit(1);
}

console.log("\nEl código vendorizado está intacto y al día.");
