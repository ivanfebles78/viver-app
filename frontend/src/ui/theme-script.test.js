/**
 * El script de tema inlineado en index.html debe seguir coincidiendo con
 * THEME_SCRIPT del paquete de UI.
 *
 * Están duplicados por necesidad: uno tiene que ejecutarse antes del primer
 * pintado, es decir antes de que exista ningún módulo de JavaScript. Duplicado
 * sin vigilancia, uno de los dos se queda atrás y vuelve el destello de tema
 * equivocado — un fallo que solo se ve durante un fotograma y que nadie
 * reproduce a voluntad.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { THEME_SCRIPT } from "./theme/theme-provider";

/** Reduce a lo esencial: sin espacios, comillas normalizadas. */
function normalize(source) {
  return source.replace(/\s+/g, "").replace(/"/g, "'");
}

describe("tema fijado en claro (decisión de esta entrega)", () => {
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

  it("el arranque fija el tema claro antes del primer pintado", () => {
    const inlined = normalize(html);
    expect(inlined).toContain(normalize("setAttribute('data-theme','light')"));
    expect(inlined).toContain(normalize("classList.remove('dark')"));
    expect(html.indexOf("data-theme")).toBeLessThan(html.indexOf("<body>"));
  });

  it("NO resuelve el tema desde la preferencia del sistema", () => {
    /*
     * Esta es la prueba que documenta la decisión.
     *
     * Si el arranque volviera a leer `prefers-color-scheme`, un usuario con el
     * sistema en oscuro entraría en modo oscuro sin tocar nada — y se
     * encontraría con las 11 pantallas sin migrar, que llevan los colores en
     * crudo. El titular del Dashboard (#0f172a) sobre el fondo oscuro
     * (#020617) da 1,13:1 frente al 4,5:1 de la SC 1.4.3.
     *
     * Al migrar las pantallas, este comportamiento se revierte: se restaura
     * THEME_SCRIPT en index.html y se vuelve a montar <ThemeToggle>. Entonces
     * esta prueba debe cambiarse a propósito, no romperse por accidente.
     */
    expect(normalize(html)).not.toContain(normalize("prefers-color-scheme"));
  });

  it("el conmutador de tema no está montado en el shell", () => {
    const layout = readFileSync(resolve(process.cwd(), "src/layout/Layout.jsx"), "utf8");
    const codigo = layout.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(codigo).not.toContain("<ThemeToggle");
  });

  it("la infraestructura de tema sigue disponible para reactivarla", () => {
    // Los tokens oscuros y THEME_SCRIPT permanecen: reactivar el modo oscuro
    // debe ser restaurar dos cosas, no volver a construirlas.
    const tokens = readFileSync(resolve(process.cwd(), "src/styles/tokens.css"), "utf8");
    expect(tokens).toMatch(/\.dark\s*,?\s*\n?\s*\[data-theme="dark"\]/);
    expect(normalize(THEME_SCRIPT)).toContain(normalize("prefers-color-scheme:dark"));
  });

  it("va envuelto en try/catch — un localStorage bloqueado no puede tumbar la página", () => {
    expect(normalize(html)).toContain(normalize("try{"));
    expect(normalize(html)).toContain(normalize("catch"));
  });
});

describe("documento base", () => {
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

  it('declara lang="es"', () => {
    expect(html).toMatch(/<html[^>]*\slang="es"/);
  });

  it("declara una densidad de forma explícita", () => {
    expect(html).toMatch(/<html[^>]*\sdata-density="(compact|comfortable)"/);
  });

  it("no conserva rastros del andamiaje de Vite", () => {
    expect(html).not.toContain("vite.svg");
    expect(html).not.toMatch(/<title>\s*frontend\s*<\/title>/);
  });

  it("tiene un viewport que permite el zoom", () => {
    // Bloquear el zoom incumple SC 1.4.4.
    expect(html).toMatch(/name="viewport"/);
    expect(html).not.toMatch(/user-scalable\s*=\s*no/);
    expect(html).not.toMatch(/maximum-scale\s*=\s*1/);
  });
});
