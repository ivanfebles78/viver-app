/**
 * LÓGICA DE PEDIDOS.
 *
 * Se extrae de `Pedidos.jsx` **sin cambiar una sola regla**. Aquí vive lo que
 * decide QUIÉN ve qué y QUIÉN puede hacer qué, que es lo más delicado de la
 * aplicación: mientras estaba enterrado en un componente de 3 160 líneas
 * mezclado con estilos en línea, no había forma de comprobar que un rediseño no
 * lo alteraba.
 *
 * `pedidos.equivalence.test.js` compara cada función con una copia literal de
 * `Pedidos.jsx@1767485` sobre datos generados. Si discrepan, la que ha cambiado
 * de comportamiento es esta, y hay que justificarlo.
 *
 * Nada de presentación: los colores y pesos que acompañaban a `badge()` los
 * sustituye el vocabulario compartido de `app/estado.js`.
 */

import { formatUsername } from "../utils/format";

/* ── Constantes de dominio ─────────────────────────────────────────────── */

export const TAMANOS = ["Semillero", "M12", "M20", "M35"];

export const ESTADO_FILTERS = [
  { value: "TODOS", label: "Todos" },
  { value: "RESERVA", label: "Reserva" },
  { value: "APROBADO_PARCIAL", label: "Aprobado parcial" },
  { value: "APROBADO", label: "Aprobado" },
  { value: "SERVIDO", label: "Servido" },
  { value: "DENEGADO", label: "Denegado" },
  { value: "CANCELADO", label: "Cancelado" },
  { value: "CADUCADO", label: "Caducado" },
];

/**
 * Estados en los que un pedido YA ESTÁ DECIDIDO y no admite cambios.
 *
 * Se nombra la lista en vez de repetir cinco comparaciones: así se ve de un
 * vistazo qué significa «decidido», y añadir un estado nuevo es una línea.
 */
export const ESTADOS_CERRADOS = ["APROBADO", "DENEGADO", "SERVIDO", "CANCELADO", "CADUCADO"];

/** Roles que solo consultan. `proveedor` es estrictamente de lectura. */
export const ROLES_SOLO_LECTURA = ["tecnico", "gestor_vivero", "proveedor"];

/* ── Utilidades ────────────────────────────────────────────────────────── */

export const safeArray = (x) => (Array.isArray(x) ? x : []);

export const estadoNormalizado = (estado) => String(estado || "").trim().toUpperCase();

/**
 * Etiqueta visible del estado.
 *
 * `APROBADO_PARCIAL` se muestra con espacio, no con guion bajo: el guion es una
 * clave de base de datos, no algo que se lea en pantalla.
 */
export const estadoLabel = (estado) => {
  const e = estadoNormalizado(estado);
  if (e === "APROBADO_PARCIAL") return "APROBADO PARCIAL";
  return e || "—";
};

/** Día natural LOCAL en `YYYY-MM-DD`, para comparar con un `<input type=date>`. */
export const dateInputValue = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export function lineKey(productoId, tamano) {
  return `${productoId}__${tamano}`;
}

export function parseLineKey(key) {
  const [producto_id, tamano] = String(key).split("__");
  return { producto_id: Number(producto_id), tamano: tamano || "M12" };
}

export function clampNumber(v, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/*
 * Copia LITERAL de main. Nótese el respaldo «pedido» y el corte a 80: cambiarlos
 * cambiaría el nombre de un fichero que la gente archiva.
 */
export function sanitizeFileName(name) {
  return String(name || "pedido")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

/* ── Solicitante ───────────────────────────────────────────────────────── */

/**
 * Username CRUDO del solicitante, sin formatear.
 *
 * Existe separado de `solicitanteFromPedido` por un defecto real ya corregido:
 * el filtro de `empresa_externa` comparaba el nombre FORMATEADO («Medina»)
 * contra el que guarda el backend («medina»), y dejaba la lista vacía. Todo lo
 * que compare identidad usa esta función; solo se formatea para mostrar.
 */
export function solicitanteRaw(p) {
  return String(
    p?.solicitante_username || p?.solicitante || p?.created_by || p?.usuario || p?.username || ""
  ).trim();
}

/** Nombre del solicitante tal y como se muestra. */
export function solicitanteFromPedido(p) {
  return formatUsername(solicitanteRaw(p)) || "—";
}

/** Solicitantes presentes en la lista, deduplicados y ordenados. */
export function solicitantesDisponibles(pedidos) {
  const seen = new Map();
  for (const p of safeArray(pedidos)) {
    const raw = solicitanteRaw(p);
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (!seen.has(key)) seen.set(key, { value: key, label: formatUsername(raw) });
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label, "es"));
}

/* ── Permisos ──────────────────────────────────────────────────────────── */

export const esSoloLectura = (role) => ROLES_SOLO_LECTURA.includes(role);

/**
 * ¿Se puede editar o cancelar este pedido?
 *
 * EL ORDEN DE LAS REGLAS IMPORTA y es el de main:
 *
 *   1. Un pedido ya decidido no se toca, sea quien sea quien mire.
 *   2. Los roles de solo lectura nunca.
 *   3. `admin` solo mientras esté en RESERVA.
 *   4. Una empresa externa solo sus PROPIOS pedidos, y solo en RESERVA.
 *
 * La regla 1 va primero a propósito: si fuera después de la 3, un administrador
 * podría tocar un pedido ya servido.
 */
export function puedeEditarCancelar(pedido, { role, username }) {
  const estado = estadoNormalizado(pedido?.estado);

  if (ESTADOS_CERRADOS.includes(estado)) return false;
  if (esSoloLectura(role)) return false;
  if (role === "admin") return estado === "RESERVA";

  const solicitante = solicitanteFromPedido(pedido);
  const soyYo = !!solicitante && !!username && solicitante === username;
  return role === "empresa_externa" && estado === "RESERVA" && soyYo;
}

/**
 * ¿Este pedido es visible para este rol?
 *
 * Defensa en el frontend, no sustituto de la del backend: una empresa externa
 * no ve los pedidos de reposición ni los de otros solicitantes.
 */
export function pedidoVisiblePara(pedido, { role, username }) {
  if (role !== "empresa_externa") return true;

  const tipo = String(pedido?.tipo || "salida").toLowerCase();
  if (tipo === "reposicion") return false;

  // Comparación en CRUDO y en minúsculas. Ver `solicitanteRaw`.
  const suyo = solicitanteRaw(pedido).toLowerCase();
  const mio = String(username || "").trim().toLowerCase();
  return !!mio && suyo === mio;
}

/* ── Filtrado ──────────────────────────────────────────────────────────── */

/**
 * Aplica visibilidad por rol, orden y los cinco filtros.
 *
 * El ORDEN importa: primero visibilidad, después ordenación por fecha
 * descendente, y solo entonces los filtros. Ordenar al final cambiaría el
 * resultado cuando dos pedidos empatan.
 */
export function filtrarPedidos(pedidos, { role, username, mapProdName = new Map(), filtros = {} }) {
  const {
    estado: estadoFiltro = "TODOS",
    id: idFiltro = "",
    fecha: fechaFiltro = "",
    solicitante: solicitanteFiltro = "",
    texto: textoFiltro = "",
  } = filtros;

  const texto = textoFiltro.trim().toLowerCase();

  return safeArray(pedidos)
    .slice()
    .filter((p) => pedidoVisiblePara(p, { role, username }))
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .filter((p) => {
      const idOk = !idFiltro || String(p.id).includes(String(idFiltro).trim());
      const estadoOk = estadoFiltro === "TODOS" || estadoNormalizado(p?.estado) === estadoFiltro;
      const fechaOk = !fechaFiltro || dateInputValue(p?.created_at) === fechaFiltro;

      const solicitante = solicitanteFromPedido(p).toLowerCase();
      const solicitanteOk =
        !solicitanteFiltro || solicitante === solicitanteFiltro.trim().toLowerCase();

      // El texto busca también dentro de las LÍNEAS del pedido: es como se
      // encuentra «¿qué pedido llevaba dragos?».
      const detalle = safeArray(p.items)
        .map((it) => {
          const nombre =
            it.producto_nombre_cientifico ||
            it.nombre_cientifico ||
            mapProdName.get(it.producto_id) ||
            it.producto_nombre_natural ||
            it.nombre_natural ||
            it.nombre ||
            `producto ${it.producto_id}`;
          return `${nombre} ${it.tamano || ""} ${it.cantidad || ""}`.toLowerCase();
        })
        .join(" ");

      const destinoTxt =
        `${p?.distrito_destino || ""} ${p?.barrio_destino || ""} ${p?.direccion_destino || ""}`.toLowerCase();

      const textoOk =
        !texto ||
        String(p.id).toLowerCase().includes(texto) ||
        solicitante.includes(texto) ||
        estadoNormalizado(p?.estado).toLowerCase().includes(texto) ||
        detalle.includes(texto) ||
        destinoTxt.includes(texto);

      return idOk && estadoOk && fechaOk && solicitanteOk && textoOk;
    });
}

/* ── Edición ───────────────────────────────────────────────────────────── */

/** Mapa `clave → cantidad` con el que arranca la edición de un pedido. */
export function construirEdicion(pedido) {
  const map = {};
  for (const it of safeArray(pedido?.items)) {
    const pid = it.producto_id;
    const tam = it.tamano || "M12";
    map[lineKey(pid, tam)] = Number(it.cantidad ?? 0);
  }
  return map;
}

/**
 * Líneas que se envían al guardar una edición.
 *
 * Solo pasan las de cantidad > 0: poner una cantidad a 0 ELIMINA la línea. Es
 * el comportamiento de main y hay que conservarlo — es como se quita un
 * producto de un pedido sin un botón de borrar.
 */
export function construirItemsEdicion(editQty) {
  return Object.entries(editQty || {})
    .map(([key, cantidad]) => {
      const parsed = parseLineKey(key);
      return {
        producto_id: parsed.producto_id,
        tamano: parsed.tamano,
        // `Number()` a secas, como main. Un valor no numérico da NaN y una
        // cantidad negativa se queda negativa; el filtro `> 0` de abajo
        // descarta ambos. Usar `clampNumber` daría el mismo resultado, pero
        // este módulo replica main literalmente para que la equivalencia sea
        // comparable línea a línea.
        cantidad: Number(cantidad),
      };
    })
    .filter((x) => x.cantidad > 0 && Number.isFinite(x.producto_id) && x.tamano);
}

/* ── Existencias ───────────────────────────────────────────────────────── */

/** Existencias por producto y tamaño, a partir de los movimientos. */
export function buildStockByProductSize(movimientos) {
  const map = new Map();

  const add = (productoId, tamano, delta) => {
    if (!productoId || !tamano) return;
    map.set(lineKey(productoId, tamano), (map.get(lineKey(productoId, tamano)) || 0) + delta);
  };

  for (const m of safeArray(movimientos)) {
    const productoId = m?.producto_id;
    const cantidad = Number(m?.cantidad || 0);
    if (!productoId || !cantidad) continue;

    const destinoTipo = String(m?.destino_tipo || "").trim().toLowerCase();
    const origenTipo = String(m?.origen_tipo || "").trim().toLowerCase();

    if (destinoTipo === "vivero" && m?.tamano_destino) add(productoId, m.tamano_destino, cantidad);
    if (origenTipo === "vivero" && m?.tamano_origen) add(productoId, m.tamano_origen, -cantidad);
  }

  return map;
}
