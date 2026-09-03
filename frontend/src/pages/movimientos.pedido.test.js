/**
 * FILTRO POR Nº DE PEDIDO.
 *
 * Va en su propio fichero y no en `movimientos.equivalence.test.js` porque
 * aquél compara `filtrarMovimientos` con una copia literal de la versión
 * anterior: es una red contra cambios ACCIDENTALES en las reglas que ya
 * existían. Esta regla es nueva y deliberada, así que allí no tiene contrario
 * con el que compararse — sigue verde porque el filtro es inerte mientras el
 * campo esté vacío, que es justamente la propiedad que aquí se fija.
 */

import { describe, expect, it } from "vitest";

import { filtrarMovimientos, parsearNumeroPedido } from "./movimientos.logic";

function mov(extra = {}) {
  return {
    id: 1,
    pedido_id: null,
    producto_id: 5,
    producto_nombre_cientifico: "Phoenix canariensis",
    producto_nombre_natural: "Palmera canaria",
    tipo_movimiento: "salida",
    origen_tipo: "Vivero",
    destino_tipo: "Empresa",
    zona_origen: "3a",
    zona_destino: null,
    uuid_lote: "uuid-abc-001",
    fecha_movimiento: "2026-02-10T09:30:00",
    ...extra,
  };
}

const ids = (lista) => lista.map((m) => m.id);

/* ── Lo tecleado ───────────────────────────────────────────────────────── */

describe("parsearNumeroPedido", () => {
  it("sin texto no restringe nada", () => {
    for (const vacio of ["", "   ", null, undefined]) {
      expect(parsearNumeroPedido(vacio)).toBeNull();
    }
  });

  it("acepta el número tal cual", () => {
    expect(parsearNumeroPedido("128")).toBe(128);
  });

  it("acepta la almohadilla con la que se muestra en pantalla", () => {
    expect(parsearNumeroPedido("#128")).toBe(128);
    expect(parsearNumeroPedido("  #128  ")).toBe(128);
  });

  it("acepta los ceros a la izquierda de un documento", () => {
    expect(parsearNumeroPedido("0128")).toBe(128);
  });

  it("lo que no es un número no coincide con nada", () => {
    for (const basura of ["abc", "12a", "12 34", "-5", "1.5", "1,5", "<script>", "1 OR 1=1"]) {
      expect(parsearNumeroPedido(basura)).toBeNaN();
    }
  });

  it("una almohadilla suelta todavía no es un filtro", () => {
    // Se teclea «#» antes de «#128». Vaciar la tabla en ese instante sería
    // parpadear a mitad de escritura; queda inerte hasta que hay un número.
    expect(parsearNumeroPedido("#")).toBeNull();
  });
});

/* ── Coincidencia exacta ───────────────────────────────────────────────── */

describe("filtrarMovimientos · nº de pedido", () => {
  const MOVS = [
    mov({ id: 1, pedido_id: 12 }),
    mov({ id: 2, pedido_id: 120 }),
    mov({ id: 3, pedido_id: 512 }),
    mov({ id: 4, pedido_id: null }),
  ];

  it("encuentra el pedido exacto", () => {
    expect(ids(filtrarMovimientos(MOVS, { pedido: "12" }))).toEqual([1]);
  });

  it("NO devuelve los pedidos que solo contienen el número tecleado", () => {
    const encontrados = filtrarMovimientos(MOVS, { pedido: "12" }).map((m) => m.pedido_id);
    expect(encontrados).not.toContain(120);
    expect(encontrados).not.toContain(512);
  });

  it("un pedido inexistente no devuelve nada", () => {
    expect(filtrarMovimientos(MOVS, { pedido: "9999" })).toEqual([]);
  });

  it("un texto inválido no devuelve nada, en vez de devolverlo todo", () => {
    expect(filtrarMovimientos(MOVS, { pedido: "abc" })).toEqual([]);
  });

  it("devuelve todos los movimientos del mismo pedido", () => {
    const delMismo = [
      mov({ id: 1, pedido_id: 77 }),
      mov({ id: 2, pedido_id: 77 }),
      mov({ id: 3, pedido_id: 78 }),
    ];
    expect(ids(filtrarMovimientos(delMismo, { pedido: "77" }))).toEqual([1, 2]);
  });

  it("compara por valor: da igual que el id venga como texto", () => {
    expect(ids(filtrarMovimientos([mov({ id: 9, pedido_id: "44" })], { pedido: "44" }))).toEqual([9]);
  });
});

/* ── Movimientos sin pedido ────────────────────────────────────────────── */

describe("filtrarMovimientos · movimientos sin pedido asociado", () => {
  const MOVS = [
    mov({ id: 1, pedido_id: null, tipo_movimiento: "entrada" }),
    mov({ id: 2, pedido_id: undefined, tipo_movimiento: "traslado_interno" }),
    mov({ id: 3, pedido_id: "", tipo_movimiento: "entrada" }),
    mov({ id: 4, pedido_id: 40 }),
  ];

  it("sin filtro se ven exactamente igual que antes", () => {
    expect(filtrarMovimientos(MOVS, {})).toHaveLength(4);
    expect(filtrarMovimientos(MOVS, { pedido: "" })).toHaveLength(4);
  });

  it("con filtro quedan fuera, sin romper el filtrado", () => {
    expect(ids(filtrarMovimientos(MOVS, { pedido: "40" }))).toEqual([4]);
  });
});

/* ── Combinación con los demás filtros ─────────────────────────────────── */

describe("filtrarMovimientos · el nº de pedido se combina con el resto", () => {
  const MOVS = [
    mov({ id: 1, pedido_id: 50, producto_nombre_cientifico: "Phoenix canariensis", tipo_movimiento: "salida" }),
    mov({ id: 2, pedido_id: 50, producto_nombre_cientifico: "Dracaena draco", tipo_movimiento: "salida" }),
    mov({ id: 3, pedido_id: 50, producto_nombre_cientifico: "Phoenix canariensis", tipo_movimiento: "devolucion" }),
    mov({ id: 4, pedido_id: 51, producto_nombre_cientifico: "Phoenix canariensis", tipo_movimiento: "salida" }),
  ];

  it("con el filtro de producto", () => {
    expect(ids(filtrarMovimientos(MOVS, { pedido: "50", producto: "phoenix" }))).toEqual([1, 3]);
  });

  it("con el filtro de tipo", () => {
    expect(ids(filtrarMovimientos(MOVS, { pedido: "50", tipo: "salida" }))).toEqual([1, 2]);
  });

  it("con el filtro de fecha", () => {
    const conFechas = [
      mov({ id: 1, pedido_id: 60, fecha_movimiento: "2026-02-10T09:00:00" }),
      mov({ id: 2, pedido_id: 60, fecha_movimiento: "2026-02-11T09:00:00" }),
    ];
    expect(ids(filtrarMovimientos(conFechas, { pedido: "60", fecha: "2026-02-11" }))).toEqual([2]);
  });

  it("con zona, origen, destino y UUID a la vez", () => {
    const r = filtrarMovimientos(MOVS, {
      pedido: "50",
      zona: "3a",
      origen: "Vivero",
      destino: "Empresa",
      uuid: "abc",
    });
    expect(ids(r)).toEqual([1, 2, 3]);
  });

  it("una combinación incompatible devuelve lista vacía, no la lista entera", () => {
    expect(filtrarMovimientos(MOVS, { pedido: "50", producto: "no-existe" })).toEqual([]);
  });

  it("limpiar los filtros devuelve la lista completa", () => {
    // "Limpiar filtros" deja las ocho claves en cadena vacía.
    const limpios = {
      producto: "", tipo: "", zona: "", uuid: "",
      origen: "", destino: "", fecha: "", pedido: "",
    };
    expect(filtrarMovimientos(MOVS, limpios)).toHaveLength(MOVS.length);
  });
});
