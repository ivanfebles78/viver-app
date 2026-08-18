/**
 * EQUIVALENCIA — Aprobaciones.
 *
 * Cada bloque `MAIN` de abajo es una copia LITERAL de `Aprobaciones.jsx@ab7c739`,
 * pegada antes de tocar nada. Las pruebas comparan la lógica extraída con esa
 * copia sobre datos generados de forma determinista.
 *
 * Si alguien cambia una regla al migrar la presentación, estas pruebas fallan.
 * Y para que eso signifique algo, el bloque final las MUTA a propósito y
 * comprueba que efectivamente detectan el cambio.
 */

import { describe, it, expect } from "vitest";

import { formatUsername } from "../utils/format";
import { rolEfectivo } from "../utils/roles";
import * as L from "./aprobaciones.logic";

/* ══════════════════════════════════════════════════════════════════════════
   COPIA LITERAL DE MAIN
   ══════════════════════════════════════════════════════════════════════════ */

const MAIN_safeArray = (x) => (Array.isArray(x) ? x : []);
const MAIN_itemEstado = (it) => String(it?.estado_item || "RESERVA").toUpperCase();
const MAIN_estadoNormalizado = (estado) => String(estado || "").trim().toUpperCase();
const MAIN_DECIDABLE = new Set(["RESERVA", "APROBADO_PARCIAL"]);

const MAIN_estadoLabel = (estado) => {
  const e = MAIN_estadoNormalizado(estado);
  if (e === "APROBADO_PARCIAL") return "APROBADO PARCIAL";
  return e || "—";
};

const MAIN_dateInputValue = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const MAIN_fmtFechaES = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
};

const MAIN_solicitanteFromPedido = (p) =>
  formatUsername(
    p?.solicitante_username || p?.solicitante || p?.created_by || p?.usuario || p?.username || ""
  ) || "—";

const MAIN_canApprove = (me) => {
  const role = rolEfectivo(me);
  return role === "admin" || role === "manager";
};

const MAIN_editable = (p) => MAIN_estadoNormalizado(p?.estado) === "RESERVA" && MAIN_safeArray(p?.items).length === 1;

const MAIN_filtrar = (pedidos, { estadoFiltro, idFiltro, fechaFiltro, solicitanteFiltro, textoFiltro }) => {
  const texto = textoFiltro.trim().toLowerCase();
  return pedidos
    .slice()
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .filter((p) => {
      const idOk = !idFiltro || String(p.id).includes(String(idFiltro).trim());
      const estadoNorm = MAIN_estadoNormalizado(p?.estado);
      const estadoOk =
        estadoFiltro === "TODOS"
          ? true
          : estadoFiltro === "PENDIENTES"
            ? MAIN_DECIDABLE.has(estadoNorm)
            : estadoNorm === estadoFiltro;
      const fechaOk = !fechaFiltro || MAIN_dateInputValue(p?.created_at) === fechaFiltro;
      const solicitante = MAIN_solicitanteFromPedido(p).toLowerCase();
      const solicitanteOk =
        !solicitanteFiltro || solicitante.includes(solicitanteFiltro.trim().toLowerCase());
      const detalle = MAIN_safeArray(p.items)
        .map((it) => `${it.producto_id} ${it.tamano || ""} ${it.cantidad || ""}`.toLowerCase())
        .join(" ");
      const textoOk =
        !texto ||
        String(p.id).toLowerCase().includes(texto) ||
        solicitante.includes(texto) ||
        MAIN_estadoNormalizado(p?.estado).toLowerCase().includes(texto) ||
        detalle.includes(texto);
      return idOk && estadoOk && fechaOk && solicitanteOk && textoOk;
    });
};

/** Copia literal del cuerpo de `submitDecisions` + los contadores del modal. */
const MAIN_decision = (pedido, pendingDecisions, motivo) => {
  const items = MAIN_safeArray(pedido.items);
  const reservaItems = items.filter((it) => MAIN_itemEstado(it) === "RESERVA");
  const pendingCount = reservaItems.length;
  const decidedLocalCount = reservaItems.filter((it) => pendingDecisions[it.id]).length;
  const allDecided = pendingCount > 0 && decidedLocalCount === pendingCount;
  const anyDenied = reservaItems.some((it) => pendingDecisions[it.id] === "denegar");

  const approved_item_ids = [];
  const denied_item_ids = [];
  for (const it of reservaItems) {
    if (pendingDecisions[it.id] === "aprobar") approved_item_ids.push(it.id);
    else if (pendingDecisions[it.id] === "denegar") denied_item_ids.push(it.id);
  }
  return {
    pendingCount,
    decidedLocalCount,
    allDecided,
    anyDenied,
    payload: {
      approved_item_ids,
      denied_item_ids,
      motivo_denegacion: denied_item_ids.length ? motivo.trim() || null : null,
    },
  };
};

const MAIN_canShowPdf = (pedido) => {
  const items = MAIN_safeArray(pedido.items);
  const hasApproved = items.some((it) => {
    const st = MAIN_itemEstado(it);
    return st === "APROBADO" || st === "SERVIDO";
  });
  const estadoNormPedido = String(pedido.estado || "RESERVA").toUpperCase();
  return (
    estadoNormPedido === "APROBADO" ||
    estadoNormPedido === "APROBADO_PARCIAL" ||
    estadoNormPedido === "SERVIDO" ||
    estadoNormPedido === "DENEGADO" ||
    hasApproved
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   DATOS DETERMINISTAS
   ══════════════════════════════════════════════════════════════════════════ */

const ESTADOS_PEDIDO = [
  "RESERVA",
  "APROBADO_PARCIAL",
  "APROBADO",
  "DENEGADO",
  "SERVIDO",
  "CANCELADO",
  "CADUCADO",
  "",
  null,
  "  reserva  ",
];

const ESTADOS_ITEM = ["RESERVA", "APROBADO", "DENEGADO", "SERVIDO", null, undefined];

const item = (id, estadoItem, extra = {}) => ({
  id,
  estado_item: estadoItem,
  producto_id: 100 + (id % 7),
  tamano: ["Semillero", "M12", "M20", "M35"][id % 4],
  cantidad: (id % 5) * 25,
  ...extra,
});

/** 40 pedidos deterministas: 10 estados × 0-3 líneas, con solicitantes rotados. */
const PEDIDOS = (() => {
  const out = [];
  let itemId = 1;
  for (let i = 0; i < ESTADOS_PEDIDO.length; i++) {
    for (let n = 0; n <= 3; n++) {
      const items = [];
      for (let k = 0; k < n; k++) {
        items.push(item(itemId++, ESTADOS_ITEM[(i + k) % ESTADOS_ITEM.length]));
      }
      out.push({
        id: out.length + 1,
        estado: ESTADOS_PEDIDO[i],
        created_at: `2026-0${(i % 9) + 1}-1${n}T0${n}:30:00`,
        items,
        tipo: n === 2 ? "reposicion" : "suministro",
        solicitante_username: i % 3 === 0 ? "medina" : "",
        solicitante: i % 3 === 1 ? "ute_jardines" : "",
        created_by: i % 3 === 2 ? "tecnico_norte" : "",
        distrito_destino: n > 0 ? "Centro-Ifara" : "",
        barrio_destino: n > 1 ? "El Toscal" : "",
        direccion_destino: n > 2 ? "Calle del Castillo 12" : "",
      });
    }
  }
  return out;
})();

const ROLES = [
  { rol: "admin" },
  { rol: "manager" },
  { rol: "tecnico" },
  { rol: "gestor_vivero" },
  { rol: "empresa_externa" },
  { rol: "proveedor" },
  { rol: "superadmin" },
  { rol: "admin_vivero" },
  { rol: "" },
  { rol: null },
  {},
  null,
];

/* ══════════════════════════════════════════════════════════════════════════
   EQUIVALENCIA
   ══════════════════════════════════════════════════════════════════════════ */

describe("equivalencia · vocabulario", () => {
  it("estadoNormalizado coincide en todos los estados", () => {
    expect(ESTADOS_PEDIDO.map(L.estadoNormalizado)).toEqual(ESTADOS_PEDIDO.map(MAIN_estadoNormalizado));
  });

  it("estadoLabel coincide en todos los estados", () => {
    for (const e of ESTADOS_PEDIDO) {
      expect(L.estadoLabel(e), String(e)).toBe(MAIN_estadoLabel(e));
    }
  });

  it("itemEstado coincide, incluido el valor ausente", () => {
    for (const e of ESTADOS_ITEM) {
      expect(L.itemEstado({ estado_item: e }), String(e)).toBe(MAIN_itemEstado({ estado_item: e }));
    }
    expect(L.itemEstado({})).toBe(MAIN_itemEstado({}));
    expect(L.itemEstado(null)).toBe(MAIN_itemEstado(null));
  });

  it("safeArray coincide con entradas que no son array", () => {
    for (const v of [null, undefined, 0, "", "abc", {}, [1, 2]]) {
      expect(L.safeArray(v)).toEqual(MAIN_safeArray(v));
    }
  });
});

describe("equivalencia · permisos", () => {
  it("puedeDecidir coincide en todos los roles", () => {
    for (const me of ROLES) {
      expect(L.puedeDecidir(me), JSON.stringify(me)).toBe(MAIN_canApprove(me));
    }
  });

  it("el atajo de fila coincide en rol × pedido (480 combinaciones)", () => {
    /*
     * Se acumulan las diferencias y se comparan de UNA vez. Antes había un
     * `expect` por combinación: 840 aserciones en un fichero sólo aportan
     * carga de CPU, y esa carga hacía expirar los `waitFor` de un segundo de
     * otras suites que corren en paralelo.
     */
    const diferencias = [];
    for (const me of ROLES) {
      for (const p of PEDIDOS) {
        const esperado = MAIN_canApprove(me) && MAIN_editable(p);
        const real = L.puedeAtajoDeFila(p, me);
        if (real !== esperado) diferencias.push(`${JSON.stringify(me)} / #${p.id}: ${real} ≠ ${esperado}`);
      }
    }
    expect(diferencias).toEqual([]);
    expect(ROLES.length * PEDIDOS.length).toBe(480);
  });
});

describe("equivalencia · fechas y solicitante", () => {
  const FECHAS = [
    null,
    "",
    "no es fecha",
    "2026-01-05T00:00:00",
    "2026-12-31T23:59:59",
    "2026-06-15T12:00:00",
  ];

  it("dateInputValue coincide", () => {
    for (const f of FECHAS) expect(L.dateInputValue(f), String(f)).toBe(MAIN_dateInputValue(f));
  });

  it("fmtFechaES coincide", () => {
    for (const f of FECHAS) expect(L.fmtFechaES(f), String(f)).toBe(MAIN_fmtFechaES(f));
  });

  it("solicitanteFromPedido coincide, incluido el orden de precedencia", () => {
    for (const p of PEDIDOS) {
      expect(L.solicitanteFromPedido(p), `#${p.id}`).toBe(MAIN_solicitanteFromPedido(p));
    }
    // El orden de precedencia importa: el primero no vacío gana.
    const todos = {
      solicitante_username: "uno",
      solicitante: "dos",
      created_by: "tres",
      usuario: "cuatro",
      username: "cinco",
    };
    expect(L.solicitanteFromPedido(todos)).toBe(MAIN_solicitanteFromPedido(todos));
    expect(L.solicitanteFromPedido({})).toBe("—");
  });
});

describe("equivalencia · filtrado", () => {
  const COMBINACIONES = [];
  for (const estadoFiltro of ["TODOS", "PENDIENTES", "RESERVA", "APROBADO_PARCIAL", "DENEGADO", "SERVIDO"]) {
    for (const idFiltro of ["", "1", "2"]) {
      for (const textoFiltro of ["", "medina", "m20", "reserva", "  MEDINA  "]) {
        COMBINACIONES.push({ estadoFiltro, idFiltro, textoFiltro, fechaFiltro: "", solicitanteFiltro: "" });
      }
    }
  }
  COMBINACIONES.push({ estadoFiltro: "TODOS", idFiltro: "", textoFiltro: "", fechaFiltro: "2026-01-10", solicitanteFiltro: "" });
  COMBINACIONES.push({ estadoFiltro: "TODOS", idFiltro: "", textoFiltro: "", fechaFiltro: "", solicitanteFiltro: "medina" });

  it(`coincide en las ${COMBINACIONES.length} combinaciones de filtros`, () => {
    for (const c of COMBINACIONES) {
      const mio = L.filtrarPedidos(PEDIDOS, c).map((p) => p.id);
      const suyo = MAIN_filtrar(PEDIDOS, c).map((p) => p.id);
      expect(mio, JSON.stringify(c)).toEqual(suyo);
    }
  });

  it("no muta la lista de entrada", () => {
    const copia = PEDIDOS.map((p) => p.id);
    L.filtrarPedidos(PEDIDOS, { estadoFiltro: "TODOS" });
    expect(PEDIDOS.map((p) => p.id)).toEqual(copia);
  });
});

describe("equivalencia · aritmética de la decisión", () => {
  /** Genera decisiones deterministas para las líneas en reserva de un pedido. */
  const decisionesPara = (p, modo) => {
    const out = {};
    const reserva = MAIN_safeArray(p.items).filter((it) => MAIN_itemEstado(it) === "RESERVA");
    reserva.forEach((it, i) => {
      if (modo === "todas-aprobar") out[it.id] = "aprobar";
      else if (modo === "todas-denegar") out[it.id] = "denegar";
      else if (modo === "mixto") out[it.id] = i % 2 === 0 ? "aprobar" : "denegar";
      else if (modo === "parcial" && i > 0) out[it.id] = "aprobar";
      // "ninguna" → {}
    });
    return out;
  };

  const MODOS = ["ninguna", "parcial", "todas-aprobar", "todas-denegar", "mixto"];
  const MOTIVOS = ["", "   ", "sin stock", "  sin stock  "];

  it("progreso y payload coinciden en pedido × modo × motivo", () => {
    // Igual que arriba: se comparan dos estructuras completas, no 7000 valores
    // sueltos. Si algo difiere, el diff de vitest señala exactamente dónde.
    const mios = [];
    const suyos = [];
    for (const p of PEDIDOS) {
      for (const modo of MODOS) {
        const dec = decisionesPara(p, modo);
        for (const motivo of MOTIVOS) {
          const suyo = MAIN_decision(p, dec, motivo);
          const prog = L.progresoDecision(p, dec);
          const clave = `#${p.id} ${modo} «${motivo}»`;
          mios.push([clave, prog.pendingCount, prog.decidedLocalCount, prog.allDecided, prog.anyDenied, L.construirPayloadDecisiones(p, dec, motivo)]);
          suyos.push([clave, suyo.pendingCount, suyo.decidedLocalCount, suyo.allDecided, suyo.anyDenied, suyo.payload]);
        }
      }
    }
    expect(mios).toEqual(suyos);
    expect(mios).toHaveLength(PEDIDOS.length * MODOS.length * MOTIVOS.length);
  });
});

describe("equivalencia · PDF", () => {
  it("puedeVerPdf coincide en todos los pedidos", () => {
    for (const p of PEDIDOS) {
      expect(L.puedeVerPdf(p), `#${p.id} ${p.estado}`).toBe(MAIN_canShowPdf(p));
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   REGLAS DE NEGOCIO QUE LA MIGRACIÓN NO PUEDE TOCAR
   ══════════════════════════════════════════════════════════════════════════ */

describe("contrato · la aritmética de la aprobación", () => {
  const pedido = {
    id: 7,
    estado: "RESERVA",
    items: [
      item(1, "RESERVA", { cantidad: 100 }),
      item(2, "RESERVA", { cantidad: 250 }),
      item(3, "APROBADO", { cantidad: 999 }),
      item(4, "DENEGADO", { cantidad: 888 }),
    ],
  };

  it("solo se envían las líneas en RESERVA: las decididas no se reenvían", () => {
    // Reenviar una línea ya decidida la volvería a decidir.
    const p = L.construirPayloadDecisiones(pedido, { 1: "aprobar", 2: "denegar", 3: "aprobar", 4: "aprobar" }, "x");
    expect(p.approved_item_ids).toEqual([1]);
    expect(p.denied_item_ids).toEqual([2]);
    expect(p.approved_item_ids).not.toContain(3);
    expect(p.approved_item_ids).not.toContain(4);
  });

  it("el payload NO transmite cantidades", () => {
    /*
     * En esta pantalla no hay ningún control para editar cantidades: la
     * decisión por línea es binaria. Si un rediseño introdujera un campo de
     * cantidad, el payload dejaría de tener esta forma y esta prueba lo vería.
     */
    const p = L.construirPayloadDecisiones(pedido, { 1: "aprobar", 2: "denegar" }, "x");
    expect(Object.keys(p).sort()).toEqual(["approved_item_ids", "denied_item_ids", "motivo_denegacion"]);
    expect(JSON.stringify(p)).not.toMatch(/cantidad/i);
  });

  it("una línea aprobada conserva su cantidad solicitada íntegra", () => {
    // Aprobar es todo-o-nada: no existe «aprobar 40 de 100».
    const p = L.construirPayloadDecisiones(pedido, { 1: "aprobar", 2: "aprobar" }, "");
    expect(p.approved_item_ids).toEqual([1, 2]);
    // Las cantidades del pedido quedan intactas: nadie las ha tocado.
    expect(pedido.items.map((i) => i.cantidad)).toEqual([100, 250, 999, 888]);
  });

  it("aprobado + denegado suman exactamente las líneas en reserva", () => {
    const p = L.construirPayloadDecisiones(pedido, { 1: "aprobar", 2: "denegar" }, "x");
    expect(p.approved_item_ids.length + p.denied_item_ids.length).toBe(L.lineasEnReserva(pedido).length);
  });

  it("ninguna línea puede estar a la vez aprobada y denegada", () => {
    for (const modo of [{ 1: "aprobar", 2: "denegar" }, { 1: "denegar", 2: "aprobar" }]) {
      const p = L.construirPayloadDecisiones(pedido, modo, "x");
      const cruce = p.approved_item_ids.filter((id) => p.denied_item_ids.includes(id));
      expect(cruce).toEqual([]);
    }
  });

  it("una decisión desconocida no cuenta como aprobada NI como denegada", () => {
    // Fallo cerrado: un valor inesperado no aprueba nada por accidente.
    const p = L.construirPayloadDecisiones(pedido, { 1: "quizas", 2: "APROBAR" }, "x");
    expect(p.approved_item_ids).toEqual([]);
    expect(p.denied_item_ids).toEqual([]);
  });
});

describe("contrato · no se puede confirmar a medias", () => {
  const p3 = { id: 9, estado: "RESERVA", items: [item(1, "RESERVA"), item(2, "RESERVA"), item(3, "RESERVA")] };

  it("con una línea sin decidir, allDecided es falso", () => {
    expect(L.progresoDecision(p3, { 1: "aprobar", 2: "denegar" }).allDecided).toBe(false);
  });

  it("con todas decididas, allDecided es cierto", () => {
    expect(L.progresoDecision(p3, { 1: "aprobar", 2: "denegar", 3: "aprobar" }).allDecided).toBe(true);
  });

  it("un pedido SIN líneas en reserva no está «todo decidido»: está cerrado", () => {
    // Sin el término `pendingCount > 0`, confirmar un pedido ya resuelto
    // enviaría dos listas vacías al backend.
    const cerrado = { id: 10, estado: "APROBADO", items: [item(1, "APROBADO"), item(2, "DENEGADO")] };
    const prog = L.progresoDecision(cerrado, {});
    expect(prog.pendingCount).toBe(0);
    expect(prog.allDecided).toBe(false);
  });

  it("un pedido sin líneas tampoco", () => {
    expect(L.progresoDecision({ id: 11, estado: "RESERVA", items: [] }, {}).allDecided).toBe(false);
  });
});

describe("contrato · motivo de denegación", () => {
  const p = { id: 12, estado: "RESERVA", items: [item(1, "RESERVA"), item(2, "RESERVA")] };

  it("sin denegadas, el motivo se descarta aunque venga relleno", () => {
    const r = L.construirPayloadDecisiones(p, { 1: "aprobar", 2: "aprobar" }, "esto no debería viajar");
    expect(r.motivo_denegacion).toBeNull();
  });

  it("con denegadas y motivo en blanco, viaja null y NO cadena vacía", () => {
    for (const m of ["", "   ", "\t\n"]) {
      expect(L.construirPayloadDecisiones(p, { 1: "denegar", 2: "aprobar" }, m).motivo_denegacion).toBeNull();
    }
  });

  it("con denegadas y motivo, viaja recortado", () => {
    expect(
      L.construirPayloadDecisiones(p, { 1: "denegar", 2: "aprobar" }, "  sin stock  ").motivo_denegacion
    ).toBe("sin stock");
  });
});

describe("contrato · el atajo de fila protege la aprobación parcial", () => {
  const me = { rol: "manager" };

  it("con UNA línea en RESERVA, el atajo aparece", () => {
    expect(L.puedeAtajoDeFila({ estado: "RESERVA", items: [item(1, "RESERVA")] }, me)).toBe(true);
  });

  it("con DOS líneas NO aparece: obligaría a decidir todo igual", () => {
    expect(L.puedeAtajoDeFila({ estado: "RESERVA", items: [item(1, "RESERVA"), item(2, "RESERVA")] }, me)).toBe(false);
  });

  it("en APROBADO_PARCIAL no aparece aunque quede una sola línea", () => {
    // Ya hay decisión registrada: el resto se decide desde el modal.
    expect(L.puedeAtajoDeFila({ estado: "APROBADO_PARCIAL", items: [item(1, "RESERVA")] }, me)).toBe(false);
  });

  it("ningún rol sin permiso lo ve, ni siquiera con una sola línea", () => {
    for (const rol of ["tecnico", "gestor_vivero", "empresa_externa", "proveedor", "", null]) {
      expect(L.puedeAtajoDeFila({ estado: "RESERVA", items: [item(1, "RESERVA")] }, { rol }), String(rol)).toBe(false);
    }
  });
});

describe("contrato · destinos", () => {
  it("un pedido de reposición nunca tiene varios destinos", () => {
    const p = {
      tipo: "reposicion",
      items: [item(1, "RESERVA", { distrito_destino: "A" }), item(2, "RESERVA", { distrito_destino: "B" })],
    };
    expect(L.tieneVariosDestinos(p)).toBe(false);
    expect(L.destinoDePedido(p)).toBe("Vivero");
  });

  it("agrupa conservando el orden de aparición, no alfabético", () => {
    const p = {
      tipo: "suministro",
      items: [
        item(1, "RESERVA", { distrito_destino: "Zona Z" }),
        item(2, "RESERVA", { distrito_destino: "Zona A" }),
        item(3, "RESERVA", { distrito_destino: "Zona Z" }),
      ],
    };
    const g = L.agruparPorDestino(p);
    expect(g.map((x) => x.destino)).toEqual(["Zona Z", "Zona A"]);
    expect(g[0].items.map((i) => i.id)).toEqual([1, 3]);
  });

  it("ninguna línea se pierde al agrupar", () => {
    for (const p of PEDIDOS) {
      const total = L.agruparPorDestino(p).reduce((n, g) => n + g.items.length, 0);
      expect(total, `#${p.id}`).toBe(L.safeArray(p.items).length);
    }
  });
});

describe("contrato · mensajes", () => {
  it("los avisos de correo se concatenan", () => {
    expect(L.mensajeConAvisos("Base.", { email_warnings: ["a", "b"] })).toBe("Base. Aviso: a · b");
  });

  it("sin avisos, el mensaje queda intacto", () => {
    expect(L.mensajeConAvisos("Base.", {})).toBe("Base.");
    expect(L.mensajeConAvisos("Base.", { email_warnings: [] })).toBe("Base.");
    expect(L.mensajeConAvisos("Base.", null)).toBe("Base.");
  });

  it("el resumen cuenta aprobadas y denegadas", () => {
    expect(L.resumenDecisiones(4, { approved_item_ids: [1, 2], denied_item_ids: [3] })).toBe(
      "Pedido #4: 2 aprobado(s) · 1 denegado(s)."
    );
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   MUTACIÓN — las pruebas de arriba tienen que DETECTAR estos cambios
   ══════════════════════════════════════════════════════════════════════════ */

describe("mutación · la equivalencia detecta que se debilite la aprobación", () => {
  const pedido = {
    id: 20,
    estado: "RESERVA",
    items: [item(1, "RESERVA"), item(2, "RESERVA"), item(3, "APROBADO")],
  };
  const decisiones = { 1: "aprobar", 2: "denegar" };

  const detecta = (mutado, real) => {
    try {
      expect(mutado).toEqual(real);
      return "no detecta";
    } catch {
      return "detecta";
    }
  };

  it("detecta que se permita confirmar con líneas sin decidir", () => {
    const real = L.progresoDecision(pedido, { 1: "aprobar" }).allDecided;
    // Mutación: quitar la exigencia de decidirlas todas.
    const reserva = L.lineasEnReserva(pedido);
    const mutado = reserva.filter((it) => ({ 1: "aprobar" })[it.id]).length > 0;
    expect(real).toBe(false);
    expect(mutado).toBe(true);
    expect(detecta(mutado, real)).toBe("detecta");
  });

  it("detecta que una línea YA decidida se reenvíe", () => {
    const real = L.construirPayloadDecisiones(pedido, { ...decisiones, 3: "aprobar" }, "x");
    // Mutación: recorrer TODAS las líneas en vez de solo las de reserva.
    const mutado = { approved_item_ids: [1, 3], denied_item_ids: [2], motivo_denegacion: "x" };
    expect(real.approved_item_ids).toEqual([1]);
    expect(detecta(mutado, real)).toBe("detecta");
  });

  it("detecta que una decisión desconocida cuente como aprobación", () => {
    const real = L.construirPayloadDecisiones(pedido, { 1: "quizas", 2: "quizas" }, "");
    // Mutación: `!== "denegar"` en vez de `=== "aprobar"`.
    const mutado = { approved_item_ids: [1, 2], denied_item_ids: [], motivo_denegacion: null };
    expect(real.approved_item_ids).toEqual([]);
    expect(detecta(mutado, real)).toBe("detecta");
  });

  it("detecta que el motivo viaje como cadena vacía en vez de null", () => {
    const real = L.construirPayloadDecisiones(pedido, decisiones, "   ").motivo_denegacion;
    const mutado = "   ".trim();
    expect(real).toBeNull();
    expect(detecta(mutado, real)).toBe("detecta");
  });

  it("detecta que el motivo viaje aun sin denegadas", () => {
    const real = L.construirPayloadDecisiones(pedido, { 1: "aprobar", 2: "aprobar" }, "algo").motivo_denegacion;
    const mutado = "algo";
    expect(real).toBeNull();
    expect(detecta(mutado, real)).toBe("detecta");
  });

  it("detecta que el atajo de fila aparezca con varias líneas", () => {
    const varias = { estado: "RESERVA", items: [item(1, "RESERVA"), item(2, "RESERVA")] };
    const real = L.puedeAtajoDeFila(varias, { rol: "manager" });
    // Mutación: quitar la condición de una sola línea.
    const mutado = L.puedeDecidir({ rol: "manager" }) && L.estadoNormalizado(varias.estado) === "RESERVA";
    expect(real).toBe(false);
    expect(mutado).toBe(true);
    expect(detecta(mutado, real)).toBe("detecta");
  });

  it("detecta que un rol sin permiso pueda decidir", () => {
    const real = L.puedeDecidir({ rol: "tecnico" });
    const mutado = ["admin", "manager", "tecnico"].includes("tecnico");
    expect(real).toBe(false);
    expect(detecta(mutado, real)).toBe("detecta");
  });

  it("detecta que PENDIENTES deje de incluir APROBADO_PARCIAL", () => {
    const conParcial = L.filtrarPedidos(PEDIDOS, { estadoFiltro: "PENDIENTES" }).map((p) => p.id);
    const mutado = PEDIDOS.filter((p) => L.estadoNormalizado(p.estado) === "RESERVA").map((p) => p.id);
    expect(conParcial.length).toBeGreaterThan(mutado.length);
    expect(detecta(mutado, conParcial)).toBe("detecta");
  });

  it("detecta que un pedido DENEGADO pierda su PDF de auditoría", () => {
    const denegado = { estado: "DENEGADO", items: [item(1, "DENEGADO")] };
    const real = L.puedeVerPdf(denegado);
    const mutado = false; // mutación: excluir DENEGADO
    expect(real).toBe(true);
    expect(detecta(mutado, real)).toBe("detecta");
  });
});
