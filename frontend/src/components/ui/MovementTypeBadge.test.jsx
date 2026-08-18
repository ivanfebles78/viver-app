/**
 * REGRESIÓN — diferenciación de los tipos de movimiento.
 *
 * DEFECTO: `ENTRADA`, `SALIDA` y `TRASLADO` se pintaban con una insignia de la
 * misma forma y el mismo contorno, y solo cambiaba el tono. Al recorrer una
 * tabla larga se leían iguales, y el color es lo primero que se pierde al
 * escanear rápido o con una deficiencia de visión del color.
 *
 * Estas pruebas fijan que la diferencia va por TRES canales —forma, texto y
 * tono— y que ninguno de ellos puede desaparecer sin que salte una prueba.
 */

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import MovementTypeBadge from "./MovementTypeBadge";
import {
  TIPOS_MOVIMIENTO,
  TIPO_MOVIMIENTO_DESCONOCIDO,
  definicionTipoMovimiento,
} from "./movementType";

const TIPOS = [
  ["entrada", "Entrada"],
  ["salida", "Salida"],
  ["traslado_interno", "Traslado"],
  ["devolucion", "Devolución"],
];

describe("MovementTypeBadge · el texto nunca desaparece", () => {
  it.each(TIPOS)("«%s» conserva su etiqueta explícita", (tipo, label) => {
    // El icono se AÑADE al texto; no lo sustituye. Un icono a solas dejaría el
    // tipo sin nombre para quien no lo reconozca.
    render(<MovementTypeBadge tipo={tipo} label={label} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("un tipo desconocido también muestra texto", () => {
    render(<MovementTypeBadge tipo="lo_que_sea" label="—" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("MovementTypeBadge · la forma distingue los tipos", () => {
  const iconoDe = (tipo, label) => {
    const { container, unmount } = render(<MovementTypeBadge tipo={tipo} label={label} />);
    const svg = container.querySelector("svg");
    const firma = svg ? svg.innerHTML : null;
    unmount();
    return firma;
  };

  it("los cuatro tipos usan CUATRO iconos distintos entre sí", () => {
    /*
     * Es el núcleo de la corrección: si dos tipos compartieran icono,
     * volverían a distinguirse solo por color.
     */
    const firmas = TIPOS.map(([t, l]) => iconoDe(t, l));
    expect(firmas.every(Boolean)).toBe(true);
    expect(new Set(firmas).size).toBe(4);
  });

  it("el tipo desconocido no se parece a ninguno de los cuatro", () => {
    // Un dato corrupto tiene que notarse, no disfrazarse de movimiento válido.
    const validas = TIPOS.map(([t, l]) => iconoDe(t, l));
    const desconocida = iconoDe("nada_de_esto", "—");
    expect(validas).not.toContain(desconocida);
  });

  it("cada tipo pinta exactamente un icono", () => {
    for (const [tipo, label] of TIPOS) {
      const { container, unmount } = render(<MovementTypeBadge tipo={tipo} label={label} />);
      expect(container.querySelectorAll("svg"), tipo).toHaveLength(1);
      unmount();
    }
  });
});

describe("MovementTypeBadge · el tono semántico se conserva", () => {
  it("cada tipo conserva el tono que se PRETENDÍA antes de la corrección", () => {
    /*
     * Antes se pasaban a `StatusBadge` como si fueran estados: «success»,
     * «danger», «info» y «warning». Ninguno es un estado válido, así que los
     * cuatro caían a `draft` y salían idénticos. Aquí se conserva la INTENCIÓN
     * original, ya aplicada de verdad sobre `Badge`, que sí acepta tonos.
     *
     * «warning» tampoco existe como tono: el ámbar del sistema es `pending`.
     */
    expect(definicionTipoMovimiento("entrada").tono).toBe("success");
    expect(definicionTipoMovimiento("salida").tono).toBe("danger");
    expect(definicionTipoMovimiento("traslado_interno").tono).toBe("info");
    expect(definicionTipoMovimiento("devolucion").tono).toBe("pending");
  });

  it("los cuatro tonos son tonos VÁLIDOS del sistema", () => {
    // Es la comprobación que habría cazado el defecto original.
    const VALIDOS = ["neutral", "info", "pending", "review", "progress", "success", "danger", "hold"];
    for (const [tipo, def] of Object.entries(TIPOS_MOVIMIENTO)) {
      expect(VALIDOS, tipo).toContain(def.tono);
    }
    expect(VALIDOS).toContain(TIPO_MOVIMIENTO_DESCONOCIDO.tono);
  });

  it("los cuatro tonos son distintos entre sí", () => {
    const tonos = Object.values(TIPOS_MOVIMIENTO).map((d) => d.tono);
    expect(new Set(tonos).size).toBe(4);
  });

  it("el desconocido cae en un tono neutro, distinto de los cuatro válidos", () => {
    expect(TIPO_MOVIMIENTO_DESCONOCIDO.tono).toBe("neutral");
    expect(Object.values(TIPOS_MOVIMIENTO).map((d) => d.tono)).not.toContain("neutral");
  });
});

describe("MovementTypeBadge · resolución segura del tipo", () => {
  it("no distingue mayúsculas", () => {
    expect(definicionTipoMovimiento("ENTRADA")).toBe(TIPOS_MOVIMIENTO.entrada);
    expect(definicionTipoMovimiento("Salida")).toBe(TIPOS_MOVIMIENTO.salida);
  });

  it("un valor nulo, vacío o de otro tipo cae en el desconocido sin romper", () => {
    for (const v of [null, undefined, "", "  ", 0, 42, {}, []]) {
      expect(definicionTipoMovimiento(v), String(v)).toBe(TIPO_MOVIMIENTO_DESCONOCIDO);
    }
  });
});

describe("MovementTypeBadge · accesibilidad", () => {
  it("el icono es decorativo: no se anuncia dos veces el tipo", () => {
    const { container } = render(<MovementTypeBadge tipo="entrada" label="Entrada" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("el nombre accesible de la insignia es la etiqueta, sin ruido del icono", () => {
    render(<MovementTypeBadge tipo="traslado_interno" label="Traslado" />);
    const texto = screen.getByText("Traslado");
    expect(texto.textContent).toBe("Traslado");
    expect(within(texto).queryByRole("img")).not.toBeInTheDocument();
  });
});

/* ── Mutación: la prueba tiene que DETECTAR la reintroducción ───────────── */

describe("mutación · se detecta que dos tipos vuelvan a compartir forma", () => {
  const detecta = (firmas) => {
    try {
      expect(new Set(firmas).size).toBe(firmas.length);
      return "no detecta";
    } catch {
      return "detecta";
    }
  };

  it("el estado real cumple: cuatro iconos, cuatro formas", () => {
    const reales = Object.values(TIPOS_MOVIMIENTO).map((d) => d.nombreIcono);
    expect(detecta(reales)).toBe("no detecta");
  });

  it("si entrada y salida compartieran icono, la prueba fallaría", () => {
    // Es exactamente el estado anterior a la corrección llevado al extremo.
    const mutadas = ["ArrowDownToLine", "ArrowDownToLine", "ArrowLeftRight", "Undo2"];
    expect(detecta(mutadas)).toBe("detecta");
  });

  it("si el icono sustituyera al texto, la prueba de etiqueta fallaría", () => {
    // Se comprueba el contrato: la etiqueta es obligatoria y visible.
    render(<MovementTypeBadge tipo="entrada" label="Entrada" />);
    expect(screen.getByText("Entrada")).toBeVisible();
  });
});
