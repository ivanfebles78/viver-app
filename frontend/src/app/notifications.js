/**
 * CONSTRUCTORES DE AVISOS — stock agotado, caducidades y pedidos caducados.
 *
 * Extraído literalmente de `layout/Layout.jsx@main` (líneas 400–631). La lógica
 * es idéntica: solo cambia de fichero.
 *
 * Se separa del shell por la misma razón que los contadores del menú: son
 * funciones puras sobre datos que hoy estaban enterradas en 2.000 líneas de
 * marcado. Aquí se pueden leer, probar y reutilizar; allí solo se podían
 * romper.
 */

import { formatFechaCanaria } from "../utils/fecha";

function getProductName(producto) {
  return (
    producto?.nombre_cientifico ||
    producto?.nombre ||
    producto?.nombre_natural ||
    `Producto #${producto?.id ?? "—"}`
  );
}

export function buildLowStockNotifications(productos) {
  const zeroStockProducts = [];
  const lowStockProducts = [];

  for (const producto of productos || []) {
    const stock = Number(producto?.stock ?? producto?.stock_real ?? 0);
    const min = Number(producto?.stock_minimo ?? 0);

    if (stock <= 0) {
      zeroStockProducts.push(getProductName(producto));
      continue;
    }

    if (Number.isFinite(min) && min > 0 && stock <= min) {
      lowStockProducts.push(`${getProductName(producto)} (${stock}/${min})`);
    }
  }

  if (!zeroStockProducts.length && !lowStockProducts.length) return [];

  const detailParts = [];
  if (zeroStockProducts.length) {
    detailParts.push(
      `Agotados: ${zeroStockProducts.slice(0, 5).join(", ")}${
        zeroStockProducts.length > 5 ? ` y ${zeroStockProducts.length - 5} más` : ""
      }.`
    );
  }
  if (lowStockProducts.length) {
    detailParts.push(
      `Próximos a agotarse: ${lowStockProducts.slice(0, 5).join(", ")}${
        lowStockProducts.length > 5 ? ` y ${lowStockProducts.length - 5} más` : ""
      }.`
    );
  }

  return [
    {
      id: `stock-alert-${zeroStockProducts.length}-${lowStockProducts.length}`,
      type: "stock",
      severity: zeroStockProducts.length ? "high" : "medium",
      title: "Hay productos con stock agotado o próximo a agotarse",
      description: detailParts.join(" "),
    },
  ];
}

function isEstadoCaducado(raw) {
  const s = String(raw || "").trim().toLowerCase();
  return s === "caducado" || s === "expired" || s === "expirado";
}

function isEstadoProximo(raw) {
  const s = String(raw || "").trim().toLowerCase();
  return (
    s === "proximo_a_caducar" ||
    s === "próximo a caducar" ||
    s === "proximo a caducar" ||
    s === "near_expiry"
  );
}

function computeEstadoByDate(fechaStr) {
  if (!fechaStr) return null;
  const d = new Date(fechaStr);
  if (Number.isNaN(d.getTime())) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const f = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((f - hoy) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "caducado";
  if (diffDays <= 7) return "proximo_a_caducar";
  return "vigente";
}

function buildCaducidadNotification({ productName, zona, tamano, fecha, estado, producto, loteUuid }) {
  const estadoFinal =
    (isEstadoCaducado(estado) && "caducado") ||
    (isEstadoProximo(estado) && "proximo_a_caducar") ||
    computeEstadoByDate(fecha);

  if (estadoFinal !== "caducado" && estadoFinal !== "proximo_a_caducar") return null;

  const isCaducado = estadoFinal === "caducado";

  // ID sin `source` ni `idx`: así una misma entrada que aparece en
  // alertas_caducidad y en lotes no se notifica dos veces.
  return {
    id: `cad-${producto?.id ?? productName}-${loteUuid || "sinuuid"}-${zona}-${tamano}-${fecha}-${estadoFinal}`,
    type: "caducidad",
    severity: isCaducado ? "high" : "medium",
    title: isCaducado
      ? `Producto ${productName}, Tamaño ${tamano} en la Zona ${zona} HA CADUCADO`
      : `Producto ${productName}, Tamaño ${tamano} en la Zona ${zona} está próximo a caducar`,
    description: isCaducado
      ? `Caducó el ${fecha}. Retíralo del inventario lo antes posible.`
      : `Fecha estimada de caducidad: ${fecha}.`,
  };
}

export function buildPedidoCaducidadNotifications(pedidos) {
  const notifications = [];
  if (!Array.isArray(pedidos)) return notifications;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  for (const p of pedidos) {
    const estado = String(p?.estado || "").trim().toUpperCase();
    // Solo avisamos sobre pedidos aún "vivos"
    if (!["RESERVA", "APROBADO_PARCIAL", "APROBADO"].includes(estado)) continue;
    if (!p?.fecha_caducidad) continue;

    const d = new Date(p.fecha_caducidad);
    if (Number.isNaN(d.getTime())) continue;
    const f = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.floor((f - hoy) / (1000 * 60 * 60 * 24));

    const fechaTxt = formatFechaCanaria(p.fecha_caducidad);

    if (diffDays < 0) {
      notifications.push({
        id: `pedido-caducado-${p.id}`,
        type: "pedido_caducado",
        severity: "high",
        title: `Tu pedido #${p.id} HA CADUCADO`,
        description: `El pedido caducó el ${fechaTxt}. Contacta con el vivero si aún lo necesitas.`,
      });
    } else if (diffDays <= 3) {
      notifications.push({
        id: `pedido-proximo-${p.id}-${diffDays}`,
        type: "pedido_proximo",
        severity: "medium",
        title: `Tu pedido #${p.id} caduca en ${diffDays === 0 ? "hoy" : diffDays + " día(s)"}`,
        description: `Fecha límite: ${fechaTxt}.`,
      });
    }
  }

  return notifications;
}

export function buildCaducidadNotifications(productos) {
  const notifications = [];
  const seen = new Set();

  const pushUnique = (notif) => {
    if (!notif) return;
    if (seen.has(notif.id)) return;
    seen.add(notif.id);
    notifications.push(notif);
  };

  for (const producto of productos || []) {
    const productName = getProductName(producto);

    const explicitAlerts = Array.isArray(producto?.alertas_caducidad)
      ? producto.alertas_caducidad
      : Array.isArray(producto?.caducidad_alertas)
      ? producto.caducidad_alertas
      : [];

    explicitAlerts.forEach((alert) => {
      const zona = alert?.zona || alert?.zone || alert?.zona_id || "—";
      const tamano = alert?.tamano || alert?.size || "—";
      const fecha = alert?.fecha_caducidad || alert?.caducidad || alert?.fecha || "próximamente";
      pushUnique(
        buildCaducidadNotification({
          productName,
          zona,
          tamano,
          fecha,
          estado: alert?.estado,
          producto,
          loteUuid: alert?.uuid_lote || alert?.lote_uuid,
        })
      );
    });

    const lotes = Array.isArray(producto?.lotes)
      ? producto.lotes
      : Array.isArray(producto?.batches)
      ? producto.batches
      : [];

    lotes.forEach((lote) => {
      const zona = lote?.zona || lote?.zone || lote?.zona_id || "—";
      const tamano = lote?.tamano || lote?.size || "—";
      const fecha = lote?.fecha_caducidad || lote?.caducidad || lote?.expiry_date || "próximamente";
      pushUnique(
        buildCaducidadNotification({
          productName,
          zona,
          tamano,
          fecha,
          estado: lote?.estado,
          producto,
          loteUuid: lote?.uuid_lote || lote?.uuid,
        })
      );
    });
  }

  return notifications;
}

/**
 * Todos los avisos que corresponden a este usuario.
 *
 * Empresa externa solo ve los de SUS pedidos; el resto de roles ven los del
 * inventario del vivero. Es la misma condición que aplicaba Layout.jsx.
 */
export function buildAllNotifications({ productos, pedidos, esEmpresaExterna }) {
  if (esEmpresaExterna) return buildPedidoCaducidadNotifications(pedidos);
  return [...buildLowStockNotifications(productos), ...buildCaducidadNotifications(productos)];
}
