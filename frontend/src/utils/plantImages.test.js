/**
 * EMPAREJAR CADA PLANTA CON SU FOTO.
 *
 * Medido sobre el catálogo real de 496 productos: sólo 41 —un 8 %— encontraban
 * su imagen, mientras 121 de las 158 fotos del repositorio no las usaba nadie.
 * No faltaban fotos: no se encontraban, porque la búsqueda era un `slug` exacto
 * del nombre científico y los nombres del catálogo están sucios.
 *
 * Los ejemplos de este fichero NO son inventados: están copiados de la base de
 * datos real del vivero.
 */

import { describe, it, expect } from "vitest";
import { plantSlug, nombresCandidatos } from "./plantImages";

describe("plantSlug", () => {
  it("normaliza como espera la carpeta de imágenes", () => {
    expect(plantSlug("Quercus ilex")).toBe("quercus-ilex");
    expect(plantSlug("Phoenix canariensis")).toBe("phoenix-canariensis");
  });

  it("quita tildes y mayúsculas", () => {
    expect(plantSlug("Acacia Nilotica")).toBe("acacia-nilotica");
    expect(plantSlug("Cyperus papyrus")).toBe("cyperus-papyrus");
  });

  it("no revienta con entradas vacías", () => {
    for (const v of ["", null, undefined]) expect(plantSlug(v)).toBe("");
  });
});

describe("nombresCandidatos", () => {
  it("el nombre exacto va PRIMERO", () => {
    /*
     * Importa el orden: si alguien subió la foto del cultivar concreto, esa foto
     * es mejor que la de la especie. La tolerancia es un plan B, no el plan A.
     */
    const c = nombresCandidatos("Delonix regia flavida");
    expect(c[0]).toBe("delonix-regia-flavida");
  });

  it("descarta el paréntesis con el nombre común", () => {
    // Real: «Bauhinia variegata (purpura)»
    expect(nombresCandidatos("Bauhinia variegata (purpura)")).toContain("bauhinia-variegata");
  });

  it("la limpieza conserva el TERCER término, que género+especie perdería", () => {
    /*
     * Esta prueba existe porque las dos anteriores pasaban por el motivo
     * equivocado: con un nombre de dos palabras, quitar el paréntesis y quedarse
     * con género+especie dan el mismo resultado, así que no distinguían si la
     * limpieza seguía haciendo algo.
     *
     * Con un cultivar de tres términos sí se distinguen: la limpieza conserva
     * `hoffmannii` y el último recurso lo tira.
     */
    const c = nombresCandidatos("Acalypha wilkesiana hoffmannii (rojo)");
    expect(c).toContain("acalypha-wilkesiana-hoffmannii");
    expect(c.indexOf("acalypha-wilkesiana-hoffmannii")).toBeLessThan(
      c.indexOf("acalypha-wilkesiana")
    );
  });

  it("descarta también un paréntesis SIN CERRAR", () => {
    /*
     * Real: «Acokanthera oblongifolia ( laurel toxico». Alguien empezó el
     * paréntesis y no lo cerró; con una expresión que exija el cierre, este
     * producto se queda sin foto para siempre.
     */
    expect(nombresCandidatos("Acokanthera oblongifolia ( laurel toxico")).toContain(
      "acokanthera-oblongifolia"
    );
  });

  it("aguanta caracteres sueltos y espacios dobles", () => {
    // Real: «Acacia?cyclops (acacia  majorera)»
    expect(nombresCandidatos("Acacia?cyclops (acacia  majorera)")).toContain("acacia-cyclops");
  });

  it("aguanta comillas", () => {
    // Real: «Delonix Regia "flavida"». Con las comillas dentro, el slug exacto
    // sale igual, así que lo que se comprueba es que la LIMPIEZA no las deja
    // convertidas en guiones sueltos.
    const c = nombresCandidatos('Acalypha wilkesiana "hoffmannii"');
    expect(c).toContain("acalypha-wilkesiana-hoffmannii");
  });

  it("un carácter suelto no parte el nombre en dos", () => {
    // Real: «Acacia?cyclops». Sin limpiar, la interrogación se vuelve guion y
    // el nombre se convierte en otro distinto.
    const c = nombresCandidatos("Acalypha?wilkesiana hoffmannii");
    expect(c).toContain("acalypha-wilkesiana-hoffmannii");
  });

  it("quita los sufijos de indeterminación", () => {
    // Real: «Dracaena fragans sp». `sp`, `spp`, `var` y `cv` no son el nombre.
    expect(nombresCandidatos("Dracaena fragans sp")).toContain("dracaena-fragans");
    expect(nombresCandidatos("Aeonium spp.")).toContain("aeonium");
  });

  it("cae a género y especie como ÚLTIMO recurso", () => {
    /*
     * «Acalypha wilkesiana» acepta la foto de `acalypha-wilkesiana-hoffmannii`,
     * que es un cultivar de la misma especie: se reconoce igual y es mejor que
     * no enseñar nada. Pero va la última, para que nunca gane a la exacta.
     */
    const c = nombresCandidatos("Acalypha wilkesiana");
    expect(c[c.length - 1]).toBe("acalypha-wilkesiana");
  });

  it("no repite candidatos cuando el nombre ya está limpio", () => {
    // Un nombre correcto no debe provocar tres sondeos idénticos a la red.
    expect(nombresCandidatos("Quercus ilex")).toEqual(["quercus-ilex"]);
  });

  it("un nombre de una sola palabra no se rompe", () => {
    expect(nombresCandidatos("Drago")).toEqual(["drago"]);
  });

  it("devuelve lista vacía si no hay nombre", () => {
    for (const v of ["", null, undefined, "   ", "???"]) {
      expect(nombresCandidatos(v)).toEqual([]);
    }
  });

  it("NO empareja dos especies distintas del mismo género", () => {
    /*
     * El límite de la tolerancia. `Acacia dealbata` no puede acabar enseñando la
     * foto de `acacia-cyclops`: son plantas distintas y la foto sería una
     * mentira. Por eso el último recurso es género + ESPECIE, no sólo género.
     */
    const c = nombresCandidatos("Acacia dealbata");
    expect(c.every((x) => x.startsWith("acacia-dealbata"))).toBe(true);
    expect(c).not.toContain("acacia");
  });
});
