/**
 * Pruebas del mapeo de estados de negocio.
 *
 * Lo que se protege aquí no es el color: es que el SIGNIFICADO no se mueva.
 * Un pedido denegado y uno caducado tienen que seguir distinguiéndose, y el
 * verde no puede acabar significando dos cosas.
 */

import { describe, it, expect } from "vitest";
import { estadoPedido, estadoUsuario, estadoCaducidad, VOCABULARIOS } from "./estado";
import { Status, STATUS_TONES, StatusTone } from "../ui";

/** Tono efectivo de un estado de negocio, resolviendo por el sistema. */
const tono = (resuelto) => STATUS_TONES[resuelto.status];

describe("estados de pedido", () => {
  it("conserva la etiqueta de negocio", () => {
    expect(estadoPedido("APROBADO_PARCIAL").label).toBe("Aprobado parcial");
    expect(estadoPedido("RESERVA").label).toBe("Reserva");
    expect(estadoPedido("DENEGADO").label).toBe("Denegado");
  });

  it("aprobado, servido y activo son verdes (éxito)", () => {
    expect(tono(estadoPedido("APROBADO"))).toBe(StatusTone.SUCCESS);
    expect(tono(estadoPedido("SERVIDO"))).toBe(StatusTone.SUCCESS);
  });

  it("denegado es el ÚNICO estado de pedido en rojo", () => {
    // Regla del encargo: rojo = error/destructivo. Solo una decisión en contra
    // lo merece; un pedido cancelado o caducado no es un error.
    const rojos = Object.keys(VOCABULARIOS.pedido).filter(
      (k) => tono(estadoPedido(k)) === StatusTone.DANGER
    );
    expect(rojos).toEqual(["DENEGADO"]);
  });

  it("reserva y pendiente son ámbar (espera)", () => {
    expect(tono(estadoPedido("RESERVA"))).toBe(StatusTone.PENDING);
    expect(tono(estadoPedido("PENDIENTE"))).toBe(StatusTone.PENDING);
  });

  it("cancelado y caducado son neutros, no rojos", () => {
    expect(tono(estadoPedido("CANCELADO"))).toBe(StatusTone.NEUTRAL);
    expect(tono(estadoPedido("CADUCADO"))).toBe(StatusTone.NEUTRAL);
  });

  it("aprobado parcial se distingue de aprobado", () => {
    // Si ambos fueran verdes, el gestor no vería de un vistazo cuáles le
    // quedan por terminar de decidir.
    expect(tono(estadoPedido("APROBADO_PARCIAL"))).not.toBe(tono(estadoPedido("APROBADO")));
  });

  it("normaliza mayúsculas, espacios y separadores", () => {
    expect(estadoPedido(" aprobado ").label).toBe("Aprobado");
    expect(estadoPedido("aprobado parcial").label).toBe("Aprobado parcial");
    expect(estadoPedido("APROBADO-PARCIAL").label).toBe("Aprobado parcial");
  });

  it("un estado desconocido no se inventa un color", () => {
    // Cae en neutro y conserva el texto tal cual: si el backend añade un
    // estado, la interfaz lo muestra en vez de teñirlo por accidente.
    const r = estadoPedido("EN_TRANSITO");
    expect(r.status).toBe(Status.DRAFT);
    expect(tono(r)).toBe(StatusTone.NEUTRAL);
    expect(r.label).toBe("EN_TRANSITO");
  });

  it("un valor vacío no revienta", () => {
    for (const v of [null, undefined, "", "   "]) {
      expect(() => estadoPedido(v)).not.toThrow();
      expect(estadoPedido(v).label).toBe("—");
    }
  });
});

describe("estados de usuario", () => {
  it("mapea los cuatro estados reales", () => {
    expect(estadoUsuario("activo").label).toBe("Activo");
    expect(estadoUsuario("pendiente").label).toBe("Pendiente");
    expect(estadoUsuario("inactivo").label).toBe("Inactivo");
    expect(estadoUsuario("bloqueado").label).toBe("Bloqueado");
  });

  it("activo es verde y bloqueado es rojo", () => {
    expect(tono(estadoUsuario("activo"))).toBe(StatusTone.SUCCESS);
    expect(tono(estadoUsuario("bloqueado"))).toBe(StatusTone.DANGER);
  });

  it("inactivo es neutro, no rojo", () => {
    // Revocar el acceso conservando el histórico no es un fallo.
    expect(tono(estadoUsuario("inactivo"))).toBe(StatusTone.NEUTRAL);
  });
});

describe("estados de caducidad", () => {
  it("vigente / próximo / caducado se distinguen entre sí", () => {
    const tonos = ["vigente", "proximo_a_caducar", "caducado"].map((v) => tono(estadoCaducidad(v)));
    expect(new Set(tonos).size).toBe(3);
  });

  it("acepta la forma con tildes y espacios que usa la aplicación", () => {
    expect(estadoCaducidad("Próximo a caducar").label).toBe("Próximo a caducar");
  });
});

describe("invariantes del sistema de estados", () => {
  it("todo estado mapeado existe en el vocabulario de DevCon8", () => {
    const validos = new Set(Object.values(Status));
    for (const [vocab, tabla] of Object.entries(VOCABULARIOS)) {
      for (const [clave, def] of Object.entries(tabla)) {
        expect(validos.has(def.status), `${vocab}.${clave} → ${def.status}`).toBe(true);
      }
    }
  });

  it("todo estado tiene etiqueta legible, nunca la clave cruda", () => {
    for (const tabla of Object.values(VOCABULARIOS)) {
      for (const def of Object.values(tabla)) {
        expect(def.label.trim().length).toBeGreaterThan(0);
        expect(def.label).not.toMatch(/^[A-Z_]+$/);
      }
    }
  });

  it("ninguna pantalla necesita elegir un color: el mapeo es total", () => {
    // Los 8 estados de pedido que el backend emite están cubiertos.
    const delBackend = [
      "RESERVA", "PENDIENTE", "APROBADO", "APROBADO_PARCIAL",
      "SERVIDO", "DENEGADO", "CANCELADO", "CADUCADO",
    ];
    for (const e of delBackend) {
      expect(estadoPedido(e).status, e).not.toBe(Status.DRAFT);
    }
  });
});
