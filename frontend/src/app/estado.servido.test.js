/**
 * SERVIDO NO ES APROBADO — y ninguna pantalla puede decidir lo contrario.
 *
 * Los dos son finales correctos del flujo, y por eso una fase anterior pintó
 * SERVIDO de verde: si aprobar es verde y servir es el final bueno, servir
 * también debería serlo. El razonamiento tenía un fallo que sólo se ve en una
 * tabla real: con veinte pedidos en pantalla, dos verdes que significan cosas
 * distintas son un solo color, y hay que LEER cada fila para saber cuáles
 * siguen pendientes de servir. Que es justo el trabajo que el tono venía a
 * ahorrar.
 *
 * El verde responde a «¿se aprobó?». El azul, a «¿dónde está ahora?». Son
 * preguntas distintas y por eso llevan respuestas distintas.
 *
 * La segunda mitad del fichero es la que importa a largo plazo. La colisión no
 * apareció porque alguien eligiera mal un color: apareció porque Aprobaciones
 * tenía su PROPIA tabla de estados (`ESTADO_ITEM_STATUS`), y al corregir el
 * vocabulario compartido esa copia se quedó atrás sin que nada fallara. Un
 * mapa por pantalla no es un detalle de estilo: es el mecanismo por el que la
 * corrección se pierde. Por eso aquí se comprueba, leyendo el código fuente,
 * que ninguna pantalla vuelva a tener el suyo.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { estadoPedido, estadoLinea, VOCABULARIOS } from "./estado";
import { STATUS_TONES, Status, StatusTone } from "../ui";

const tono = (def) => STATUS_TONES[def.status];

/* ══ 1. El mapa canónico ═══════════════════════════════════════════════ */

describe("mapa canónico de estados de pedido", () => {
  it("PENDIENTE avisa de que falta decidir (ámbar)", () => {
    expect(tono(estadoPedido("PENDIENTE"))).toBe(StatusTone.PENDING);
    expect(tono(estadoPedido("RESERVA"))).toBe(StatusTone.PENDING);
  });

  it("APROBADO es éxito (verde)", () => {
    expect(tono(estadoPedido("APROBADO"))).toBe(StatusTone.SUCCESS);
  });

  it("SERVIDO NO es éxito", () => {
    expect(tono(estadoPedido("SERVIDO"))).not.toBe(StatusTone.SUCCESS);
  });

  it("SERVIDO es información (azul)", () => {
    expect(tono(estadoPedido("SERVIDO"))).toBe(StatusTone.INFO);
    expect(estadoPedido("SERVIDO").status).toBe(Status.DELIVERED);
  });

  it("DENEGADO es peligro (rojo)", () => {
    expect(tono(estadoPedido("DENEGADO"))).toBe(StatusTone.DANGER);
  });

  it("CANCELADO es neutro (gris)", () => {
    /*
     * Neutro y no rojo: un pedido lo cancela normalmente quien lo pidió. Es un
     * final ordinario, no una decisión en contra, y teñirlo de rojo lo
     * confundiría con DENEGADO.
     */
    expect(tono(estadoPedido("CANCELADO"))).toBe(StatusTone.NEUTRAL);
  });

  it("CADUCADO es neutro (gris)", () => {
    // Simplemente venció; nadie lo denegó.
    expect(tono(estadoPedido("CADUCADO"))).toBe(StatusTone.NEUTRAL);
  });

  it("un estado desconocido cae en neutro sin inventarse un color", () => {
    const def = estadoPedido("ESTADO_QUE_EL_BACKEND_AÑADIRÁ_MAÑANA");
    expect(tono(def)).toBe(StatusTone.NEUTRAL);
    // Y conserva el texto, para que se vea qué llegó en lugar de un hueco.
    expect(def.label).toBe("ESTADO_QUE_EL_BACKEND_AÑADIRÁ_MAÑANA");
  });

  it("APROBADO y SERVIDO no comparten ni estado ni tono", () => {
    expect(estadoPedido("SERVIDO").status).not.toBe(estadoPedido("APROBADO").status);
    expect(tono(estadoPedido("SERVIDO"))).not.toBe(tono(estadoPedido("APROBADO")));
  });

  it("el color no es el único indicador: cada uno conserva su texto", () => {
    expect(estadoPedido("APROBADO").label).toBe("Aprobado");
    expect(estadoPedido("SERVIDO").label).toBe("Servido");
  });
});

/* ══ 2. Las líneas siguen el mismo vocabulario ═════════════════════════ */

describe("estados de LÍNEA (Aprobaciones)", () => {
  it("una línea servida se lee igual que un pedido servido", () => {
    // Son el mismo hecho a dos escalas. Pintarlos distinto sugeriría una
    // diferencia que no existe.
    expect(estadoLinea("SERVIDO").status).toBe(estadoPedido("SERVIDO").status);
    expect(estadoLinea("APROBADO").status).toBe(estadoPedido("APROBADO").status);
    expect(estadoLinea("DENEGADO").status).toBe(estadoPedido("DENEGADO").status);
  });

  it("una línea servida no es verde", () => {
    expect(tono(estadoLinea("SERVIDO"))).not.toBe(StatusTone.SUCCESS);
    expect(tono(estadoLinea("SERVIDO"))).toBe(StatusTone.INFO);
  });

  it("una línea con estado desconocido cae en neutro", () => {
    expect(tono(estadoLinea("LO_QUE_SEA"))).toBe(StatusTone.NEUTRAL);
  });
});

/* ══ 3. Ninguna pantalla elige colores por su cuenta ═══════════════════ */

const RAIZ = resolve(process.cwd(), "src");

function fuentes(dir) {
  const out = [];
  for (const entrada of readdirSync(dir)) {
    const completo = join(dir, entrada);
    if (statSync(completo).isDirectory()) {
      // `src/ui` es el paquete vendorizado: ahí SÍ vive la tabla canónica.
      if (entrada === "ui") continue;
      out.push(...fuentes(completo));
    } else if (/\.(jsx?|tsx?)$/.test(entrada) && !/\.test\./.test(entrada)) {
      out.push(completo);
    }
  }
  return out;
}

/** Los valores literales del sistema de estados, tal y como se escribirían. */
const VALORES_STATUS = Object.values(Status).join("|");

/** Los estados de NEGOCIO de un pedido o de una línea. */
const ESTADOS_NEGOCIO = [
  "RESERVA",
  "PENDIENTE",
  "APROBADO",
  "APROBADO_PARCIAL",
  "SERVIDO",
  "DENEGADO",
  "CANCELADO",
  "CADUCADO",
].join("|");

/**
 * Una tabla propia se reconoce por su forma: un estado de negocio como clave y
 * un valor del sistema de estados como valor. `SERVIDO: "completed"`.
 *
 * La comprobación se limita a ESA forma a propósito. Una versión anterior
 * buscaba cualquier literal de `Status` en cualquier fichero y sacaba once
 * resultados, todos legítimos: el indicador de un conductor degradado, el de un
 * préstamo devuelto, el aviso de existencias bajo mínimo. Son vocabularios
 * distintos, no copias de éste, y una lista blanca de nueve ficheros para
 * silenciarlos habría dejado la comprobación sin nada que decir.
 */
const TABLA_PROPIA = new RegExp(
  // Cadena normal y no plantilla, a propósito: dentro de una plantilla `\s` no
  // es un escape válido y el motor se come la barra, con lo que el patrón
  // acababa buscando una «s» literal y no casaba con nada. La primera versión de
  // esta comprobación tenía ese fallo y no detectaba NADA; se descubrió al
  // reintroducir la tabla a propósito, que es justo para lo que sirve mutar.
  "(" + ESTADOS_NEGOCIO + ")\\s*:\\s*[\"'\\u0060](" + VALORES_STATUS + ")[\"'\\u0060]"
);

describe("ninguna pantalla mantiene su propio mapa de estados de pedido", () => {
  it("nadie fuera de estado.js traduce un estado de negocio a un tono", () => {
    const infractores = [];

    for (const fichero of fuentes(RAIZ)) {
      const relativo = fichero.slice(RAIZ.length + 1).split("\\").join("/");
      if (relativo === "app/estado.js") continue;
      const texto = readFileSync(fichero, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      const m = texto.match(TABLA_PROPIA);
      if (m) infractores.push(`${relativo} → ${m[0]}`);
    }

    expect(infractores).toEqual([]);
  });

  it("Aprobaciones no puede llevar SERVIDO a verde por su cuenta", () => {
    const texto = readFileSync(join(RAIZ, "pages", "Aprobaciones.jsx"), "utf8");
    // Ni la tabla que tenía, ni ninguna otra.
    expect(texto).not.toMatch(/ESTADO_ITEM_STATUS/);
    expect(texto).toMatch(/estadoLinea|estadoPedido/);
  });

  it("Pedidos no puede llevar SERVIDO a verde por su cuenta", () => {
    const texto = readFileSync(join(RAIZ, "pages", "Pedidos.jsx"), "utf8");
    expect(texto).toMatch(/estadoPedido/);
  });
});

/* ══ 4. El vocabulario expuesto sigue completo ═════════════════════════ */

describe("vocabulario", () => {
  it("expone pedido y línea para poblar filtros y pruebas", () => {
    expect(Object.keys(VOCABULARIOS.pedido)).toContain("SERVIDO");
    expect(Object.keys(VOCABULARIOS.linea)).toContain("SERVIDO");
  });
});
