import React, { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearStoredToken, getMe, getProductos, getZonaItems, getPedidos, marcarZonaInterna } from "../api/api";
import ClienteSelector from "../components/common/ClienteSelector";
import mapaVivero from "../assets/mapa-vivero.png";
import zonasDefault from "../components/vivero/zonasConfig";
import ZoneEditor from "../components/vivero/ZoneEditor";
import {
  loadZonasFromServer,
  saveZonasToServer,
} from "../components/vivero/zonesStorage";
import { formatUsername } from "../utils/format";
import { formatCantidad } from "../utils/numero";
import { formatFechaCanaria } from "../utils/fecha";
import WelcomeModal, { shouldShowWelcomeOnStart } from "../components/welcome/WelcomeModal";

// Flip to true to re-enable the in-app zone editor (button + drag UI).
const ENABLE_ZONE_EDITOR = true;

const MAP_WIDTH = 2048;
const MAP_HEIGHT = 1365;
const NOTIFICATIONS_STORAGE_KEY = "vivero_global_notifications_read";
// Per-user tracking of which pedido_id → estado the user has already
// "seen" in the Pedidos page.  Used to surface a badge on the menu
// link the next time the state of one of their pedidos changes (e.g.
// from RESERVA to APROBADO_PARCIAL).  Cleared role-wise by the
// effect that runs when the user opens /pedidos.
const SEEN_PEDIDOS_STORAGE_KEY = "vivero_seen_pedidos_v1";

const DECIDED_STATES = new Set(["APROBADO", "APROBADO_PARCIAL", "DENEGADO", "SERVIDO"]);
const SERVICEABLE_STATES = new Set(["APROBADO", "APROBADO_PARCIAL"]);

function loadSeenPedidosFromStorage() {
  try {
    const raw = localStorage.getItem(SEEN_PEDIDOS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveSeenPedidosToStorage(seen) {
  try {
    localStorage.setItem(SEEN_PEDIDOS_STORAGE_KEY, JSON.stringify(seen || {}));
  } catch {
    // localStorage might be unavailable (private browsing, quotas).  No-op.
  }
}

/**
 * Compute badge counts per nav route based on the user's role and the
 * pedidos visible to them.
 *
 * Returns: { [path]: number }, e.g. { "/aprobaciones": 3, "/pedidos": 2 }.
 * A 0 / missing entry means no badge.
 */
function computeBadgeCounts(role, pedidos, seenMap, username) {
  const counts = {};
  if (!Array.isArray(pedidos) || pedidos.length === 0) return counts;
  const r = (role || "").trim().toLowerCase();
  const me = (username || "").trim().toLowerCase();

  const estadoOf = (p) => String(p?.estado || "").trim().toUpperCase();
  const tipoOf   = (p) => String(p?.tipo || "salida").trim().toLowerCase();
  const isOwn    = (p) => (p?.solicitante_username || "").trim().toLowerCase() === me;

  // --- Aprobaciones: pedidos que el manager debe decidir ---
  // Al igual que /pedidos, respeta el "seen": al entrar en /aprobaciones se
  // marcan como vistos los pedidos en RESERVA, de modo que el contador baja a
  // 0 y solo reaparece cuando llega un pedido nuevo por decidir.
  if (r === "manager" || r === "admin") {
    counts["/aprobaciones"] = pedidos.filter(
      (p) => estadoOf(p) === "RESERVA" && seenMap[String(p.id)] !== "RESERVA"
    ).length;
  }

  // --- Pedidos: depende del rol ---
  if (r === "proveedor") {
    // Proveedor: reposiciones aprobadas o parciales sin servir completas.
    counts["/pedidos"] = pedidos.filter((p) => {
      if (tipoOf(p) !== "reposicion") return false;
      if (!SERVICEABLE_STATES.has(estadoOf(p))) return false;
      // Ya visto: al entrar en /pedidos se marca como leído y deja de contar.
      if (seenMap[String(p.id)] === estadoOf(p)) return false;
      const cant = Number(
        (p.items || []).reduce((acc, it) => acc + Number(it.cantidad || 0), 0)
      );
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
      return seenMap[String(p.id)] !== e;
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
        const cant = Number(
          (p.items || []).reduce((acc, it) => acc + Number(it.cantidad || 0), 0)
        );
        const servida = Number(
          (p.items || []).reduce((acc, it) => acc + Number(it.cantidad_servida || 0), 0)
        );
        if (servida < cant) {
          if (seenMap[String(p.id)] !== e) count += 1;
          continue;
        }
      }
      // (b) decisión nueva sobre pedido propio
      if (isOwn(p) && DECIDED_STATES.has(e) && seenMap[String(p.id)] !== e) {
        count += 1;
      }
    }
    if (count > 0) counts["/pedidos"] = count;
  }

  return counts;
}

/**
 * Renders a small red pill with a number, anchored to the right of a
 * nav link.  Used by the sidebar to surface "needs attention" counts.
 */
function NavBadge({ count }) {
  if (!count || count <= 0) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 22,
        height: 22,
        padding: "0 7px",
        marginLeft: "auto",
        borderRadius: 999,
        background: "#dc2626",
        color: "white",
        fontSize: 12,
        fontWeight: 900,
        lineHeight: 1,
        boxShadow: "0 1px 3px rgba(220, 38, 38, 0.40)",
      }}
      aria-label={`${count} pendientes`}
      title={`${count} pendiente(s)`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

const NAV_ITEMS = [
  { to: "/dashboard", label: "Panel de control" },
  { to: "/productos", label: "Productos" },
  { to: "/movimientos", label: "Movimientos" },
  { to: "/pedidos", label: "Pedidos" },
  { to: "/aprobaciones", label: "Aprobaciones" },
  { to: "/informes", label: "Informes" },
];

function getVisibleNavItems(role) {
  if (!role) return [];

  if (role === "admin") {
    return NAV_ITEMS;
  }

  if (role === "tecnico") {
    return NAV_ITEMS.filter((i) =>
      ["/dashboard", "/productos", "/movimientos", "/pedidos", "/informes"].includes(i.to)
    );
  }

  if (role === "manager") {
    return NAV_ITEMS.filter((i) =>
      ["/dashboard", "/productos", "/movimientos", "/aprobaciones", "/informes"].includes(i.to)
    );
  }

  if (role === "gestor_vivero") {
    return NAV_ITEMS.filter((i) =>
      ["/dashboard", "/productos", "/movimientos", "/pedidos", "/informes"].includes(i.to)
    );
  }

  if (role === "empresa_externa") {
    return NAV_ITEMS.filter((i) =>
      ["/productos", "/pedidos", "/informes"].includes(i.to)
    );
  }

  // Proveedor: rol de SOLO CONSULTA. Únicamente ve los pedidos de
  // reposición aprobados y puede imprimirlos. Nada más en el menú.
  if (role === "proveedor") {
    return NAV_ITEMS.filter((i) => i.to === "/pedidos");
  }

  return [];
}

function getDefaultRouteForRole(role) {
  if (role === "admin") return "/dashboard";
  if (role === "tecnico") return "/dashboard";
  if (role === "manager") return "/dashboard";
  if (role === "gestor_vivero") return "/dashboard";
  if (role === "empresa_externa") return "/productos";
  if (role === "proveedor") return "/pedidos";
  return "/dashboard";
}

function isPathAllowedForRole(pathname, role) {
  if (!role) return false;

  if (pathname === "/") return true;

  if (role === "admin") {
    return [
      "/dashboard",
      "/productos",
      "/movimientos",
      "/pedidos",
      "/aprobaciones",
      "/informes",
      "/lotes",
      "/vivero",
      "/admin/usuarios",
    ].includes(pathname);
  }

  if (role === "tecnico") {
    return [
      "/dashboard",
      "/productos",
      "/movimientos",
      "/pedidos",
      "/informes",
      "/lotes",
      "/vivero",
    ].includes(pathname);
  }

  if (role === "manager") {
    return [
      "/dashboard",
      "/productos",
      "/movimientos",
      "/aprobaciones",
      "/informes",
      "/lotes",
      "/vivero",
    ].includes(pathname);
  }

  if (role === "gestor_vivero") {
    return [
      "/dashboard",
      "/productos",
      "/movimientos",
      "/pedidos",
      "/informes",
      "/lotes",
      "/vivero",
    ].includes(pathname);
  }

  if (role === "empresa_externa") {
    return ["/productos", "/pedidos", "/informes"].includes(pathname);
  }

  // Proveedor: solo /pedidos.
  if (role === "proveedor") {
    return pathname === "/pedidos";
  }

  return false;
}

function navBtnStyle(active) {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    width: "100%",
    minHeight: 50,
    padding: "0 18px",
    borderRadius: 18,
    textDecoration: "none",
    fontWeight: 900,
    fontSize: 16,
    border: active ? "1px solid rgba(6,182,212,0.28)" : "1px solid rgba(15,23,42,0.06)",
    background: active
      ? "linear-gradient(135deg, #06b6d4 0%, #10b981 100%)"
      : "white",
    color: active ? "white" : "#0f172a",
    boxShadow: active ? "0 12px 30px rgba(6,182,212,0.18)" : "none",
    transition: "all 0.2s ease",
    boxSizing: "border-box",
    cursor: "pointer",
  };
}

function closeButtonStyle() {
  return {
    padding: "10px 16px",
    borderRadius: 14,
    fontWeight: 900,
    cursor: "pointer",
    transition: "all 0.18s ease",
    background: "#f59e0b",
    color: "#111827",
    border: "2px solid #000000",
    boxShadow: "0 8px 18px rgba(0,0,0,0.18)",
  };
}

function topLogoutButtonStyle() {
  return {
    padding: "10px 16px",
    borderRadius: 14,
    border: "2px solid #000000",
    background: "#ef4444",
    color: "white",
    fontWeight: 900,
    fontSize: 14,
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(0,0,0,0.14)",
    transition: "all 0.18s ease",
  };
}

function notificationButtonStyle(hasUnread) {
  return {
    position: "relative",
    width: 62,
    height: 62,
    borderRadius: 20,
    border: hasUnread
      ? "1px solid rgba(239,68,68,0.18)"
      : "1px solid rgba(15,23,42,0.08)",
    background: hasUnread
      ? "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(254,242,242,0.98) 100%)"
      : "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    boxShadow: hasUnread
      ? "0 16px 34px rgba(239,68,68,0.14)"
      : "0 12px 28px rgba(2,6,23,0.07)",
    transition: "transform 0.18s ease, box-shadow 0.22s ease, border-color 0.22s ease",
    animation: hasUnread ? "bellFloat 2.6s ease-in-out infinite" : "none",
  };
}

function getZoneAliases(zone) {
  const idRaw = String(zone?.id || "").trim();
  const idUpper = idRaw.toUpperCase();

  const nombreRaw = String(zone?.nombre || "").trim();
  const nombreUpper = nombreRaw.toUpperCase();

  const nombreSinZona = nombreRaw.replace(/^zona\s*/i, "").trim();
  const nombreSinZonaUpper = nombreSinZona.toUpperCase();

  const aliases = [
    idRaw,
    idUpper,
    `zona-${idRaw}`,
    `zona-${idUpper}`,
    `Zona ${idUpper}`,
    `ZONA ${idUpper}`,
    nombreRaw,
    nombreUpper,
    nombreSinZona,
    nombreSinZonaUpper,
    `Zona ${nombreSinZonaUpper}`,
    `ZONA ${nombreSinZonaUpper}`,
  ].filter(Boolean);

  return [...new Set(aliases)];
}

function getProductName(producto) {
  return (
    producto?.nombre_cientifico ||
    producto?.nombre ||
    producto?.nombre_natural ||
    `Producto #${producto?.id ?? "—"}`
  );
}

function getReadNotificationsFromStorage() {
  try {
    const raw = window.localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveReadNotificationsToStorage(ids) {
  try {
    window.localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // noop
  }
}

function buildLowStockNotifications(productos) {
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

  // ID sin `source` ni `idx`: así una misma entrada que aparece en alertas_caducidad
  // y en lotes no se notifica dos veces.
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

function buildPedidoCaducidadNotifications(pedidos) {
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

function buildCaducidadNotifications(productos) {
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


function ViverAppLoadingScreen({ message = "Cargando datos del vivero..." }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(circle at 18% 18%, rgba(16,185,129,0.20), transparent 30%), radial-gradient(circle at 82% 12%, rgba(6,182,212,0.18), transparent 28%), linear-gradient(135deg, #ecfdf5 0%, #f8fafc 45%, #e0f2fe 100%)",
        overflow: "hidden",
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      <style>{`
        @keyframes viverLoaderFloat {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-5px) scale(1.015); }
        }
        @keyframes viverLoaderProgress {
          0% { transform: translateX(-110%); }
          100% { transform: translateX(110%); }
        }
        @keyframes viverSkeletonPulse {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 1; }
        }
      `}</style>

      <div
        style={{
          width: "min(720px, 94vw)",
          borderRadius: 34,
          border: "1px solid rgba(255,255,255,0.65)",
          background: "rgba(255,255,255,0.82)",
          boxShadow: "0 40px 110px rgba(15,23,42,0.16)",
          backdropFilter: "blur(18px)",
          padding: "34px 34px 30px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 88,
            height: 88,
            margin: "0 auto 18px",
            borderRadius: 28,
            background: "linear-gradient(135deg, rgba(6,182,212,0.16), rgba(16,185,129,0.18))",
            border: "1px solid rgba(6,182,212,0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 18px 44px rgba(6,182,212,0.18)",
            animation: "viverLoaderFloat 2.8s ease-in-out infinite",
          }}
        >
          <img
            src="/logo.png"
            alt="ViverApp"
            style={{ width: 62, height: 62, objectFit: "contain" }}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </div>

        <div style={{ fontSize: 32, fontWeight: 950, letterSpacing: "-0.04em", color: "#0f172a" }}>
          ViverApp
        </div>
        <div style={{ marginTop: 6, fontSize: 16, fontWeight: 800, color: "#64748b" }}>
          {message}
        </div>

        <div
          style={{
            height: 10,
            borderRadius: 999,
            background: "rgba(15,23,42,0.08)",
            overflow: "hidden",
            margin: "26px auto 24px",
            width: "min(420px, 90%)",
          }}
        >
          <div
            style={{
              height: "100%",
              width: "54%",
              borderRadius: 999,
              background: "linear-gradient(90deg, #06b6d4 0%, #10b981 100%)",
              animation: "viverLoaderProgress 1.35s ease-in-out infinite",
            }}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 12,
            marginTop: 8,
          }}
        >
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              style={{
                height: 88,
                borderRadius: 22,
                background: "rgba(248,250,252,0.86)",
                border: "1px solid rgba(15,23,42,0.06)",
                padding: 14,
                boxSizing: "border-box",
                animation: "viverSkeletonPulse 1.6s ease-in-out infinite",
                animationDelay: `${item * 0.16}s`,
              }}
            >
              <div style={{ height: 12, borderRadius: 999, background: "rgba(148,163,184,0.26)", width: "62%" }} />
              <div style={{ height: 20, borderRadius: 999, background: "rgba(148,163,184,0.20)", width: "86%", marginTop: 14 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ZonePanelLoading() {
  return (
    <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          style={{
            padding: 14,
            borderRadius: 16,
            border: "1px solid rgba(15,23,42,0.08)",
            background: "rgba(248,250,252,0.72)",
          }}
        >
          <div style={{ height: 14, width: "62%", borderRadius: 999, background: "rgba(148,163,184,0.26)", marginBottom: 10 }} />
          <div style={{ height: 12, width: "84%", borderRadius: 999, background: "rgba(148,163,184,0.20)", marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ height: 26, width: 82, borderRadius: 999, background: "rgba(6,182,212,0.12)" }} />
            <span style={{ height: 26, width: 72, borderRadius: 999, background: "rgba(6,182,212,0.10)" }} />
            <span style={{ height: 26, width: 94, borderRadius: 999, background: "rgba(6,182,212,0.08)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function AlertBellIcon({ hasUnread }) {
  const color = hasUnread ? "#dc2626" : "#0f172a";

  return (
    <svg width="31" height="31" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9.25 20C9.58 20.93 10.47 21.6 11.5 21.6C12.53 21.6 13.42 20.93 13.75 20M5.9 16.85C5.38 16.85 5.12 16.85 4.97 16.76C4.84 16.67 4.74 16.54 4.69 16.39C4.64 16.22 4.72 15.97 4.9 15.48C5.22 14.61 5.79 13.84 6.52 13.27L6.75 13.09V10.5C6.75 7.74 8.87 5.45 11.56 5.21C14.59 4.94 17.15 7.33 17.15 10.3V13.09L17.38 13.27C18.11 13.84 18.68 14.61 19 15.48C19.18 15.97 19.26 16.22 19.21 16.39C19.16 16.54 19.06 16.67 18.93 16.76C18.78 16.85 18.52 16.85 18 16.85H5.9Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.2 4.7C9.46 3.72 10.35 3 11.4 3C12.45 3 13.34 3.72 13.6 4.7"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NotificationModal({ open, onClose, notifications, onMarkAsRead }) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,6,23,0.55)",
        zIndex: 2100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "min(780px, 96vw)",
          maxHeight: "88vh",
          background: "white",
          borderRadius: 24,
          overflow: "hidden",
          boxShadow: "0 30px 80px rgba(2,6,23,0.35)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "20px 22px",
            borderBottom: "1px solid rgba(15,23,42,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#0f172a" }}>Alertas y notificaciones</div>
            <div style={{ color: "#64748b", fontWeight: 700 }}>
              Pendientes de leer: {notifications.length}
            </div>
          </div>

          <button onClick={onClose} style={closeButtonStyle()}>
            Cerrar
          </button>
        </div>

        <div style={{ padding: 22, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          {notifications.length === 0 ? (
            <div
              style={{
                borderRadius: 18,
                border: "1px solid rgba(16,185,129,0.16)",
                background: "rgba(16,185,129,0.08)",
                padding: 18,
                color: "#065f46",
                fontWeight: 800,
              }}
            >
              No hay notificaciones pendientes de leer.
            </div>
          ) : (
            notifications.map((notification) => {
              const isHigh = notification.severity === "high";
              return (
                <div
                  key={notification.id}
                  style={{
                    border: isHigh
                      ? "1px solid rgba(239,68,68,0.18)"
                      : "1px solid rgba(245,158,11,0.18)",
                    background: isHigh ? "rgba(254,242,242,0.78)" : "rgba(255,251,235,0.85)",
                    borderRadius: 18,
                    padding: 16,
                    boxShadow: "0 10px 24px rgba(2,6,23,0.05)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 14 }}>
                    <div>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 900,
                          color: isHigh ? "#991b1b" : "#92400e",
                        }}
                      >
                        {notification.title}
                      </div>
                      <div style={{ marginTop: 8, color: "#334155", fontWeight: 700, lineHeight: 1.45 }}>
                        {notification.description}
                      </div>
                    </div>

                    <button
                      onClick={() => onMarkAsRead(notification.id)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(15,23,42,0.10)",
                        background: "white",
                        color: "#0f172a",
                        fontWeight: 900,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Marcar como leído
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

const ZONA_ITEMS_STEP = 8; // cuántos productos se muestran por tanda

function ZonaMapModal({ open, onClose, isAdmin = false }) {
  const [selectedZone, setSelectedZone] = useState(null);
  const [zonaData, setZonaData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [zonaError, setZonaError] = useState("");
  const [internaBusy, setInternaBusy] = useState(false);
  // Nº de productos visibles (paginación "Mostrar más"). Se reinicia al cambiar
  // de zona.
  const [visibleCount, setVisibleCount] = useState(ZONA_ITEMS_STEP);
  useEffect(() => {
    setVisibleCount(ZONA_ITEMS_STEP);
  }, [selectedZone]);

  // Arrancamos con los defaults estáticos para pintar instantáneamente.
  // El useEffect refresca desde el servidor cuando el modal se abre.
  const [zonas, setZonas] = useState(zonasDefault);
  const [editMode, setEditMode] = useState(false);
  const [savingZonas, setSavingZonas] = useState(false);

  const canEdit = ENABLE_ZONE_EDITOR && isAdmin;

  const zonePolygons = useMemo(
    () => (Array.isArray(zonas) ? zonas.filter((z) => !z.disabled) : []),
    [zonas]
  );

  // Cuando se abre el modal, recarga las zonas desde el servidor.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadZonasFromServer().then((data) => {
      if (!cancelled) setZonas(data);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleEditorSave = async (updatedZonas) => {
    setSavingZonas(true);
    try {
      const saved = await saveZonasToServer(updatedZonas);
      setZonas(Array.isArray(saved) && saved.length > 0 ? saved : updatedZonas);
      setEditMode(false);
    } catch (err) {
      console.error("Error guardando zonas en servidor:", err);
      window.alert(
        "No se pudo guardar la configuración de zonas en el servidor. " +
          "Revisa la conexión y vuelve a intentarlo."
      );
    } finally {
      setSavingZonas(false);
    }
  };

  const selectedZoneLabel =
    zonePolygons.find((z) => String(z.id) === String(selectedZone))?.nombre ||
    (selectedZone ? `Zona ${String(selectedZone).toUpperCase()}` : "Selecciona una zona");

  // Resuelve el identificador a consultar contra el backend. La config de zonas
  // del servidor puede tener ids/apiIds corruptos (p. ej. "zona-3" para la celda
  // 3b), así que mapeamos la zona contra la config canónica (zonasConfig) y
  // usamos su apiId real. Así "Zona 3 B" consulta "3b".
  //
  // Estrategia, de más fiable a menos:
  //  1) Por GEOMETRÍA: los puntos del polígono dibujado sobre la celda son
  //     idénticos a los de la config canónica (la celda está en su sitio),
  //     así que casan aunque el id/nombre estén corruptos.
  //  2) Por nombre canónico.
  //  3) Por id / apiId (tolerante al prefijo "zona", como hace el backend).
  //  4) Fallback: quitamos el prefijo "zona-" del apiId o del id.
  const resolveZoneApiId = (zone) => {
    // Normalización base (sin tildes, sin separadores).
    const norm = (s) =>
      String(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]/g, "");
    // Igual que _normalize_zona_id del backend: quita el prefijo "zona".
    const normZona = (s) => {
      let r = norm(s);
      if (r.startsWith("zonazona")) r = r.slice(8);
      if (r.startsWith("zona")) r = r.slice(4);
      return r;
    };
    const normPuntos = (s) => String(s || "").replace(/\s+/g, " ").trim();

    // 1) Por geometría.
    if (zone?.puntos) {
      const porPuntos = zonasDefault.find((c) => normPuntos(c.puntos) === normPuntos(zone.puntos));
      if (porPuntos?.apiId) return porPuntos.apiId;
    }
    // 2) Por nombre canónico.
    const porNombre = zonasDefault.find((c) => normZona(c.nombre) === normZona(zone?.nombre));
    if (porNombre?.apiId) return porNombre.apiId;
    // 3) Por id / apiId canónico.
    const porId = zonasDefault.find(
      (c) =>
        normZona(c.id) === normZona(zone?.id) ||
        (zone?.apiId && normZona(c.apiId) === normZona(zone?.apiId)) ||
        normZona(c.apiId) === normZona(zone?.id)
    );
    if (porId?.apiId) return porId.apiId;
    // 4) Fallback: quita el prefijo "zona-" del apiId o del id.
    return String(zone?.apiId || zone?.id || "").replace(/^zona[-_]?/i, "");
  };

  const loadZone = async (zone) => {
    setSelectedZone(zone?.id);
    setZonaError("");
    setLoading(true);
    setZonaData(null);

    const zoneId = resolveZoneApiId(zone);
    try {
      const data = await getZonaItems(zoneId);
      setZonaData({ ...(data || {}), _resolvedZone: zoneId });
    } catch (e) {
      setZonaData(null);
      setZonaError(
        e?.response?.data?.detail || e?.message || "No se pudo cargar el stock de la zona"
      );
    } finally {
      setLoading(false);
    }
  };

  // Marcar/desmarcar como interna la zona actual (solo admin).
  const handleMarcarInterna = async (checked) => {
    const zid = zonaData?._resolvedZone;
    if (!zid) return;
    setInternaBusy(true);
    setZonaError("");
    try {
      await marcarZonaInterna(zid, checked);
      const data = await getZonaItems(zid);
      setZonaData({ ...(data || {}), _resolvedZone: zid });
      try { window.dispatchEvent(new Event("vivero:data-changed")); } catch { /* noop */ }
    } catch (e) {
      setZonaError(e?.response?.data?.detail || e?.message || "No se pudo actualizar la zona.");
    } finally {
      setInternaBusy(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setSelectedZone(null);
      setZonaData(null);
      setZonaError("");
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  if (editMode && canEdit) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(2,6,23,0.55)",
          zIndex: 2000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            width: "min(1700px, 98vw)",
            maxHeight: "94vh",
            overflow: "auto",
            background: "white",
            borderRadius: 24,
            padding: 20,
            boxShadow: "0 30px 80px rgba(2,6,23,0.35)",
          }}
        >
          <ZoneEditor
            zonas={zonas}
            onSave={handleEditorSave}
            onCancel={() => setEditMode(false)}
            saving={savingZonas}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,6,23,0.55)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "min(1600px, 96vw)",
          maxHeight: "92vh",
          background: "white",
          borderRadius: 24,
          overflow: "hidden",
          boxShadow: "0 30px 80px rgba(2,6,23,0.35)",
          display: "grid",
          gridTemplateColumns: "1.45fr 0.8fr",
        }}
      >
        <div style={{ padding: 20, borderRight: "1px solid rgba(15,23,42,0.08)", minHeight: 0, overflowY: "auto" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
              gap: 14,
            }}
          >
            <div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#0f172a" }}>Mapa del vivero</div>
              <div style={{ color: "#64748b", fontWeight: 700 }}>
                Haz clic en una zona para ver productos, cantidades y tamaños.
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {canEdit && (
                <button
                  onClick={() => setEditMode(true)}
                  style={{
                    padding: "8px 14px",
                    background: "#0f5132",
                    color: "#ffffff",
                    border: 0,
                    borderRadius: 8,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Editar zonas
                </button>
              )}
              <button onClick={onClose} style={closeButtonStyle()}>
                Cerrar
              </button>
            </div>
          </div>

          <div
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}`,
              borderRadius: 18,
              overflow: "hidden",
              border: "1px solid rgba(15,23,42,0.06)",
              background: "#f8fafc",
            }}
          >
            <img
              src={mapaVivero}
              alt="Mapa del vivero"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
              }}
            />

            <svg
              viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
              preserveAspectRatio="xMidYMid meet"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
              }}
            >
              {zonePolygons.map((z) => (
                <g key={z.id}>
                  <polygon
                    points={z.puntos}
                    onClick={() => loadZone(z)}
                    style={{
                      fill: selectedZone === z.id ? "rgba(6,182,212,0.25)" : "rgba(0,0,0,0)",
                      stroke: selectedZone === z.id ? "#06b6d4" : "rgba(255,255,255,0)",
                      strokeWidth: 4,
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                  />
                </g>
              ))}
            </svg>
          </div>
        </div>

        <div style={{ padding: 20, overflowY: "auto", minHeight: 0, maxHeight: "86vh" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#0f172a" }}>
            {selectedZone ? selectedZoneLabel : "Selecciona una zona"}
          </div>

          {selectedZone && !loading && !zonaError && zonaData?.items?.length ? (
            <div style={{ marginTop: 2, fontSize: 14, fontWeight: 800, color: "#1e3a8a" }}>
              {zonaData.items.length} {zonaData.items.length === 1 ? "producto" : "productos"} en esta zona
            </div>
          ) : null}

          {isAdmin && selectedZone && !loading && !zonaError && zonaData?.items?.length ? (
            <label
              style={{
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(15,23,42,0.12)",
                background: zonaData.todos_internos ? "rgba(239,68,68,0.06)" : "#f8fafc",
                cursor: internaBusy ? "wait" : "pointer",
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              <input
                type="checkbox"
                checked={!!zonaData.todos_internos}
                disabled={internaBusy}
                onChange={(e) => handleMarcarInterna(e.target.checked)}
                style={{ width: 18, height: 18, cursor: internaBusy ? "wait" : "pointer" }}
              />
              <span>
                Marcar zona como interna
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, marginTop: 2 }}>
                  {internaBusy
                    ? "Actualizando…"
                    : "Si está marcada, todos los productos de esta zona son internos y la empresa externa no los ve ni los puede pedir."}
                </div>
              </span>
            </label>
          ) : null}

          {!selectedZone ? (
            <div style={{ marginTop: 12, color: "#64748b", fontWeight: 700 }}>
              Selecciona una zona del mapa para consultar su inventario.
            </div>
          ) : loading ? (
            <ZonePanelLoading />
          ) : zonaError ? (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 14,
                border: "1px solid rgba(239,68,68,0.25)",
                background: "rgba(239,68,68,0.08)",
                color: "#991b1b",
                fontWeight: 800,
              }}
            >
              {zonaError}
            </div>
          ) : !zonaData?.items?.length ? (
            <div
              style={{
                marginTop: 12,
                color: "#92400e",
                fontWeight: 800,
                background: "rgba(245,158,11,0.10)",
                border: "1px solid rgba(245,158,11,0.25)",
                borderRadius: 12,
                padding: 12,
              }}
            >
              No se encontraron productos para esta zona con el identificador consultado.
              {zonaData?._resolvedZone ? ` Consulta usada: ${zonaData._resolvedZone}` : ""}
            </div>
          ) : (
            <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
              {zonaData.items.slice(0, visibleCount).map((item, idx) => (
                <div
                  key={`${item.producto_id || item.nombre_cientifico || "item"}-${idx}`}
                  style={{
                    padding: 14,
                    borderRadius: 16,
                    border: "1px solid rgba(15,23,42,0.08)",
                    background: "rgba(248,250,252,0.72)",
                  }}
                >
                  <div style={{ fontWeight: 900, color: "#0f172a" }}>
                    {item.nombre_cientifico || item.nombre_natural || "Producto"}
                  </div>

                  <div style={{ marginTop: 4, color: "#64748b", fontWeight: 700 }}>
                    {item.nombre_natural || "—"}
                    {item.categoria ? ` · ${item.categoria}` : ""}
                    {item.subcategoria ? ` · ${item.subcategoria}` : ""}
                  </div>

                  <div style={{ marginTop: 8, fontWeight: 900, color: "#0f172a" }}>
                    Cantidad total: {formatCantidad(item.cantidad ?? 0) || "0"}
                  </div>

                  <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {(item.tamanos || []).length === 0 ? (
                      <span style={{ color: "#64748b", fontWeight: 700 }}>Sin detalle por tamaño</span>
                    ) : (
                      item.tamanos.map((t, tIdx) => (
                        <span
                          key={`${item.producto_id || item.nombre_cientifico || "item"}-${t.tamano || tIdx}`}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 999,
                            background: "rgba(6,182,212,0.10)",
                            border: "1px solid rgba(6,182,212,0.18)",
                            color: "#0f172a",
                            fontWeight: 900,
                            fontSize: 12,
                          }}
                        >
                          {t.tamano}: {formatCantidad(t.cantidad)}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              ))}

              {zonaData.items.length > visibleCount && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((c) => c + ZONA_ITEMS_STEP)}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px dashed rgba(6,182,212,0.5)",
                    background: "rgba(6,182,212,0.06)",
                    color: "#0e7490",
                    fontWeight: 900,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  Mostrar más ({zonaData.items.length - visibleCount} restantes)
                </button>
              )}
              {visibleCount > ZONA_ITEMS_STEP && (
                <button
                  type="button"
                  onClick={() => setVisibleCount(ZONA_ITEMS_STEP)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(148,163,184,0.35)",
                    background: "#fff",
                    color: "#475569",
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Mostrar menos
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();

  const [me, setMe] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [productos, setProductos] = useState([]);
  const [pedidosUsuario, setPedidosUsuario] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState(() =>
    getReadNotificationsFromStorage()
  );
  const [seenPedidos, setSeenPedidos] = useState(() => loadSeenPedidosFromStorage());

  // Modal de bienvenida: se abre automáticamente al entrar al Dashboard si:
  //   - es la primera vez (no hay flag "viverapp_welcome_seen" en localStorage), o
  //   - el usuario marcó "Mostrar al iniciar" en una visita anterior.
  // En cualquier otro caso el usuario puede reabrirlo desde el botón "?" del header.
  useEffect(() => {
    if (location.pathname !== "/dashboard") return;
    if (!me) return; // espera a tener al usuario cargado para no abrirlo antes de la sesión
    if (shouldShowWelcomeOnStart()) {
      setWelcomeOpen(true);
    }
    // Solo evaluamos al cambiar de ruta o al cargar al usuario; el modal queda
    // bajo control manual a partir de ahí.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, me?.id]);

  useEffect(() => {
    const loadMe = async () => {
      try {
        const data = await getMe();
        setMe(data);
        try {
          window.localStorage.setItem("user", JSON.stringify(data));
        } catch {
          // noop
        }
      } catch {
        clearStoredToken();
        navigate("/login");
      }
    };

    loadMe();
  }, [navigate]);

  const rolReal = (me?.rol || me?.role || "").trim().toLowerCase();
  // `superadmin` (plataforma) y `admin_vivero` (admin del vivero) navegan igual
  // que `admin`; el aislamiento por ayuntamiento lo garantiza el backend. Para
  // la navegación los tratamos como admin.
  const rolActual =
    rolReal === "admin_vivero" || rolReal === "superadmin" ? "admin" : rolReal;
  // superadmin = dueño global de la plataforma: elige ayuntamiento y ve el
  // panel de plataforma.
  const esSuperadmin =
    !!(me?.es_superadmin || me?.es_admin_global) || rolReal === "superadmin";
  const esAdminGlobal = esSuperadmin;
  const esEmpresaExternaRol = rolActual === "empresa_externa";

  // Recarga los datos que alimentan los badges del menú (pedidos y, para roles
  // internos, productos). Reutilizable: al cambiar de ruta, al enfocar la
  // ventana, por intervalo y tras cualquier acción (evento "vivero:data-changed").
  const refreshBadgeData = useCallback(async () => {
    if (!me) return;
    if (esEmpresaExternaRol) {
      setProductos([]);
      try {
        const data = await getPedidos();
        setPedidosUsuario(Array.isArray(data) ? data : []);
      } catch { /* noop */ }
      return;
    }
    try {
      const data = await getProductos();
      setProductos(Array.isArray(data) ? data : []);
    } catch { /* noop */ }
    try {
      const data = await getPedidos();
      setPedidosUsuario(Array.isArray(data) ? data : []);
    } catch { /* noop */ }
  }, [me, esEmpresaExternaRol]);

  useEffect(() => {
    refreshBadgeData();
  }, [location.pathname, refreshBadgeData]);

  // Refresca los badges sin cambiar de pantalla: tras cualquier acción que
  // modifique datos, al volver a enfocar la ventana y periódicamente.
  useEffect(() => {
    if (!me) return;
    const onChanged = () => { refreshBadgeData(); };
    window.addEventListener("vivero:data-changed", onChanged);
    window.addEventListener("focus", onChanged);
    const intervalId = setInterval(refreshBadgeData, 30000);
    return () => {
      window.removeEventListener("vivero:data-changed", onChanged);
      window.removeEventListener("focus", onChanged);
      clearInterval(intervalId);
    };
  }, [me, refreshBadgeData]);

  useEffect(() => {
    saveReadNotificationsToStorage(readNotificationIds);
  }, [readNotificationIds]);

  // Persist the per-user "seen pedido state" map.
  useEffect(() => {
    saveSeenPedidosToStorage(seenPedidos);
  }, [seenPedidos]);

  // Mark every pedido visible to the user as "seen at its current state"
  // every time they land on /pedidos.  This drops the badge to 0 for the
  // solicitante-side notifications.  Action-required badges (manager /
  // proveedor / gestor-servidor) are NOT affected — they're recomputed
  // from live data and only decrease when the underlying action is taken.
  useEffect(() => {
    if (location.pathname !== "/pedidos") return;
    if (!Array.isArray(pedidosUsuario) || pedidosUsuario.length === 0) return;
    setSeenPedidos((prev) => {
      const next = { ...prev };
      for (const p of pedidosUsuario) {
        if (!p?.id) continue;
        const e = String(p.estado || "").trim().toUpperCase();
        if (!e) continue;
        next[String(p.id)] = e;
      }
      return next;
    });
  }, [location.pathname, pedidosUsuario]);

  // Al entrar en /aprobaciones (manager/admin), marca como vistos los pedidos
  // en RESERVA — los que generan el badge de aprobaciones — para que el
  // contador baje a 0. Solo toca los RESERVA, así no interfiere con las señales
  // de /pedidos. El badge reaparece cuando llega un pedido nuevo por decidir.
  useEffect(() => {
    if (location.pathname !== "/aprobaciones") return;
    if (!Array.isArray(pedidosUsuario) || pedidosUsuario.length === 0) return;
    setSeenPedidos((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const p of pedidosUsuario) {
        if (!p?.id) continue;
        const e = String(p.estado || "").trim().toUpperCase();
        if (e !== "RESERVA") continue;
        if (next[String(p.id)] !== e) { next[String(p.id)] = e; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [location.pathname, pedidosUsuario]);

  // Badge counts per nav route — recomputed whenever pedidos, role or
  // seen-map change.  Cheap (filter over an in-memory array).
  const navBadgeCounts = useMemo(() => {
    return computeBadgeCounts(rolActual, pedidosUsuario, seenPedidos, me?.username);
  }, [rolActual, pedidosUsuario, seenPedidos, me?.username]);

  const allNotifications = useMemo(() => {
    if (esEmpresaExternaRol) {
      // Empresa externa solo ve notificaciones de SUS pedidos
      return buildPedidoCaducidadNotifications(pedidosUsuario);
    }
    const lowStockNotifications = buildLowStockNotifications(productos);
    const caducidadNotifications = buildCaducidadNotifications(productos);
    return [...lowStockNotifications, ...caducidadNotifications];
  }, [productos, pedidosUsuario, esEmpresaExternaRol]);

  const unreadNotifications = useMemo(() => {
    const readSet = new Set(readNotificationIds);
    return allNotifications.filter((notification) => !readSet.has(notification.id));
  }, [allNotifications, readNotificationIds]);

  const markNotificationAsRead = (notificationId) => {
    setReadNotificationIds((prev) =>
      prev.includes(notificationId) ? prev : [...prev, notificationId]
    );
  };

  // Usamos el rol normalizado (admin_vivero → admin) para toda la navegación
  // y el gating de rutas del sidebar.
  const userRole = rolActual;
  const isAdmin = rolActual === "admin";
  const sidebarWidth = 220;
  const canSeeNotifications = userRole && userRole !== "empresa_externa";
  const hasUnreadNotifications = canSeeNotifications && unreadNotifications.length > 0;

  useEffect(() => {
    if (!userRole) return;
    // El superadmin, además de las rutas de admin, puede estar en /plataforma
    // (su pantalla por defecto).
    const allowed =
      isPathAllowedForRole(location.pathname, userRole) ||
      (esSuperadmin && location.pathname === "/plataforma");
    if (!allowed) {
      const destino = esSuperadmin ? "/plataforma" : getDefaultRouteForRole(userRole);
      navigate(destino, { replace: true });
    }
  }, [location.pathname, userRole, navigate, esSuperadmin]);

  if (!me) {
    return <ViverAppLoadingScreen message="Cargando sesión y permisos del vivero..." />;
  }

  return (
    <>
      <style>{`
        @keyframes badgePulse {
          0% {
            transform: scale(1);
            box-shadow: 0 10px 22px rgba(220,38,38,0.28);
          }
          50% {
            transform: scale(1.08);
            box-shadow: 0 14px 28px rgba(220,38,38,0.42);
          }
          100% {
            transform: scale(1);
            box-shadow: 0 10px 22px rgba(220,38,38,0.28);
          }
        }

        @keyframes bellRing {
          0%, 100% {
            transform: rotate(0deg);
          }
          6% {
            transform: rotate(10deg);
          }
          12% {
            transform: rotate(-8deg);
          }
          18% {
            transform: rotate(6deg);
          }
          24% {
            transform: rotate(-4deg);
          }
          30% {
            transform: rotate(0deg);
          }
        }

        @keyframes bellFloat {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-1px);
          }
        }
      `}</style>

      <div
        style={{
          minHeight: "100vh",
          width: "100vw",
          maxWidth: "100vw",
          overflowX: "hidden",
          background: "#eef3f5",
          display: "grid",
          gridTemplateColumns: `${sidebarWidth}px minmax(0, 1fr)`,
        }}
      >
        <aside
          style={{
            background: "#eef3f5",
            width: sidebarWidth,
            minWidth: sidebarWidth,
            maxWidth: sidebarWidth,
            padding: "20px 18px",
            borderRight: "1px solid rgba(15,23,42,0.06)",
            position: "sticky",
            top: 0,
            height: "100vh",
            boxSizing: "border-box",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 22,
              padding: "14px 16px",
              border: "1px solid rgba(15,23,42,0.06)",
              boxShadow: "0 10px 24px rgba(2,6,23,0.05)",
              marginBottom: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <img
                src="/logo.png"
                alt="ViverApp"
                style={{ width: 38, height: 38, objectFit: "contain" }}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a" }}>
                  ViverApp
                </div>
                <div style={{ fontSize: 14, color: "#64748b", fontWeight: 700 }}>
                  Gestión del vivero
                </div>
              </div>
            </div>
          </div>

          {/* Selector de ayuntamiento (solo super-admin global) */}
          <ClienteSelector visible={esAdminGlobal} />

          <nav style={{ display: "grid", gap: 12 }}>
            {esSuperadmin && (
              <NavLink
                to="/plataforma"
                style={{
                  ...navBtnStyle(location.pathname === "/plataforma"),
                  justifyContent: "flex-start",
                  padding: "0 18px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background:
                    location.pathname === "/plataforma" ? undefined : "#064e3b",
                  color: location.pathname === "/plataforma" ? undefined : "#ecfdf5",
                }}
              >
                <span>🛰️ Plataforma</span>
              </NavLink>
            )}
            {getVisibleNavItems(userRole).map((item) => {
              const active = location.pathname === item.to;
              const badge = navBadgeCounts[item.to] || 0;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  style={{
                    ...navBtnStyle(active),
                    justifyContent: "flex-start",
                    padding: "0 18px",
                    // When a badge is present and the item is NOT active,
                    // give the whole button a subtle red ring so it stands
                    // out even at a quick glance (the count alone can be
                    // missed on small badges).  No ring when active to
                    // keep the selected-state styling clean.
                    boxShadow:
                      badge > 0 && !active
                        ? "inset 0 0 0 2px rgba(220, 38, 38, 0.45)"
                        : undefined,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span>{item.label}</span>
                  <NavBadge count={badge} />
                </NavLink>
              );
            })}

            {(userRole === "admin" || userRole === "tecnico" || userRole === "manager" || userRole === "gestor_vivero") && (
              <button
                type="button"
                onClick={() => setMapOpen(true)}
                style={navBtnStyle(false)}
                aria-label="Mapa del vivero"
              >
                Mapa del vivero
              </button>
            )}
          </nav>
        </aside>

        <main
          style={{
            padding: "20px 22px 28px 22px",
            minWidth: 0,
            width: "100%",
            maxWidth: "100%",
            overflowX: "hidden",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 14,
              marginBottom: 16,
              flexWrap: "wrap",
            }}
          >
            {isAdmin && (
              <button
                onClick={() => navigate("/admin/usuarios")}
                title="Gestión de usuarios"
                aria-label="Gestión de usuarios"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  height: 44,
                  padding: "0 16px",
                  borderRadius: 14,
                  background: "linear-gradient(135deg, #0f5132 0%, #166534 100%)",
                  border: "1px solid rgba(15,81,50,0.4)",
                  boxShadow: "0 8px 18px rgba(15,81,50,0.18)",
                  cursor: "pointer",
                  color: "#ffffff",
                  fontWeight: 800,
                  fontSize: 14,
                  fontFamily: "inherit",
                  transition: "transform 0.18s ease, box-shadow 0.18s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-1px) scale(1.02)";
                  e.currentTarget.style.boxShadow = "0 12px 22px rgba(15,81,50,0.28)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0) scale(1)";
                  e.currentTarget.style.boxShadow = "0 8px 18px rgba(15,81,50,0.18)";
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="9" cy="8" r="3.6" stroke="currentColor" strokeWidth="1.8" />
                  <path
                    d="M2.5 19c.7-3.4 3.4-5.5 6.5-5.5s5.8 2.1 6.5 5.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <circle cx="17" cy="9" r="2.6" stroke="currentColor" strokeWidth="1.6" />
                  <path
                    d="M14.6 17c.5-1.9 2-3.2 3.9-3.2 1.6 0 3 .9 3.7 2.3"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
                <span>Usuarios</span>
              </button>
            )}

            {canSeeNotifications && (
            <button
              onClick={() => setNotificationsOpen(true)}
              style={notificationButtonStyle(hasUnreadNotifications)}
              title="Alertas y notificaciones"
              aria-label="Abrir alertas y notificaciones"
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px) scale(1.02)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0) scale(1)";
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  animation: hasUnreadNotifications ? "bellRing 3.2s ease-in-out infinite" : "none",
                  transformOrigin: "top center",
                }}
              >
                <AlertBellIcon hasUnread={hasUnreadNotifications} />
              </div>

              {hasUnreadNotifications ? (
                <span
                  style={{
                    position: "absolute",
                    top: -7,
                    right: -7,
                    minWidth: 26,
                    height: 26,
                    padding: "0 7px",
                    borderRadius: 999,
                    background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                    color: "white",
                    fontWeight: 900,
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "3px solid white",
                    boxSizing: "border-box",
                    boxShadow: "0 8px 18px rgba(220,38,38,0.24)",
                    animation: "badgePulse 1.8s ease-in-out infinite",
                  }}
                >
                  {unreadNotifications.length}
                </span>
              ) : null}
            </button>
            )}

            <div
              style={{
                fontWeight: 800,
                color: "#64748b",
                background: "rgba(255,255,255,0.8)",
                border: "1px solid rgba(15,23,42,0.06)",
                borderRadius: 14,
                padding: "10px 14px",
                boxShadow: "0 8px 18px rgba(2,6,23,0.04)",
              }}
            >
              Usuario: <span style={{ color: "#0f172a" }}>{formatUsername(me?.username) || "—"}</span> · Rol:{" "}
              <span style={{ color: "#0f172a" }}>{userRole || "—"}</span>
            </div>

            <button
              type="button"
              onClick={() => setWelcomeOpen(true)}
              title="Ver guía de bienvenida"
              aria-label="Abrir guía de bienvenida"
              style={{
                width: 40,
                height: 40,
                borderRadius: 14,
                border: "1px solid rgba(16,185,129,0.30)",
                background: "rgba(16,185,129,0.10)",
                color: "#065f46",
                fontWeight: 900,
                fontSize: 18,
                cursor: "pointer",
                boxShadow: "0 8px 18px rgba(2,6,23,0.04)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ?
            </button>

            <button
              onClick={() => {
                clearStoredToken();
                try {
                  window.localStorage.removeItem("user");
                } catch {
                  // noop
                }
                navigate("/login");
              }}
              style={topLogoutButtonStyle()}
            >
              Salir
            </button>
          </div>

          <Outlet context={{ me, isAdmin, collapsed: false }} />
        </main>
      </div>

      <WelcomeModal open={welcomeOpen} onClose={() => setWelcomeOpen(false)} />

      <ZonaMapModal open={mapOpen} onClose={() => setMapOpen(false)} isAdmin={isAdmin} />
      {canSeeNotifications && (
        <NotificationModal
          open={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          notifications={unreadNotifications}
          onMarkAsRead={markNotificationAsRead}
        />
      )}
    </>
  );
}