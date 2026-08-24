/**
 * CONTRASTE DE LAS LÍNEAS DENEGADAS — Pedidos.
 *
 * Defecto medido con axe-core en navegador real, no supuesto: las líneas
 * denegadas se atenuaban con `opacity: 0.55`, y eso mezcla el texto con el
 * fondo. `--foreground` (#0F172A, 17,85:1 sobre blanco) quedaba en un efectivo
 * #7B7F8A, es decir **4,0:1** — por debajo del 4,5 que exige el criterio 1.4.3
 * en nivel AA para texto normal. Dos nodos por línea denegada.
 *
 * jsdom no compone capas ni calcula contraste, así que aquí NO se puede medir.
 * Lo que sí se puede fijar —y es lo que impide que vuelva— es la causa: que la
 * atenuación no se haga con opacidad.
 *
 * La comprobación se hace sobre el CÓDIGO, sin comentarios, para que esta misma
 * explicación no la haga pasar por casualidad.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const BRUTO = readFileSync(resolve(process.cwd(), "src/pages/Pedidos.jsx"), "utf8");
const FUENTE = BRUTO.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("una línea denegada se atenúa sin perder contraste", () => {
  it("NO se atenúa con opacidad", () => {
    /*
     * El guardarraíl apunta a ESTE defecto y no a cualquier `opacity` del
     * fichero: hay otra al 0.85 en el contador de un botón de destino que se
     * midió en navegador y pasa. Prohibirla también sería exigir un cambio que
     * ninguna medición respalda.
     *
     * Lo que no puede volver es atenuar por opacidad lo que depende de
     * `isDenegado`, que es donde se midió el 4,0:1.
     */
    expect(FUENTE).not.toMatch(/opacity:\s*isDenegado/);
    expect(FUENTE).not.toMatch(/isDenegado\s*\?\s*0?\.\d+\s*:/);
  });

  it("se atenúa con un token de color que sí cumple AA", () => {
    // `--muted-foreground` es #475569: 7,58:1 sobre blanco, medido en navegador.
    expect(FUENTE).toMatch(/isDenegado\s*\?\s*"var\(--muted-foreground\)"/);
  });

  it("y el color NO es el único canal", () => {
    /*
     * Criterio 1.4.1. Quien no distingue el gris del negro tiene que poder ver
     * igualmente que esa línea se denegó: el tachado lo dice sin color.
     */
    expect(FUENTE).toMatch(/textDecoration:\s*isDenegado\s*\?\s*"line-through"/);
  });
});
