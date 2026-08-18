/**
 * LÓGICA DE APROBACIONES.
 *
 * Extraída de `Aprobaciones.jsx@ab7c739` **sin cambiar una regla**. Aquí vive
 * quién puede decidir, qué se puede decidir, cómo se cuenta lo decidido y qué
 * payload se envía — es decir, todo lo que un rediseño no puede tocar.
 *
 * `aprobaciones.equivalence.test.js` compara cada función con una copia
 * literal de main sobre datos generados de forma determinista.
 */

import { formatUsername } from "../utils/format";
import { rolEfectivo } from "../utils/roles";

/* ── Vocabulario ───────────────────────────────────────────────────────── */

/** Estados de PEDIDO que admiten decisión: aún les queda alguna línea en reserva. */
export const DECIDABLE_FRONTEND = new Set(["RESERVA", "APROBADO_PARCIAL"]);

/** Roles que pueden aprobar o denegar. `rolEfectivo` mapea superadmin/admin_vivero → admin. */
export const ROLES_DECISION = ["admin", "manager"];

export const safeArray = (x) => (Array.isArray(x) ? x : []);

export const estadoNormalizado = (estado) => String(estado || "").trim().toUpperCase();

/** Estado de una LÍNEA. Por defecto RESERVA: una línea sin estado está sin decidir. */
export const itemEstado = (it) => String(it?.estado_item || "RESERVA").toUpperCase();

/** Etiqueta legible; `APROBADO_PARCIAL` es ilegible con el guion bajo. */
export const estadoLabel = (estado) => {
  const e = estadoNormalizado(estado);
  if (e === "APROBADO_PARCIAL") return "APROBADO PARCIAL";
  return e || "—";
};

/* ── Permisos ──────────────────────────────────────────────────────────── */

/** ¿Puede este usuario decidir pedidos? */
export const puedeDecidir = (me) => {
  const role = rolEfectivo(me);
  return role === "admin" || role === "manager";
};

/**
 * ¿Se muestra el atajo de fila (aprobar/denegar el pedido ENTERO)?
 *
 * La condición de UNA sola línea no es cosmética: con varias, el atajo
 * obligaría a «aprobar todo» o «denegar todo» y dejaría inaccesible la
 * aprobación parcial. Es la salvaguarda que mantiene vivo el flujo parcial.
 */
export const puedeAtajoDeFila = (pedido, me) => {
  if (!puedeDecidir(me)) return false;
  if (estadoNormalizado(pedido?.estado) !== "RESERVA") return false;
  return safeArray(pedido?.items).length === 1;
};

/* ── Fechas ────────────────────────────────────────────────────────────── */

export const fmtFechaES = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
};

/** Fecha en el formato del `input[type=date]`, en hora LOCAL. */
export const dateInputValue = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

/* ── Solicitante ───────────────────────────────────────────────────────── */

/**
 * Nombre del solicitante, por el primer campo no vacío.
 *
 * El orden importa: el backend rellena unos u otros según cómo se creara el
 * pedido, y `formatUsername` es lo que se MUESTRA (y sobre lo que filtra el
 * buscador de solicitante, por eso la comparación es sobre el formateado).
 */
export const solicitanteFromPedido = (p) =>
  formatUsername(
    p?.solicitante_username || p?.solicitante || p?.created_by || p?.usuario || p?.username || ""
  ) || "—";

/* ── Filtrado ──────────────────────────────────────────────────────────── */

/**
 * Ordena por fecha de creación descendente y aplica los cinco filtros con Y.
 *
 * Devuelve una lista NUEVA: `slice()` antes de `sort()` porque `sort` muta.
 */
export function filtrarPedidos(
  pedidos,
  { estadoFiltro = "TODOS", idFiltro = "", fechaFiltro = "", solicitanteFiltro = "", textoFiltro = "" } = {}
) {
  const texto = String(textoFiltro || "").trim().toLowerCase();

  return safeArray(pedidos)
    .slice()
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .filter((p) => {
      // Subcadena, no igualdad: teclear «1» encuentra el 1, el 10 y el 21.
      const idOk = !idFiltro || String(p.id).includes(String(idFiltro).trim());

      const estadoNorm = estadoNormalizado(p?.estado);
      const estadoOk =
        estadoFiltro === "TODOS"
          ? true
          : estadoFiltro === "PENDIENTES"
            ? DECIDABLE_FRONTEND.has(estadoNorm)
            : estadoNorm === estadoFiltro;

      const fechaOk = !fechaFiltro || dateInputValue(p?.created_at) === fechaFiltro;

      const solicitante = solicitanteFromPedido(p).toLowerCase();
      const solicitanteOk =
        !solicitanteFiltro || solicitante.includes(String(solicitanteFiltro).trim().toLowerCase());

      const detalle = safeArray(p.items)
        .map((it) => `${it.producto_id} ${it.tamano || ""} ${it.cantidad || ""}`.toLowerCase())
        .join(" ");

      const textoOk =
        !texto ||
        String(p.id).toLowerCase().includes(texto) ||
        solicitante.includes(texto) ||
        estadoNormalizado(p?.estado).toLowerCase().includes(texto) ||
        detalle.includes(texto);

      return idOk && estadoOk && fechaOk && solicitanteOk && textoOk;
    });
}

/* ── Aritmética de la decisión ─────────────────────────────────────────── */

/** Líneas todavía sin decidir: las únicas sobre las que se puede actuar. */
export const lineasEnReserva = (pedido) =>
  safeArray(pedido?.items).filter((it) => itemEstado(it) === "RESERVA");

/**
 * Recuento del progreso de la decisión.
 *
 * `allDecided` exige `pendingCount > 0`: un pedido sin líneas en reserva NO
 * está «todo decidido», está cerrado. Sin ese término, confirmar un pedido ya
 * resuelto enviaría dos listas vacías al backend.
 */
export function progresoDecision(pedido, pendingDecisions = {}) {
  const reserva = lineasEnReserva(pedido);
  const pendingCount = reserva.length;
  const decidedLocalCount = reserva.filter((it) => pendingDecisions[it.id]).length;
  return {
    pendingCount,
    decidedLocalCount,
    allDecided: pendingCount > 0 && decidedLocalCount === pendingCount,
    anyDenied: reserva.some((it) => pendingDecisions[it.id] === "denegar"),
  };
}

/**
 * Payload de `POST /pedidos/{id}/decidir`.
 *
 * Solo recorre las líneas en RESERVA: las ya decididas no se reenvían, porque
 * hacerlo las volvería a decidir. El orden de los ids es el de aparición.
 *
 * `motivo_denegacion` es `null` cuando no hay ninguna denegada, y TAMBIÉN
 * cuando hay denegadas pero el motivo viene vacío o en blanco. Nunca es "".
 */
export function construirPayloadDecisiones(pedido, pendingDecisions = {}, motivo = "") {
  const approved_item_ids = [];
  const denied_item_ids = [];
  for (const it of lineasEnReserva(pedido)) {
    if (pendingDecisions[it.id] === "aprobar") approved_item_ids.push(it.id);
    else if (pendingDecisions[it.id] === "denegar") denied_item_ids.push(it.id);
  }
  return {
    approved_item_ids,
    denied_item_ids,
    motivo_denegacion: denied_item_ids.length ? String(motivo || "").trim() || null : null,
  };
}

/* ── PDF ───────────────────────────────────────────────────────────────── */

/**
 * ¿Se ofrece el PDF?
 *
 * Un pedido totalmente DENEGADO sí lo tiene: conserva valor de auditoría
 * (detalle de líneas y motivo). Solo se oculta en un RESERVA sin decisión.
 */
export function puedeVerPdf(pedido) {
  const items = safeArray(pedido?.items);
  const hasApproved = items.some((it) => {
    const st = itemEstado(it);
    return st === "APROBADO" || st === "SERVIDO";
  });
  const e = String(pedido?.estado || "RESERVA").toUpperCase();
  return (
    e === "APROBADO" ||
    e === "APROBADO_PARCIAL" ||
    e === "SERVIDO" ||
    e === "DENEGADO" ||
    hasApproved
  );
}

/* ── Destinos ──────────────────────────────────────────────────────────── */

export const destinoDeItem = (it) =>
  [it?.distrito_destino, it?.barrio_destino, it?.direccion_destino].filter(Boolean).join(" · ");

export function destinoDePedido(pedido) {
  if (pedido?.tipo === "reposicion") return "Vivero";
  return (
    [pedido?.distrito_destino, pedido?.barrio_destino, pedido?.direccion_destino]
      .filter(Boolean)
      .join(" · ") || "—"
  );
}

/** ¿Reparte en varios destinos? Los de reposición nunca. */
export function tieneVariosDestinos(pedido) {
  if (pedido?.tipo === "reposicion") return false;
  const unicos = Array.from(new Set(safeArray(pedido?.items).map(destinoDeItem).filter(Boolean)));
  return unicos.length > 1;
}

/** Agrupa las líneas por destino conservando el orden de aparición. */
export function agruparPorDestino(pedido) {
  const destino = destinoDePedido(pedido);
  const order = [];
  const map = new Map();
  for (const it of safeArray(pedido?.items)) {
    const dst = destinoDeItem(it) || destino;
    if (!map.has(dst)) {
      map.set(dst, []);
      order.push(dst);
    }
    map.get(dst).push(it);
  }
  return order.map((dst) => ({ destino: dst, items: map.get(dst) }));
}

/* ── Mensajes ──────────────────────────────────────────────────────────── */

/** Concatena los avisos de correo que devuelve el backend. */
export function mensajeConAvisos(base, updated) {
  const warns = Array.isArray(updated?.email_warnings) ? updated.email_warnings : [];
  return warns.length ? `${base} Aviso: ${warns.join(" · ")}` : base;
}

/** Resumen tras confirmar: «3 aprobado(s) · 1 denegado(s)». */
export function resumenDecisiones(pedidoId, { approved_item_ids = [], denied_item_ids = [] }) {
  const parts = [];
  if (approved_item_ids.length) parts.push(`${approved_item_ids.length} aprobado(s)`);
  if (denied_item_ids.length) parts.push(`${denied_item_ids.length} denegado(s)`);
  return `Pedido #${pedidoId}: ${parts.join(" · ")}.`;
}
