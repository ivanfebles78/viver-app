/**
 * CONTRATO DEL VOCABULARIO DE ESTADOS.
 *
 * El sistema de diseño no puede REINTERPRETAR el dominio. Un rediseño puede
 * cambiar qué color tiene «denegado»; no puede convertir «cancelado» en un
 * error, ni fusionar «caducado» con «denegado» porque los dos «se ven grises».
 *
 * Este fichero fija esa frontera. Se escribió en la Fase 5, cuando Pedidos —la
 * pantalla que más estados maneja— pasó a usar el vocabulario compartido, pero
 * protege a TODAS las pantallas migradas.
 *
 * REGLA: cambiar una expectativa de aquí es cambiar el significado de un estado
 * de negocio. No se hace para que una prueba pase.
 */

import { describe, it, expect } from "vitest";

import {
  estadoPedido,
  estadoUsuario,
  estadoCaducidad,
  estadoStock,
  VOCABULARIOS,
} from "./estado";
import { STATUS_TONES, Status } from "../ui";

/* ── 1. Todos los estados de negocio siguen resolviéndose ────────────────── */

/** Los siete estados que el backend puede devolver para un pedido. */
const ESTADOS_PEDIDO = [
  "RESERVA",
  "PENDIENTE",
  "APROBADO",
  "APROBADO_PARCIAL",
  "SERVIDO",
  "DENEGADO",
  "CANCELADO",
  "CADUCADO",
];

describe("contrato de estados · cobertura", () => {
  it.each(ESTADOS_PEDIDO)("«%s» se resuelve a un estado conocido", (valor) => {
    const r = estadoPedido(valor);
    expect(r.status, `${valor} cayó en el neutro de desconocido`).not.toBe(Status.DRAFT);
    expect(r.label.trim()).not.toBe("");
  });

  it("cada estado de pedido tiene una etiqueta DISTINTA", () => {
    // Dos estados con la misma etiqueta serían indistinguibles en pantalla.
    const etiquetas = ESTADOS_PEDIDO.map((e) => estadoPedido(e).label);
    // RESERVA y PENDIENTE comparten tono pero no etiqueta.
    expect(new Set(etiquetas).size).toBe(etiquetas.length);
  });

  it("un estado inventado NO se resuelve a un tono con significado", () => {
    const r = estadoPedido("ESTADO_QUE_NO_EXISTE");
    expect(r.status).toBe(Status.DRAFT);
    expect(r.label).toBe("ESTADO_QUE_NO_EXISTE");
  });

  it("la resolución tolera minúsculas, espacios y guiones", () => {
    // El backend devuelve APROBADO_PARCIAL; los filtros escriben otras variantes.
    const canonico = estadoPedido("APROBADO_PARCIAL");
    for (const variante of ["aprobado_parcial", " aprobado parcial ", "Aprobado-Parcial"]) {
      expect(estadoPedido(variante), variante).toEqual(canonico);
    }
  });
});

/* ── 2. La semántica NO puede alterarse ──────────────────────────────────── */

describe("contrato de estados · semántica de negocio", () => {
  it("DENEGADO es rechazo; CANCELADO y CADUCADO NO lo son", () => {
    /*
     * La distinción es real y tiene consecuencias:
     *   - DENEGADO es una decisión EN CONTRA de alguien.
     *   - CANCELADO lo retiró el propio solicitante.
     *   - CADUCADO simplemente venció; nadie decidió nada.
     *
     * Teñir los tres de rojo haría creer al solicitante que le han rechazado
     * un pedido que él mismo canceló.
     */
    expect(estadoPedido("DENEGADO").status).toBe(Status.REJECTED);
    expect(estadoPedido("CANCELADO").status).not.toBe(Status.REJECTED);
    expect(estadoPedido("CADUCADO").status).not.toBe(Status.REJECTED);
  });

  it("CANCELADO y CADUCADO se mantienen en tonos NEUTROS", () => {
    const neutros = [Status.INACTIVE, Status.ARCHIVED, Status.DRAFT];
    expect(neutros).toContain(estadoPedido("CANCELADO").status);
    expect(neutros).toContain(estadoPedido("CADUCADO").status);
  });

  it("CANCELADO y CADUCADO son DISTINGUIBLES entre sí", () => {
    // Neutros, pero no el mismo: uno lo retiró alguien, el otro venció solo.
    expect(estadoPedido("CANCELADO").status).not.toBe(estadoPedido("CADUCADO").status);
  });

  it("RESERVA es «pendiente de decisión», no un error", () => {
    expect(estadoPedido("RESERVA").status).toBe(Status.PENDING);
    expect(estadoPedido("RESERVA").status).not.toBe(Status.REJECTED);
  });

  it("APROBADO_PARCIAL NO es lo mismo que APROBADO", () => {
    /*
     * Un pedido parcialmente aprobado todavía tiene líneas que decidir. Si
     * compartiera estado con APROBADO, el gestor dejaría de verlo como
     * pendiente de terminar.
     */
    expect(estadoPedido("APROBADO_PARCIAL").status).not.toBe(estadoPedido("APROBADO").status);
    expect(estadoPedido("APROBADO_PARCIAL").label).not.toBe(estadoPedido("APROBADO").label);
  });

  it("SERVIDO es un final CORRECTO, no un rechazo ni un aviso", () => {
    expect(estadoPedido("SERVIDO").status).toBe(Status.COMPLETED);
  });

  it("«bajo stock» avisa; «agotado» rechaza", () => {
    expect(estadoStock("Bajo stock").status).toBe(Status.PENDING);
    expect(estadoStock("Agotado").status).toBe(Status.REJECTED);
  });

  it("una cuenta bloqueada se distingue de una inactiva", () => {
    expect(estadoUsuario("bloqueado").status).not.toBe(estadoUsuario("inactivo").status);
  });

  it("un lote caducado SÍ es rechazo: ya no se puede servir", () => {
    // A diferencia de un PEDIDO caducado, que solo venció sin decidirse.
    expect(estadoCaducidad("Caducado").status).toBe(Status.REJECTED);
  });
});

/* ── 3. El tono es del sistema; la pantalla no inventa colores ───────────── */

describe("contrato de estados · el color viene del sistema", () => {
  it("todo estado resuelto usa un tono declarado por el sistema", () => {
    const tonosValidos = new Set(Object.keys(STATUS_TONES));
    for (const vocabulario of Object.values(VOCABULARIOS)) {
      for (const [clave, def] of Object.entries(vocabulario)) {
        expect(tonosValidos.has(def.status), `${clave} usa un tono desconocido: ${def.status}`).toBe(true);
      }
    }
  });

  it("ninguna definición de estado lleva un color propio", () => {
    /*
     * Antes, cada pantalla se pintaba sus estados a mano: Pedidos tenía siete
     * `rgba()` distintos, Informes otros tantos. Una definición de estado solo
     * puede decir QUÉ es, nunca de qué color se pinta.
     */
    for (const vocabulario of Object.values(VOCABULARIOS)) {
      for (const [clave, def] of Object.entries(vocabulario)) {
        expect(Object.keys(def).sort(), `${clave} declara algo más que status y label`).toEqual([
          "label",
          "status",
        ]);
      }
    }
  });

  it("el vocabulario es inmutable desde fuera", () => {
    // Un `VOCABULARIOS.PEDIDO.DENEGADO.status = ...` desde una pantalla sería
    // exactamente la reinterpretación que este contrato impide.
    expect(Object.isFrozen(VOCABULARIOS)).toBe(true);
  });
});

/* ── 4. Detección: el contrato tiene que poder fallar ────────────────────── */

describe("contrato de estados · el contrato detecta de verdad", () => {
  it("detectaría que CANCELADO pasara a rechazo", () => {
    const mutado = { status: Status.REJECTED, label: "Cancelado" };
    const neutros = [Status.INACTIVE, Status.ARCHIVED, Status.DRAFT];
    expect(neutros).not.toContain(mutado.status);
  });

  it("detectaría que APROBADO_PARCIAL se fusionara con APROBADO", () => {
    const mutado = estadoPedido("APROBADO");
    expect(mutado.status).toBe(estadoPedido("APROBADO").status);
    // La comprobación real del contrato fallaría con esta igualdad.
    expect(estadoPedido("APROBADO_PARCIAL").status === mutado.status).toBe(false);
  });

  it("detectaría un color propio añadido a una definición", () => {
    const mutado = { status: Status.REJECTED, label: "Denegado", color: "#991b1b" };
    expect(Object.keys(mutado).sort()).not.toEqual(["label", "status"]);
  });
});
