/**
 * MOTOR DE AVISOS DEL MENÚ — contadores por ruta y memoria de "ya visto".
 *
 * Extraído literalmente de `layout/Layout.jsx@main` (líneas 23–135). La lógica
 * es idéntica; lo único que cambia es dónde vive.
 *
 * Se saca del shell porque tiene acoplamientos que no se ven leyendo el
 * marcado: depende de un intervalo de 30 s, de un listener de `focus`, del
 * evento `vivero:data-changed` que emite el interceptor de axios, y de un mapa
 * en localStorage que escriben dos efectos de cambio de ruta. Reescribir el
 * shell con todo eso enredado en el mismo fichero es cómo se pierde un
 * contador sin que nadie se entere hasta que un pedido se queda sin servir.
 */

/**
 * Estado por pedido que el usuario ya ha "visto" en la pantalla de Pedidos.
 * Sirve para avisar en el menú cuando el estado de uno de sus pedidos cambia.
 */
export const SEEN_PEDIDOS_STORAGE_KEY = "vivero_seen_pedidos_v1";

/** Avisos globales (stock, caducidad) que el usuario ya ha marcado como leídos. */
export const NOTIFICATIONS_STORAGE_KEY = "vivero_global_notifications_read";

/** Estados en los que el solicitante ya tiene una decisión que leer. */
export const DECIDED_STATES = new Set(["APROBADO", "APROBADO_PARCIAL", "DENEGADO", "SERVIDO"]);

/** Estados en los que un pedido todavía puede servirse. */
export const SERVICEABLE_STATES = new Set(["APROBADO", "APROBADO_PARCIAL"]);

export function loadSeenPedidosFromStorage() {
  try {
    const raw = localStorage.getItem(SEEN_PEDIDOS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveSeenPedidosToStorage(seen) {
  try {
    localStorage.setItem(SEEN_PEDIDOS_STORAGE_KEY, JSON.stringify(seen || {}));
  } catch {
    // localStorage puede no estar disponible (navegación privada, cuotas).
  }
}

export function getReadNotificationsFromStorage() {
  try {
    const raw = window.localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveReadNotificationsToStorage(ids) {
  try {
    window.localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // noop
  }
}

/**
 * Contadores de aviso por ruta, según el rol y los pedidos visibles.
 *
 * Devuelve `{ [path]: number }`, p. ej. `{ "/aprobaciones": 3, "/pedidos": 2 }`.
 * Un 0 o una entrada ausente significa que no hay aviso.
 */
export function computeBadgeCounts(role, pedidos, seenMap, username) {
  const counts = {};
  if (!Array.isArray(pedidos) || pedidos.length === 0) return counts;
  const r = (role || "").trim().toLowerCase();
  const me = (username || "").trim().toLowerCase();
  const seen = seenMap || {};

  const estadoOf = (p) => String(p?.estado || "").trim().toUpperCase();
  const tipoOf = (p) => String(p?.tipo || "salida").trim().toLowerCase();
  const isOwn = (p) => (p?.solicitante_username || "").trim().toLowerCase() === me;

  // --- Aprobaciones: pedidos que el manager debe decidir ---
  // Al igual que /pedidos, respeta el "seen": al entrar en /aprobaciones se
  // marcan como vistos los pedidos en RESERVA, de modo que el contador baja a
  // 0 y solo reaparece cuando llega un pedido nuevo por decidir.
  if (r === "manager" || r === "admin") {
    counts["/aprobaciones"] = pedidos.filter(
      (p) => estadoOf(p) === "RESERVA" && seen[String(p.id)] !== "RESERVA"
    ).length;
  }

  // --- Pedidos: depende del rol ---
  if (r === "proveedor") {
    // Proveedor: reposiciones aprobadas o parciales sin servir completas.
    counts["/pedidos"] = pedidos.filter((p) => {
      if (tipoOf(p) !== "reposicion") return false;
      if (!SERVICEABLE_STATES.has(estadoOf(p))) return false;
      // Ya visto: al entrar en /pedidos se marca como leído y deja de contar.
      if (seen[String(p.id)] === estadoOf(p)) return false;
      const cant = Number((p.items || []).reduce((acc, it) => acc + Number(it.cantidad || 0), 0));
      const servida = Number(
        (p.items || []).reduce((acc, it) => acc + Number(it.cantidad_servida || 0), 0)
      );
      return servida < cant;
    }).length;
  } else if (r === "empresa_externa") {
    // Empresa externa: solo le interesan sus propios pedidos decididos
    // que NO ha "visto" todavía (cambio de estado desde la última vista).
    counts["/pedidos"] = pedidos.filter((p) => {
      if (!isOwn(p)) return false;
      const e = estadoOf(p);
      if (!DECIDED_STATES.has(e)) return false;
      return seen[String(p.id)] !== e;
    }).length;
  } else if (r === "tecnico" || r === "gestor_vivero" || r === "admin") {
    // Roles internos que crean Y sirven pedidos.  Mezclamos dos señales:
    //   (a) Pedidos de salida APROBADO/APROBADO_PARCIAL que aún no están
    //       servidos por completo — requieren acción operativa.
    //   (b) Pedidos propios decididos cuya decisión no han visto todavía.
    let count = 0;
    for (const p of pedidos) {
      const e = estadoOf(p);
      // (a) servir salidas — solo cuenta si aún no se ha "visto" en /pedidos.
      if (tipoOf(p) === "salida" && SERVICEABLE_STATES.has(e)) {
        const cant = Number((p.items || []).reduce((acc, it) => acc + Number(it.cantidad || 0), 0));
        const servida = Number(
          (p.items || []).reduce((acc, it) => acc + Number(it.cantidad_servida || 0), 0)
        );
        if (servida < cant) {
          if (seen[String(p.id)] !== e) count += 1;
          continue;
        }
      }
      // (b) decisión nueva sobre pedido propio
      if (isOwn(p) && DECIDED_STATES.has(e) && seen[String(p.id)] !== e) {
        count += 1;
      }
    }
    if (count > 0) counts["/pedidos"] = count;
  }

  return counts;
}

/**
 * Marca como vistos, en su estado actual, todos los pedidos indicados.
 *
 * `onlyEstado` reproduce el efecto de /aprobaciones, que solo marca los
 * pedidos en RESERVA para no interferir con las señales de /pedidos.
 *
 * Diferencia deliberada con el original: cuando nada cambia se devuelve el
 * mapa anterior en lugar de una copia nueva. El CONTENIDO es idéntico en
 * ambos casos — solo se evita un render y una escritura en localStorage que
 * no aportaban nada. Los dos consumidores (la persistencia y
 * `computeBadgeCounts`) producen exactamente el mismo resultado.
 */
export function markPedidosSeen(prev, pedidos, { onlyEstado } = {}) {
  if (!Array.isArray(pedidos) || pedidos.length === 0) return prev;
  const next = { ...prev };
  let changed = false;
  for (const p of pedidos) {
    if (!p?.id) continue;
    const e = String(p.estado || "").trim().toUpperCase();
    if (!e) continue;
    if (onlyEstado && e !== onlyEstado) continue;
    if (next[String(p.id)] !== e) {
      next[String(p.id)] = e;
      changed = true;
    }
  }
  return changed ? next : prev;
}
