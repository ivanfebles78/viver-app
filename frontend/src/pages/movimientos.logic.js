/**
 * LÓGICA DE MOVIMIENTOS.
 *
 * Se extrae de `Movimientos.jsx` **sin cambiar una sola regla**. El motivo es
 * poder probarla: mientras vivía dentro de un componente de 3 613 líneas,
 * mezclada con estilos en línea, no había forma de comprobar que el rediseño no
 * la alteraba.
 *
 * Cada función es una copia literal de la que había en `Movimientos.jsx@main`.
 * `movimientos.equivalence.test.js` compara ambas sobre datos generados; si
 * alguna vez discrepan, la que ha cambiado de comportamiento es esta, y hay que
 * justificarlo — no reescribir el testigo.
 *
 * Aquí NO hay nada de presentación. Los colores y pesos tipográficos que
 * acompañaban a estas funciones (`tipoTextStyle`, `prestamoTextStyle`,
 * `thStyle`, `tdStyle`, `inputStyle`…) no se trasladan: los sustituye el
 * sistema de diseño.
 */

import { getZonaLabel } from "../utils/zonas";

/* ── Constantes de dominio ─────────────────────────────────────────────── */

export const ORIGENES = [
  "Empresa Externa",
  "Otro",
  "Vivero",
  "Palmetum",
  "Empresa",
  "Organismo oficial",
  "Colegio",
];

export const DESTINOS_SALIDA_VIVERO = [
  "Empresa",
  "Organismo oficial",
  "Colegio",
  "Otro",
  "Palmetum",
  "Baja Vivero",
  "Vivero",
];

/** Salidas del vivero. Todas salvo «Baja Vivero» exigen dirección. */
export const SALIDA_DESTINOS = [
  "Baja Vivero",
  "UTE",
  "Palmetum",
  "Organismo oficial",
  "Colegio",
  "Otros",
];

export const ENTRADA_ORIGENES = ["Producción propia", "Proveedores del vivero", "Otros"];

export const DEVOLUCION_ORIGENES = ["Organismo oficial", "Colegio", "Otros"];

export const ENTRADA_ORIGEN_OTROS = "Otros";

export const DESTINOS_EXTERNOS = [
  "Empresa",
  "Organismo oficial",
  "Colegio",
  "Otro",
  "Otros",
  "Palmetum",
  "UTE",
];

/** Quién puede devolver material prestado al vivero. */
export const ORIGENES_DEVOLUCION = ["Empresa", "Organismo oficial", "Colegio", "Otro", "Otros"];

export const TIPOS_MOVIMIENTO = [
  { value: "entrada", label: "Entrada" },
  { value: "salida", label: "Salida" },
  { value: "traslado_interno", label: "Traslado" },
  { value: "devolucion", label: "Devolución" },
];

export const TAMANOS = ["Semillero", "M12", "M20", "M35"];

/* ── Utilidades ────────────────────────────────────────────────────────── */

export const safeArray = (x) => (Array.isArray(x) ? x : []);

/**
 * Día natural LOCAL de una fecha, en formato `YYYY-MM-DD`.
 *
 * Local a propósito: el filtro de fecha compara contra lo que el usuario ve en
 * un `<input type="date">`, que es su día, no el día UTC.
 */
export const dateInputValue = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

/** «YYYY-MM-DDTHH:mm» local, para `<input type="datetime-local">`. */
export const defaultFechaLocal = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};

/**
 * Normaliza el tamaño para la clave de stock.
 *
 * `m30 → M35` NO es una errata: corrige datos heredados en los que el tamaño
 * grande se guardó como M30. Se conserva tal cual estaba.
 */
export function normalizeTamanoForStock(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "semillero") return "Semillero";
  if (raw === "m12") return "M12";
  if (raw === "m20") return "M20";
  if (raw === "m30") return "M35";
  return String(value || "").trim();
}

export function buildStockKey(productoId, zona, tamano) {
  const normalizedTamano = normalizeTamanoForStock(tamano);
  if (!productoId || !zona || !normalizedTamano) return "";
  return `${productoId}__${String(zona).toLowerCase()}__${normalizedTamano}`;
}

/**
 * Nombre visible de un producto.
 *
 * Concatena «Latín — Común» cuando difieren, para distinguir especies que
 * comparten nombre genérico (varias «Acalifa», por ejemplo).
 */
export function getProductDisplayName(p) {
  const cient = (p?.nombre_cientifico || p?.producto_nombre_cientifico || "").trim();
  const natural = (p?.nombre_natural || "").trim();
  if (cient && natural && cient.toLowerCase() !== natural.toLowerCase()) {
    return `${cient} — ${natural}`;
  }
  return cient || natural || `Producto #${p?.id || p?.producto_id || "—"}`;
}

export function isExternalDestination(value) {
  return DESTINOS_EXTERNOS.includes(String(value || "").trim());
}

export function isDevolucionOrigen(value) {
  return ORIGENES_DEVOLUCION.includes(String(value || "").trim());
}

/**
 * Tipo de un movimiento a partir de su origen y destino.
 *
 * EL ORDEN DE LAS REGLAS IMPORTA: «devolución» tiene que comprobarse antes que
 * «entrada», porque toda devolución es también una entrada al vivero.
 */
export function getMovimientoTipo(m) {
  const o = String(m?.origen_tipo || "").trim().toLowerCase();
  const d = String(m?.destino_tipo || "").trim().toLowerCase();

  if (o === "vivero" && d === "vivero") return "traslado_interno";

  if (d === "vivero" && ["empresa", "organismo oficial", "colegio", "otro", "otros"].includes(o)) {
    return "devolucion";
  }

  if (d === "vivero") return "entrada";

  return "salida";
}

export function getTipoDisplayLabel(tipo) {
  const t = String(tipo || "").toLowerCase();
  if (t === "traslado_interno") return "Traslado";
  if (t === "entrada") return "Entrada";
  if (t === "salida") return "Salida";
  if (t === "devolucion") return "Devolución";
  return tipo || "—";
}

/** Destinos posibles según el origen elegido. */
export function getDestinoOptions(origenTipo) {
  if (!origenTipo) return [];
  if (origenTipo === "Vivero") return SALIDA_DESTINOS;
  return ["Vivero"];
}

export function buildLabelOrigen(m) {
  if (m?.origen_tipo === "Vivero") {
    return `Vivero${m?.zona_origen ? ` · ${getZonaLabel(m.zona_origen)}` : ""}${
      m?.tamano_origen ? ` · ${m.tamano_origen}` : ""
    }`;
  }
  return m?.origen_tipo || "—";
}

export function buildLabelDestino(m) {
  if (m?.destino_tipo === "Vivero") {
    return `Vivero${m?.zona_destino ? ` · ${getZonaLabel(m.zona_destino)}` : ""}${
      m?.tamano_destino ? ` · ${m.tamano_destino}` : ""
    }`;
  }

  if (isExternalDestination(m?.destino_tipo)) {
    const parts = [m?.distrito_destino, m?.barrio_destino, m?.direccion_destino].filter(Boolean);
    return parts.length ? `${m.destino_tipo} · ${parts.join(" · ")}` : m.destino_tipo;
  }

  return m?.destino_tipo || "—";
}

/**
 * Existencias por producto, zona y tamaño, reconstruidas desde el histórico.
 *
 * Suma lo que entra al vivero y resta lo que sale. Las claves usan la zona en
 * minúsculas pero el tamaño tal cual viene — igual que en main.
 */
export function buildStockByProductZoneSize(movimientos) {
  const map = new Map();

  const add = (productoId, zona, tamano, delta) => {
    if (!productoId || !zona || !tamano) return;
    const key = `${productoId}__${String(zona).toLowerCase()}__${tamano}`;
    map.set(key, (map.get(key) || 0) + delta);
  };

  for (const m of safeArray(movimientos)) {
    const productoId = m?.producto_id;
    const cantidad = Number(m?.cantidad || 0);
    const origenTipo = String(m?.origen_tipo || "").trim().toLowerCase();
    const destinoTipo = String(m?.destino_tipo || "").trim().toLowerCase();

    if (!productoId || !cantidad) continue;

    if (destinoTipo === "vivero" && m?.zona_destino && m?.tamano_destino) {
      add(productoId, m.zona_destino, m.tamano_destino, cantidad);
    }

    if (origenTipo === "vivero" && m?.zona_origen && m?.tamano_origen) {
      add(productoId, m.zona_origen, m.tamano_origen, -cantidad);
    }
  }

  return map;
}

/**
 * Validación del formulario de movimiento.
 *
 * Devuelve una lista de mensajes. Copia literal: cada regla, en el mismo orden,
 * con el mismo texto. El orden determina qué error lee primero el usuario.
 */
export function getFormErrors(form, formatoConfig = null) {
  const errs = [];

  if (!form.producto_id) errs.push("Debes seleccionar un producto.");

  // Fitosanitarios y fertilizantes no llevan cantidad: va en observaciones.
  if (formatoConfig?.showCantidad !== false) {
    if (!form.cantidad || Number(form.cantidad) <= 0) errs.push("La cantidad debe ser mayor que 0.");
  }
  if (!form.origen_tipo) errs.push("Debes seleccionar un origen.");
  if (!form.destino_tipo) errs.push("Debes seleccionar un destino.");

  if (formatoConfig?.observacionesRequired && !(form.observaciones || "").trim()) {
    errs.push("Para fitosanitarios y fertilizantes debes indicar la cantidad y el envase en observaciones.");
  }

  if (form.origen_tipo === form.destino_tipo && form.origen_tipo !== "Vivero") {
    errs.push("No se permite mover entre el mismo origen y destino salvo traslado interno en vivero.");
  }

  if (
    ["Empresa Externa", "Otro", "Palmetum", "Empresa", "Organismo oficial", "Colegio"].includes(
      form.origen_tipo
    ) &&
    form.destino_tipo !== "Vivero"
  ) {
    errs.push(`${form.origen_tipo} solo puede mover hacia Vivero.`);
  }

  if (form.origen_tipo === "Vivero" && !form.zona_origen) {
    errs.push("Debes seleccionar una zona de origen del vivero.");
  }

  if (form.origen_tipo === "Vivero" && !form.tamano_origen) {
    errs.push("Debes seleccionar un tamaño de origen.");
  }

  if (form.destino_tipo === "Vivero" && !form.zona_destino) {
    errs.push("Debes seleccionar una zona de destino del vivero.");
  }

  if (form.destino_tipo === "Vivero" && !form.tamano_destino) {
    errs.push("Debes seleccionar un tamaño de destino.");
  }

  if (isExternalDestination(form.destino_tipo)) {
    if (!form.distrito_destino) errs.push("Debes seleccionar un distrito.");
    if (!form.barrio_destino) errs.push("Debes seleccionar un barrio.");
    if (!form.direccion_destino) errs.push("Debes indicar una dirección.");
  }

  if (
    form.origen_tipo === "Vivero" &&
    form.destino_tipo === "Vivero" &&
    form.zona_origen &&
    form.zona_destino &&
    form.zona_origen === form.zona_destino &&
    form.tamano_origen === form.tamano_destino
  ) {
    errs.push("El traslado interno debe cambiar de zona o de tamaño.");
  }

  if (form.fecha_disponibilidad) {
    if (form.destino_tipo !== "Vivero" || form.tamano_destino !== "M35") {
      errs.push("La fecha de disponibilidad solo aplica a movimientos a Vivero con tamaño M35.");
    } else {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const f = new Date(`${form.fecha_disponibilidad}T00:00:00`);
      if (Number.isNaN(f.getTime()) || f <= hoy) {
        errs.push("La fecha de disponibilidad debe ser futura.");
      }
    }
  }

  return errs;
}

/**
 * Aplica los siete filtros de la pantalla.
 *
 * Se extrae del `useMemo` del componente tal cual. Todos se combinan con Y
 * lógico y un filtro vacío no restringe.
 */
/**
 * Interpreta el nº de pedido tecleado en el filtro.
 *
 * El identificador que ve el usuario ES `pedido.id`: la aplicación lo muestra
 * siempre como «#123» —columna Pedido de esta tabla, detalle del movimiento y
 * PDF del pedido— y el modelo no tiene ningún otro código.
 *
 * @returns `null` si no hay filtro (no debe restringir nada), el id exacto a
 *          buscar, o `NaN` si lo tecleado no es un número (no coincide con
 *          nada, en lugar de devolverlo todo).
 */
export function parsearNumeroPedido(texto) {
  const limpio = String(texto ?? "").trim().replace(/^#/, "").trim();
  if (!limpio) return null;
  // Coincidencia EXACTA, no «contiene»: buscar 12 devuelve el pedido 12 y no
  // también el 120 y el 512. Se aceptan la almohadilla —porque es como aparece
  // en pantalla— y los ceros a la izquierda —porque es como se copia de un
  // documento—, que son la misma referencia escrita de otra forma.
  if (!/^\d+$/.test(limpio)) return NaN;
  return Number(limpio);
}

export function filtrarMovimientos(movimientos, filtros) {
  const {
    producto = "",
    tipo = "",
    zona = "",
    uuid = "",
    origen = "",
    destino = "",
    fecha = "",
    pedido = "",
  } = filtros || {};

  const pedidoBuscado = parsearNumeroPedido(pedido);

  return safeArray(movimientos).filter((m) => {
    const productoTxt = producto.trim().toLowerCase();
    const uuidTxt = uuid.trim().toLowerCase();
    const tipoReal = String(m?.tipo_movimiento || getMovimientoTipo(m) || "").toLowerCase();
    const origenReal = String(m?.origen_tipo || "").toLowerCase();
    const destinoReal = String(m?.destino_tipo || "").toLowerCase();
    const zonasMovimiento = [m?.zona_origen, m?.zona_destino]
      .filter(Boolean)
      .map((z) => String(z).toLowerCase());

    const productoMatch =
      !productoTxt ||
      `${m?.producto_nombre_cientifico || ""} ${m?.producto_nombre_natural || ""} ${m?.producto_id || ""}`
        .toLowerCase()
        .includes(productoTxt);

    const tipoMatch = !tipo || tipoReal === String(tipo).toLowerCase();
    const zonaMatch = !zona || zonasMovimiento.includes(String(zona).toLowerCase());
    const uuidMatch = !uuidTxt || String(m?.uuid_lote || "").toLowerCase().includes(uuidTxt);
    const origenMatch = !origen || origenReal === String(origen).toLowerCase();
    const destinoMatch = !destino || destinoReal === String(destino).toLowerCase();
    const fechaMatch = !fecha || dateInputValue(m?.fecha_movimiento) === fecha;

    // Sin nada tecleado no restringe: los movimientos sin pedido asociado
    // —entradas, traslados internos, ajustes— son mayoría y siguen viéndose
    // igual que siempre.
    const idPedido = m?.pedido_id;
    const pedidoMatch =
      pedidoBuscado === null ||
      (idPedido !== null && idPedido !== undefined && idPedido !== "" &&
        Number(idPedido) === pedidoBuscado);

    return (
      productoMatch &&
      tipoMatch &&
      zonaMatch &&
      uuidMatch &&
      origenMatch &&
      destinoMatch &&
      fechaMatch &&
      pedidoMatch
    );
  });
}

/** Pedidos que el proveedor puede servir. Los parciales SÍ cuentan. */
export function filtrarPedidosAprobados(pedidos) {
  const SERVICEABLE = new Set(["APROBADO", "APROBADO_PARCIAL"]);
  return safeArray(pedidos).filter((p) => SERVICEABLE.has(String(p?.estado || "").toUpperCase()));
}

/** Etiqueta de préstamo/devolución de una fila. */
export function getPrestamoKind(m) {
  if (m?.es_prestamo) return "prestamo";
  if (m?.es_devolucion || getMovimientoTipo(m) === "devolucion") return "devolucion";
  return "none";
}
