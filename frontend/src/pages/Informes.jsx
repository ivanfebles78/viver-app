import React, { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import logoViverApp from "../assets/logo.png";
import { formatFechaCanaria, formatFechaHoraCanaria } from "../utils/fecha";
import { getZonaLabel } from "../utils/zonas";
import {
  getDistribucionReporte,
  getMovimientosExternosReporte,
  getTrazabilidadReporte,
  getProductos,
  getMovimientos,
  getPedidos,
} from "../api/api";

const REPORTS = [
  { key: "trazabilidad", label: "Trazabilidad", desc: "Sigue el recorrido completo de un lote (por su UUID): entradas, traslados, salidas y devoluciones, con fechas, zonas y cantidades." },
  { key: "distribucion", label: "Distribución", desc: "Muestra en qué zonas del vivero está repartido un producto y en qué tamaños, con las cantidades disponibles en cada una." },
  { key: "inventario", label: "Inventario vivero", desc: "Matriz de existencias por zona: una fila por producto (científico y común) y una columna por tamaño, con el total de cada zona." },
  { key: "stock", label: "Existencias", desc: "Listado de productos agrupado por categoría con su stock actual y mínimo. Se puede filtrar por estado (con stock, bajo o agotado)." },
  { key: "caducidad", label: "Caducidad", desc: "Lotes con fecha de caducidad: caducados, próximos a caducar y vigentes, con zona, tamaño y días restantes." },
  { key: "externos", label: "Movimientos externos", desc: "Salidas del vivero hacia el exterior (UTE, organismos, colegios…) con su destino, fecha, producto y cantidad." },
  { key: "prestamos", label: "Préstamos", desc: "Material entregado en préstamo y pendiente de devolución, con la cantidad prestada, devuelta y lo que queda por devolver." },
  { key: "abastecimiento", label: "Abastecimiento", desc: "Necesidades de reposición: productos por debajo del stock mínimo y cuánto haría falta reponer." },
  { key: "bajas", label: "Baja vivero", desc: "Productos dados de baja en el vivero (descartes), con fecha, producto y cantidad." },
  { key: "estadisticas", label: "Estadísticas", desc: "Entradas de reposición (compras a proveedores) en un rango de fechas, con su coste asociado, coste mensual y productos más solicitados. Solo administrador." },
];

function fmtCantInv(v) {
  const n = Number(v || 0);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}

// Orden de tamaños de maceta para las columnas del inventario por zona.
const TAM_ORDEN = ["Semillero", "M12", "M20", "M35"];
function ordenarTamanos(tams) {
  return [...tams].sort((a, b) => {
    const ia = TAM_ORDEN.indexOf(a);
    const ib = TAM_ORDEN.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return String(a).localeCompare(String(b), "es");
  });
}

const DISTRICTS = [
  "Anaga",
  "Centro-Ifara",
  "Salud-La Salle",
  "Ofra-Costa Sur",
  "Suroeste",
];

const DISTRICT_BARRIOS = {
  Anaga: [
    "Afur",
    "Almáciga",
    "Bailadero, El",
    "Campitos, Los",
    "Catalanes",
    "Chamorga",
    "Igueste de San Andrés",
    "María Jiménez",
    "Roque Negro",
    "San Andrés",
    "Taganana",
    "Valleseco",
  ],
  "Centro-Ifara": [
    "Barrio de los Hoteles",
    "Buenos Aires",
    "Duggi",
    "Ifara",
    "La Alegría",
    "La Rambla",
    "Los Lavaderos",
    "Salamanca",
    "Villa Benítez",
    "Zona Centro",
  ],
  "Salud-La Salle": [
    "Buenos Aires",
    "Cruz del Señor",
    "El Perú",
    "La Salle",
    "Los Gladiolos",
    "Los Llanos",
    "Salud Alto",
    "Salud Bajo",
    "Tío Pino",
    "Zona Centro",
  ],
  "Ofra-Costa Sur": [
    "Acorán",
    "Añaza",
    "Barranco Grande",
    "Chimisay",
    "Cuesta Piedra",
    "El Draguillo",
    "García Escámez",
    "Juan XXIII",
    "Las Delicias",
    "Los Andenes",
    "Morenitas, Las",
    "Nuevo Obrero",
    "Ofra",
    "Santa María del Mar",
    "Somosierra",
  ],
  Suroeste: [
    "El Sobradillo",
    "La Gallega",
    "Llano del Moro",
    "Santa María del Mar",
    "Tincer",
  ],
};

function cardStyle() {
  return {
    background: "white",
    border: "1px solid rgba(15,23,42,0.10)",
    borderRadius: 20,
    boxShadow: "0 10px 30px rgba(2,6,23,0.06)",
  };
}

function softInputStyle() {
  return {
    padding: "12px 14px",
    borderRadius: 12,
    border: "2px solid #334155",
    background: "white",
    color: "#0f172a",
    fontWeight: 700,
    width: "100%",
    outline: "none",
    minHeight: 48,
    boxSizing: "border-box",
  };
}

function primaryBtnStyle(disabled = false) {
  return {
    padding: "12px 18px",
    minHeight: 48,
    borderRadius: 14,
    border: "1px solid rgba(6,182,212,0.25)",
    background: disabled
      ? "linear-gradient(90deg, rgba(148,163,184,0.45), rgba(148,163,184,0.35))"
      : "linear-gradient(135deg, #0ea5e9 0%, #06b6d4 40%, #10b981 100%)",
    color: "white",
    fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer",
    boxShadow: disabled ? "none" : "0 16px 36px rgba(6,182,212,0.24)",
    whiteSpace: "nowrap",
  };
}

function secondaryBtnStyle(disabled = false) {
  return {
    padding: "12px 18px",
    minHeight: 48,
    borderRadius: 14,
    border: disabled ? "2px solid #cbd5e1" : "2px solid #334155",
    background: disabled ? "#f8fafc" : "white",
    color: disabled ? "#94a3b8" : "#0f172a",
    fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer",
    whiteSpace: "nowrap",
    opacity: disabled ? 0.75 : 1,
    boxShadow: "none",
  };
}

function thStyle() {
  return {
    textAlign: "left",
    padding: "12px 12px",
    color: "#334155",
    fontWeight: 900,
    fontSize: 13,
    borderBottom: "1px solid rgba(15,23,42,0.10)",
    whiteSpace: "nowrap",
  };
}

function tdStyle() {
  return {
    padding: "12px",
    color: "#0f172a",
    fontWeight: 700,
    verticalAlign: "top",
    borderBottom: "1px solid rgba(15,23,42,0.06)",
  };
}

function fmtFecha(value) {
  return formatFechaHoraCanaria(value);
}

function fmtFechaSolo(value) {
  return formatFechaCanaria(value);
}

function fmtNum(value) {
  return Number(value || 0).toLocaleString("es-ES");
}

function sanitizeFileName(name) {
  return String(name || "reporte")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getProductoNombre(producto) {
  return (
    producto?.nombre_cientifico ||
    producto?.nombre_natural ||
    producto?.nombre ||
    `Producto #${producto?.id ?? "—"}`
  );
}

// Normaliza texto para búsquedas: sin acentos, minúsculas, sin espacios extra.
// Así "lirio africano" encuentra "Lírio Africano" y viceversa.
function normalizarBusqueda(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

// Etiqueta de producto: "Nombre científico - Nombre común" cuando difieren; si
// son iguales (o falta alguno), muestra solo el que haya.
function nombreCientificoComun(cientifico, comun) {
  const c = String(cientifico || "").trim();
  const n = String(comun || "").trim();
  if (!c) return n;
  if (!n) return c;
  return normalizarBusqueda(c) === normalizarBusqueda(n) ? c : `${c} - ${n}`;
}

// Importe en euros con dos decimales y coma decimal (es-ES).
function fmtEuro(v) {
  const n = Number(v || 0);
  return `${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

// Etiqueta de mes "YYYY-MM" → "mmm YYYY" (ej. "2025-08" → "ago 2025").
const _MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fmtMesLabel(key) {
  const [y, m] = String(key || "").split("-");
  const idx = Number(m) - 1;
  return idx >= 0 && idx < 12 ? `${_MESES_CORTOS[idx]} ${y}` : key;
}

// Gráfica de barras verticales (coste mensual). data: [{ mes, total }].
function BarrasVerticales({ data, color = "#0ea5e9", valueFmt = (v) => v }) {
  if (!data || data.length === 0) return <EmptyState text="Sin datos para el rango seleccionado." />;
  const W = Math.max(320, data.length * 74);
  const H = 240;
  const padB = 46, padT = 24, padL = 8, padR = 8;
  const max = Math.max(...data.map((d) => Number(d.total) || 0), 1);
  const bw = (W - padL - padR) / data.length;
  const chartH = H - padB - padT;
  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={W} height={H} role="img" style={{ display: "block" }}>
        {data.map((d, i) => {
          const v = Number(d.total) || 0;
          const h = max > 0 ? (v / max) * chartH : 0;
          const x = padL + i * bw;
          const y = padT + (chartH - h);
          return (
            <g key={d.mes}>
              <rect x={x + bw * 0.16} y={y} width={bw * 0.68} height={h} rx={5} fill={color} />
              <text x={x + bw / 2} y={y - 6} textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#0f172a">{valueFmt(v)}</text>
              <text x={x + bw / 2} y={H - padB + 18} textAnchor="middle" fontSize="11" fontWeight="700" fill="#64748b">{fmtMesLabel(d.mes)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Gráfica de barras horizontales (top productos). data: [{ nombre, cantidad }].
function BarrasHorizontales({ data, color = "#10b981", valueFmt = (v) => v }) {
  if (!data || data.length === 0) return <EmptyState text="Sin datos para el rango seleccionado." />;
  const rowH = 30;
  const H = data.length * rowH + 12;
  const labelW = 220;
  const max = Math.max(...data.map((d) => Number(d.cantidad) || 0), 1);
  return (
    <div style={{ overflowX: "auto" }}>
      <svg width="100%" height={H} viewBox={`0 0 720 ${H}`} preserveAspectRatio="xMinYMin meet" style={{ display: "block", minWidth: 480 }}>
        {data.map((d, i) => {
          const v = Number(d.cantidad) || 0;
          const barMax = 720 - labelW - 60;
          const w = max > 0 ? (v / max) * barMax : 0;
          const y = i * rowH + 6;
          const nombre = String(d.nombre || "").length > 34 ? String(d.nombre).slice(0, 33) + "…" : d.nombre;
          return (
            <g key={i}>
              <text x={0} y={y + rowH / 2} dominantBaseline="middle" fontSize="11.5" fontWeight="700" fill="#0f172a">{nombre}</text>
              <rect x={labelW} y={y} width={Math.max(w, 2)} height={rowH - 12} rx={5} fill={color} />
              <text x={labelW + Math.max(w, 2) + 6} y={y + (rowH - 12) / 2} dominantBaseline="middle" fontSize="11" fontWeight="800" fill="#0f172a">{valueFmt(v)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function getProductoCategoria(producto) {
  return String(producto?.categoria || "Sin categoría").trim() || "Sin categoría";
}

function getProductoSubcategoria(producto) {
  return String(producto?.subcategoria || "Sin subcategoría").trim() || "Sin subcategoría";
}

function getProductoStockActual(producto) {
  return safeNumber(
    producto?.stock_actual ??
      producto?.stock ??
      producto?.cantidad_disponible ??
      producto?.cantidad_actual ??
      producto?.stock_total ??
      0
  );
}

function getProductoStockMinimo(producto) {
  return safeNumber(
    producto?.stock_minimo ??
      producto?.minimo ??
      producto?.cantidad_minima ??
      producto?.stockMinimo ??
      0
  );
}

function getEstadoStock(stockActual, stockMinimo) {
  if (stockMinimo > 0 && stockActual <= stockMinimo) return "Bajo stock";
  return "Correcto";
}

// Opciones del filtro por estado de existencias (dropdown del informe).
//   ""          → todos los productos
//   "con_stock" → stock actual > 0
//   "bajo"      → bajo stock pero aún con existencias (próximo a agotarse)
//   "agotado"   → stock actual <= 0
const ESTADO_STOCK_OPTIONS = [
  { value: "", label: "Todos los productos" },
  { value: "con_stock", label: "Productos con stock" },
  { value: "bajo", label: "Productos con stock bajo (próximo a agotarse)" },
  { value: "agotado", label: "Productos agotados" },
];
const ESTADO_STOCK_LABEL = Object.fromEntries(
  ESTADO_STOCK_OPTIONS.map((o) => [o.value, o.label])
);

function toStartOfDay(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getCaducidadEstado(fechaCaducidad) {
  const objetivo = toStartOfDay(fechaCaducidad);
  if (!objetivo) return null;

  const hoy = toStartOfDay(new Date());
  const diffMs = objetivo.getTime() - hoy.getTime();
  const diasRestantes = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diasRestantes < 0) return { estado: "Caducado", diasRestantes };
  if (diasRestantes <= 7) return { estado: "Próximo a caducar", diasRestantes };
  return { estado: "Vigente", diasRestantes };
}

function buildCaducidadKey({ producto, loteUuid, zona, tamano, fechaCaducidad, cantidad, estado }) {
  // Dedup por lote/zona/tamaño/fecha/cantidad/estado. Ignoramos `id` y `source`
  // para que la misma entrada de inventario no se cuente dos veces (una por venir
  // en `alertas_caducidad` y otra en `lotes`).
  return [
    producto?.id ?? "sin-producto",
    loteUuid || "sin-lote",
    zona || "sin-zona",
    tamano || "sin-tamano",
    fechaCaducidad || "sin-fecha",
    Number(cantidad || 0),
    estado || "sin-estado",
  ].join("::");
}

function buildCaducidadItems(productos) {
  const items = [];
  const seen = new Set();

  const pushItemFactory = (producto) => ({ source, id, zona, tamano, fechaCaducidad, cantidad, loteUuid }) => {
    const cad = getCaducidadEstado(fechaCaducidad);
    if (!cad) return;

    const dedupeKey = buildCaducidadKey({
      producto,
      loteUuid,
      zona,
      tamano,
      fechaCaducidad,
      cantidad,
    });

    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    items.push({
      id: dedupeKey,
      productoId: producto?.id ?? null,
      nombre: getProductoNombre(producto),
      categoria: getProductoCategoria(producto),
      subcategoria: getProductoSubcategoria(producto),
      zona: zona || "—",
      tamano: tamano || "—",
      fechaCaducidad,
      cantidad: safeNumber(cantidad),
      loteUuid: loteUuid || "—",
      estado: cad.estado,
      diasRestantes: cad.diasRestantes,
    });
  };

  (Array.isArray(productos) ? productos : []).forEach((producto, productoIdx) => {
    const pushItem = pushItemFactory(producto);

    const alertas = Array.isArray(producto?.alertas_caducidad)
      ? producto.alertas_caducidad
      : Array.isArray(producto?.caducidad_alertas)
      ? producto.caducidad_alertas
      : [];

    const lotes = Array.isArray(producto?.lotes)
      ? producto.lotes
      : Array.isArray(producto?.batches)
      ? producto.batches
      : [];

    alertas.forEach((alerta, idx) => {
      pushItem({
        source: "alerta",
        id: alerta?.id || `alerta-${producto?.id || productoIdx}-${idx}`,
        zona: alerta?.zona || alerta?.zone || alerta?.zona_id,
        tamano: alerta?.tamano || alerta?.size,
        fechaCaducidad:
          alerta?.fecha_caducidad || alerta?.caducidad || alerta?.fecha || alerta?.expiry_date,
        cantidad: alerta?.cantidad || alerta?.cantidad_disponible || alerta?.stock || 0,
        loteUuid: alerta?.uuid_lote || alerta?.lote_uuid,
      });
    });

    lotes.forEach((lote, idx) => {
      pushItem({
        source: "lote",
        id: lote?.id || lote?.uuid_lote || lote?.uuid || `lote-${producto?.id || productoIdx}-${idx}`,
        zona: lote?.zona || lote?.zone || lote?.zona_id,
        tamano: lote?.tamano || lote?.size,
        fechaCaducidad:
          lote?.fecha_caducidad || lote?.caducidad || lote?.expiry_date || lote?.fecha,
        cantidad:
          lote?.cantidad_disponible || lote?.cantidad || lote?.stock || lote?.cantidad_actual || 0,
        loteUuid: lote?.uuid_lote || lote?.uuid,
      });
    });

    if (producto?.fecha_caducidad) {
      pushItem({
        source: "producto",
        id: `producto-${producto?.id || productoIdx}`,
        zona: producto?.zona,
        tamano: producto?.tamano,
        fechaCaducidad: producto?.fecha_caducidad,
        cantidad: producto?.cantidad_disponible || producto?.stock || 0,
        loteUuid: producto?.uuid_lote,
      });
    }
  });

  return items.sort((a, b) => {
    const order = {
      Caducado: 0,
      "Próximo a caducar": 1,
      Vigente: 2,
    };

    const oa = order[a.estado] ?? 99;
    const ob = order[b.estado] ?? 99;
    if (oa !== ob) return oa - ob;

    const da = toStartOfDay(a.fechaCaducidad)?.getTime() || 0;
    const db = toStartOfDay(b.fechaCaducidad)?.getTime() || 0;
    if (da !== db) return da - db;

    return a.nombre.localeCompare(b.nombre, "es");
  });
}

function StockBadge({ estado }) {
  const isLow = estado === "Bajo stock";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 900,
        border: isLow
          ? "1px solid rgba(220,38,38,0.18)"
          : "1px solid rgba(16,185,129,0.18)",
        color: isLow ? "#b91c1c" : "#047857",
        background: isLow ? "rgba(254,242,242,1)" : "rgba(236,253,245,1)",
        whiteSpace: "nowrap",
      }}
    >
      {estado}
    </span>
  );
}

function CaducidadBadge({ estado }) {
  const isExpired = estado === "Caducado";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 900,
        border: isExpired
          ? "1px solid rgba(220,38,38,0.18)"
          : "1px solid rgba(245,158,11,0.20)",
        color: isExpired ? "#b91c1c" : "#92400e",
        background: isExpired ? "rgba(254,242,242,1)" : "rgba(255,251,235,1)",
        whiteSpace: "nowrap",
      }}
    >
      {estado}
    </span>
  );
}


function AbastecimientoBadge({ estado }) {
  const e = String(estado || "").toUpperCase();
  let bg = "rgba(148,163,184,0.18)";
  let color = "#334155";
  let border = "rgba(15,23,42,0.08)";

  if (e === "APROBADO") { bg = "rgba(16,185,129,0.12)"; color = "#065f46"; border = "rgba(16,185,129,0.20)"; }
  else if (e === "APROBADO_PARCIAL") { bg = "rgba(20,184,166,0.14)"; color = "#115e59"; border = "rgba(20,184,166,0.28)"; }
  else if (e === "RESERVA") { bg = "rgba(245,158,11,0.12)"; color = "#92400e"; border = "rgba(245,158,11,0.20)"; }
  else if (e === "SERVIDO") { bg = "rgba(59,130,246,0.12)"; color = "#1e3a8a"; border = "rgba(59,130,246,0.20)"; }
  else if (e === "DENEGADO") { bg = "rgba(239,68,68,0.10)"; color = "#991b1b"; border = "rgba(239,68,68,0.20)"; }

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 900,
      border: `1px solid ${border}`, color, background: bg, whiteSpace: "nowrap",
    }}>
      {e || "—"}
    </span>
  );
}

function buildAbastecimientoItems(pedidos) {
  return safeArray(pedidos)
    .filter((p) => String(p?.tipo || "salida").toLowerCase() === "reposicion")
    .map((p) => {
      const lineas = safeArray(p.items).map((it, idx) => {
        const cantidadPedida = safeNumber(it?.cantidad);
        const cantidadServida = safeNumber(it?.cantidad_servida);
        const pendiente = Math.max(cantidadPedida - cantidadServida, 0);
        return {
          key: `${p.id}-${it?.producto_id || idx}-${idx}`,
          producto:
            it?.producto_nombre_cientifico ||
            it?.nombre_cientifico ||
            it?.producto_nombre ||
            it?.producto_nombre_natural ||
            `Producto #${it?.producto_id || "—"}`,
          tamano: it?.tamano || "—",
          cantidadPedida,
          cantidadServida,
          pendiente,
        };
      });
      return {
        id: p.id,
        fecha: p.created_at,
        solicitante:
          p.solicitante_username || p.solicitante || p.created_by || p.usuario || "—",
        estado: String(p.estado || "RESERVA").toUpperCase(),
        aprobadoPor: p.aprobado_por || null,
        servedBy: p.served_by || null,
        nota: p.nota || "",
        lineas,
        totalPedido: lineas.reduce((s, l) => s + l.cantidadPedida, 0),
        totalServido: lineas.reduce((s, l) => s + l.cantidadServida, 0),
        totalPendiente: lineas.reduce((s, l) => s + l.pendiente, 0),
      };
    })
    .sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
}

function safeArray(x) {
  return Array.isArray(x) ? x : [];
}

function buildBajasItems(movimientos, productos) {
  const prodMap = new Map();
  for (const p of safeArray(productos)) prodMap.set(p.id, p);

  return safeArray(movimientos)
    .filter((m) => String(m?.destino_tipo || "").trim().toLowerCase() === "baja vivero")
    .map((m) => {
      const prod = prodMap.get(m?.producto_id) || null;
      return {
        id: m?.id,
        fecha: m?.fecha_movimiento,
        productoId: m?.producto_id ?? null,
        producto:
          m?.producto_nombre_cientifico ||
          prod?.nombre_cientifico ||
          prod?.nombre_natural ||
          `Producto #${m?.producto_id ?? "—"}`,
        categoria: String(prod?.categoria || m?.producto_categoria || "Sin categoría").trim() || "Sin categoría",
        subcategoria:
          String(prod?.subcategoria || m?.producto_subcategoria || "Sin subcategoría").trim() || "Sin subcategoría",
        zonaOrigen: m?.zona_origen || "—",
        tamano: m?.tamano_origen || m?.tamano_destino || "—",
        cantidad: safeNumber(m?.cantidad),
        uuidLote: m?.uuid_lote || "—",
        observaciones: m?.observaciones || m?.nota || "",
        createdBy: m?.created_by || "—",
      };
    })
    .sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
}

function PrestamoBadge({ estado }) {
  const isReturned = estado === "Devuelto";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 900,
        border: isReturned
          ? "1px solid rgba(16,185,129,0.18)"
          : "1px solid rgba(59,130,246,0.20)",
        color: isReturned ? "#047857" : "#1d4ed8",
        background: isReturned ? "rgba(236,253,245,1)" : "rgba(239,246,255,1)",
        whiteSpace: "nowrap",
      }}
    >
      {estado}
    </span>
  );
}

function getPedidoSolicitante(pedido) {
  return (
    pedido?.solicitante_username ||
    pedido?.solicitante ||
    pedido?.created_by ||
    pedido?.usuario ||
    pedido?.username ||
    "—"
  );
}

function getPedidoDestino(pedido) {
  return [pedido?.distrito_destino, pedido?.barrio_destino, pedido?.direccion_destino]
    .filter(Boolean)
    .join(" · ") || "—";
}

function getMovimientoEsPrestamo(m) {
  return !!m?.es_prestamo;
}

function getMovimientoEsDevolucion(m) {
  return !!m?.es_devolucion;
}

function getMovimientoProductoNombre(m) {
  return (
    m?.producto_nombre_cientifico ||
    m?.nombre_cientifico ||
    m?.producto_nombre ||
    `Producto #${m?.producto_id || "—"}`
  );
}

function buildPrestamoItems(pedidos, movimientos) {
  const movimientosArr = Array.isArray(movimientos) ? movimientos : [];
  const pedidosArr = Array.isArray(pedidos) ? pedidos : [];

  // --- Items linked to a pedido ---
  const pedidoItems = pedidosArr
    .map((pedido) => {
      const pedidoMovs = movimientosArr.filter((m) => String(m?.pedido_id || "") === String(pedido?.id || ""));
      const prestamoMovs = pedidoMovs.filter(getMovimientoEsPrestamo);
      if (!prestamoMovs.length) return null;

      const devolucionMovs = pedidoMovs.filter(getMovimientoEsDevolucion);

      const lineas = (Array.isArray(pedido?.items) ? pedido.items : []).map((item, idx) => {
        const prestado = prestamoMovs
          .filter((m) => String(m?.producto_id || "") === String(item?.producto_id || ""))
          .reduce((sum, m) => sum + safeNumber(m?.cantidad), 0);

        const devuelto = devolucionMovs
          .filter((m) => String(m?.producto_id || "") === String(item?.producto_id || ""))
          .reduce((sum, m) => sum + safeNumber(m?.cantidad), 0);

        const cantidadPedida = safeNumber(item?.cantidad);
        const pendiente = Math.max(prestado - devuelto, 0);
        const estadoLinea = prestado > 0 && pendiente <= 0 ? "Devuelto" : "Activo";

        return {
          key: `${pedido?.id || "pedido"}-${item?.producto_id || "prod"}-${idx}`,
          producto: item?.producto_nombre_cientifico || item?.nombre_cientifico || item?.producto_nombre || `Producto #${item?.producto_id || "—"}`,
          tamano: item?.tamano || "—",
          cantidadPedida,
          prestado,
          devuelto,
          pendiente,
          estado: estadoLinea,
        };
      });

      const lineasPrestadas = lineas.filter((l) => l.prestado > 0);
      const estadoPedido = lineasPrestadas.length > 0 && lineasPrestadas.every((l) => l.pendiente <= 0)
        ? "Devuelto"
        : "Activo";

      const fechaPrestamo = prestamoMovs
        .map((m) => new Date(m?.fecha_movimiento || 0))
        .filter((d) => !Number.isNaN(d.getTime()))
        .sort((a, b) => a - b)[0];

      const fechaUltimaDevolucion = devolucionMovs
        .map((m) => new Date(m?.fecha_movimiento || 0))
        .filter((d) => !Number.isNaN(d.getTime()))
        .sort((a, b) => b - a)[0];

      const productosTexto = lineasPrestadas.map((l) => `${l.producto} · ${l.tamano} · ${l.prestado}`).join(" | ");

      return {
        id: pedido?.id,
        pedidoId: pedido?.id,
        fechaPrestamo: fechaPrestamo ? fechaPrestamo.toISOString() : pedido?.created_at || null,
        fechaUltimaDevolucion: fechaUltimaDevolucion ? fechaUltimaDevolucion.toISOString() : null,
        solicitante: getPedidoSolicitante(pedido),
        destinatario: getPedidoDestino(pedido),
        estado: estadoPedido,
        lineas: lineasPrestadas,
        productosTexto,
        totalPrestado: lineasPrestadas.reduce((sum, l) => sum + l.prestado, 0),
        totalDevuelto: lineasPrestadas.reduce((sum, l) => sum + l.devuelto, 0),
        totalPendiente: lineasPrestadas.reduce((sum, l) => sum + l.pendiente, 0),
      };
    })
    .filter(Boolean);

  // --- Standalone items: prestamo/devolucion movements NOT linked to any pedido ---
  const pedidoLinkedMovIds = new Set(
    movimientosArr
      .filter((m) => m?.pedido_id)
      .map((m) => m.id)
  );

  const standaloneMovs = movimientosArr.filter(
    (m) =>
      !m?.pedido_id &&
      !pedidoLinkedMovIds.has(m?.id) &&
      (getMovimientoEsPrestamo(m) || getMovimientoEsDevolucion(m))
  );

  // Group standalone movements by prestamo_referencia_id (devolutions link back to their loan)
  // First, collect all standalone prestamos
  const standalonePrestamoMap = new Map(); // id -> movimiento
  const standaloneDevolucionMap = new Map(); // prestamo_referencia_id -> [movimientos]

  for (const m of standaloneMovs) {
    if (getMovimientoEsPrestamo(m)) {
      standalonePrestamoMap.set(m.id, m);
    }
  }
  for (const m of standaloneMovs) {
    if (getMovimientoEsDevolucion(m)) {
      const refId = m?.prestamo_referencia_id;
      if (refId) {
        if (!standaloneDevolucionMap.has(refId)) standaloneDevolucionMap.set(refId, []);
        standaloneDevolucionMap.get(refId).push(m);
      }
    }
  }

  // Also group standalone devolutions without a reference by producto_id
  const standaloneDevolucionesHuerfanas = standaloneMovs.filter(
    (m) => getMovimientoEsDevolucion(m) && !m?.prestamo_referencia_id
  );

  const standaloneItems = [];
  const processedDevIds = new Set();

  for (const prestamo of standalonePrestamoMap.values()) {
    const devuciones = standaloneDevolucionMap.get(prestamo.id) || [];
    // Also look for orphan devolutions matching same producto_id
    const extraDev = standaloneDevolucionesHuerfanas.filter(
      (d) => String(d?.producto_id) === String(prestamo?.producto_id)
    );
    const allDevs = [...devuciones, ...extraDev.filter((d) => !processedDevIds.has(d.id))];
    allDevs.forEach((d) => processedDevIds.add(d.id));

    const totalPrestado = safeNumber(prestamo?.cantidad);
    const totalDevuelto = allDevs.reduce((sum, d) => sum + safeNumber(d?.cantidad), 0);
    const totalPendiente = Math.max(totalPrestado - totalDevuelto, 0);
    const estado = totalPrestado > 0 && totalPendiente <= 0 ? "Devuelto" : "Activo";

    const nombreProducto = getMovimientoProductoNombre(prestamo);
    const tamano = prestamo?.tamano_origen || prestamo?.tamano_destino || "—";

    const destParts = [prestamo?.distrito_destino, prestamo?.barrio_destino, prestamo?.direccion_destino].filter(Boolean);
    const destinatario = destParts.length
      ? destParts.join(" · ")
      : prestamo?.destino_tipo || "—";

    standaloneItems.push({
      id: `mov-${prestamo.id}`,
      pedidoId: null,
      fechaPrestamo: prestamo?.fecha_movimiento || null,
      fechaUltimaDevolucion: allDevs.length
        ? allDevs
            .map((d) => new Date(d?.fecha_movimiento || 0))
            .sort((a, b) => b - a)[0]
            ?.toISOString()
        : null,
      solicitante: prestamo?.created_by || "—",
      destinatario,
      estado,
      lineas: [
        {
          key: `mov-${prestamo.id}-0`,
          producto: nombreProducto,
          tamano,
          cantidadPedida: totalPrestado,
          prestado: totalPrestado,
          devuelto: totalDevuelto,
          pendiente: totalPendiente,
          estado,
        },
      ],
      productosTexto: `${nombreProducto} · ${tamano} · ${totalPrestado}`,
      totalPrestado,
      totalDevuelto,
      totalPendiente,
    });
  }

  // Also handle orphan devolutions that have no matching standalone prestamo
  for (const dev of standaloneDevolucionesHuerfanas) {
    if (processedDevIds.has(dev.id)) continue;
    processedDevIds.add(dev.id);

    const nombreProducto = getMovimientoProductoNombre(dev);
    const tamano = dev?.tamano_origen || dev?.tamano_destino || "—";
    const totalDevuelto = safeNumber(dev?.cantidad);

    const destParts = [dev?.distrito_destino, dev?.barrio_destino, dev?.direccion_destino].filter(Boolean);
    const destinatario = destParts.length ? destParts.join(" · ") : dev?.origen_tipo || "—";

    standaloneItems.push({
      id: `dev-${dev.id}`,
      pedidoId: null,
      fechaPrestamo: null,
      fechaUltimaDevolucion: dev?.fecha_movimiento || null,
      solicitante: dev?.created_by || "—",
      destinatario,
      estado: "Devuelto",
      lineas: [
        {
          key: `dev-${dev.id}-0`,
          producto: nombreProducto,
          tamano,
          cantidadPedida: 0,
          prestado: 0,
          devuelto: totalDevuelto,
          pendiente: 0,
          estado: "Devuelto",
        },
      ],
      productosTexto: `${nombreProducto} · ${tamano} · ${totalDevuelto}`,
      totalPrestado: 0,
      totalDevuelto,
      totalPendiente: 0,
    });
  }

  return [...pedidoItems, ...standaloneItems].sort((a, b) => {
    const da = new Date(b?.fechaPrestamo || b?.fechaUltimaDevolucion || 0).getTime();
    const db = new Date(a?.fechaPrestamo || a?.fechaUltimaDevolucion || 0).getTime();
    return da - db;
  });
}

async function loadImageAsDataUrl(src) {
  const res = await fetch(src);
  if (!res.ok) {
    throw new Error(`No se pudo cargar la imagen: ${src}`);
  }
  const blob = await res.blob();

  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function savePdfWithDialog(doc, fileName) {
  const blob = doc.output("blob");

  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({
      suggestedName: fileName,
      types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  doc.save(fileName);
}

async function addDocHeader(doc, title, me) {
  const generatedAt = new Date();
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 28, "F");

  doc.setFillColor(6, 182, 212);
  doc.rect(0, 28, pageWidth, 3, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text("ViverApp", 14, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(226, 232, 240);
  doc.text("Sistema de gestión del vivero", 14, 23);

  try {
    const logoDataUrl = await loadImageAsDataUrl(logoViverApp);
    doc.addImage(logoDataUrl, "PNG", pageWidth - 42, 1, 32, 32);
  } catch (e) {
    console.error("No se pudo cargar el logo para el PDF:", e);
  }

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(title, 14, 42);

  doc.setDrawColor(226, 232, 240);
  doc.line(14, 46, pageWidth - 14, 46);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`Fecha de generación: ${generatedAt.toLocaleString("es-ES")}`, 14, 54);
  doc.text(`Usuario: ${me?.username || "—"}`, 14, 60);
  doc.text(`Rol: ${me?.rol || me?.role || "—"}`, 14, 66);

  return 74;
}

function addPageFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages();

  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setDrawColor(226, 232, 240);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text("ViverApp · Informe generado automáticamente", 14, pageHeight - 7);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - 14, pageHeight - 7, {
      align: "right",
    });
  }
}

async function exportReportToPdf({
  activeReport,
  me,
  trazabilidadData,
  distribucionData,
  inventarioVivero,
  stockExportData,
  caducidadExportData,
  externosData,
  prestamosExportData,
  abastecimientoExportData,
  bajasExportData,
  estadisticasExportData,
}) {
  const doc = new jsPDF("p", "mm", "a4");
  let y = await addDocHeader(
    doc,
    activeReport === "trazabilidad"
      ? "Reporte de trazabilidad"
      : activeReport === "distribucion"
      ? "Reporte de distribución"
      : activeReport === "inventario"
      ? "Inventario del vivero por zona"
      : activeReport === "stock"
      ? "Reporte de existencias"
      : activeReport === "caducidad"
      ? "Reporte de caducidad"
      : activeReport === "prestamos"
      ? "Reporte de préstamos"
      : activeReport === "abastecimiento"
      ? "Reporte de abastecimiento"
      : activeReport === "bajas"
      ? "Reporte de Baja vivero"
      : activeReport === "estadisticas"
      ? "Estadísticas de reposición"
      : "Reporte de movimientos externos",
    me
  );

  if (activeReport === "inventario") {
    const zonas = Array.isArray(inventarioVivero) ? inventarioVivero : [];
    if (zonas.length === 0) {
      doc.setFontSize(11);
      doc.text("No hay stock registrado en ninguna zona del vivero.", 14, y + 6);
    } else {
      for (const zona of zonas) {
        const startY = (doc.lastAutoTable ? doc.lastAutoTable.finalY : y) + 8;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.text(`${zona.label}  (${zona.productos.length} productos)`, 14, startY);
        autoTable(doc, {
          startY: startY + 3,
          theme: "grid",
          head: [["Producto", ...zona.tamanos, "Total"]],
          body: zona.productos.map((p) => [
            p.nombreComun ? `${p.nombre}\n${p.nombreComun}` : p.nombre,
            ...zona.tamanos.map((t) => (p.tamanos[t] ? fmtCantInv(p.tamanos[t]) : "—")),
            fmtCantInv(p.total),
          ]),
          styles: { halign: "center", fontSize: 8, cellPadding: 1.8 },
          headStyles: { fillColor: [15, 23, 42], halign: "center" },
          columnStyles: { 0: { halign: "left", cellWidth: "auto", fontStyle: "bold" } },
        });
      }
    }
  }

  if (activeReport === "trazabilidad" && trazabilidadData) {
    autoTable(doc, {
      startY: y,
      theme: "grid",
      head: [["Campo", "Valor"]],
      body: [
        ["UUID", trazabilidadData.uuid_lote || "—"],
        ["Producto", trazabilidadData.producto_nombre || `Producto #${trazabilidadData.producto_id || "—"}`],
        ["Cantidad inicial", fmtNum(trazabilidadData.cantidad_inicial)],
        ["Fecha de entrada", fmtFecha(trazabilidadData.fecha_entrada)],
      ],
      styles: { fontSize: 10, cellPadding: 2.5 },
      headStyles: { fillColor: [14, 165, 233] },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      theme: "grid",
      head: [["Fecha", "Cantidad", "Origen", "Destino", "Descripción"]],
      body: (trazabilidadData.movimientos || []).map((m) => [
        fmtFecha(m.fecha_movimiento),
        fmtNum(m.cantidad),
        m.origen_tipo || "—",
        m.destino_tipo || "—",
        m.descripcion || "—",
      ]),
      styles: { fontSize: 9, cellPadding: 2.2, overflow: "linebreak" },
      headStyles: { fillColor: [16, 185, 129] },
    });

    if ((trazabilidadData.inventario_actual || []).length) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 8,
        theme: "grid",
        head: [["Zona", "Tamaño", "Cantidad disponible"]],
        body: trazabilidadData.inventario_actual.map((inv) => [
          inv.zona || "—",
          inv.tamano || "—",
          fmtNum(inv.cantidad_disponible),
        ]),
        styles: { fontSize: 9.5, cellPadding: 2.2 },
        headStyles: { fillColor: [51, 65, 85] },
      });
    }
  }

  if (activeReport === "distribucion" && distribucionData) {
    autoTable(doc, {
      startY: y,
      theme: "grid",
      head: [["Campo", "Valor"]],
      body: [
        ["Producto", distribucionData.producto_nombre || `Producto #${distribucionData.producto_id || "—"}`],
        ["Stock total", fmtNum(distribucionData.stock_total)],
        ["Ubicaciones activas", fmtNum(distribucionData.distribucion?.length || 0)],
      ],
      styles: { fontSize: 10, cellPadding: 2.5 },
      headStyles: { fillColor: [14, 165, 233] },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      theme: "grid",
      head: [["Zona", "Tamaño", "Cantidad"]],
      body: (distribucionData.distribucion || []).map((row) => [
        row.zona || "—",
        row.tamano || "—",
        fmtNum(row.cantidad),
      ]),
      styles: { fontSize: 10, cellPadding: 2.3 },
      headStyles: { fillColor: [16, 185, 129] },
    });
  }

  if (activeReport === "stock" && stockExportData) {
    autoTable(doc, {
      startY: y,
      theme: "grid",
      head: [["Filtro", "Valor"]],
      body: [
        ["Categoría", stockExportData.filters.categoria || "Todas"],
        ["Subcategoría", stockExportData.filters.subcategoria || "Todas"],
        ["Texto", stockExportData.filters.search || "—"],
        ["Estado", ESTADO_STOCK_LABEL[stockExportData.filters.estado] || "Todos los productos"],
        ["Productos visibles", fmtNum(stockExportData.totalProductos)],
        ["Categorías visibles", fmtNum(stockExportData.totalCategorias)],
      ],
      styles: { fontSize: 10, cellPadding: 2.5 },
      headStyles: { fillColor: [14, 165, 233] },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      theme: "grid",
      head: [["Categoría", "Nº productos", "Stock total"]],
      body: (stockExportData.groups || []).map((group) => [
        group.categoria,
        fmtNum(group.totalProductos),
        fmtNum(group.stockTotal),
      ]),
      styles: { fontSize: 9.5, cellPadding: 2.2 },
      headStyles: { fillColor: [16, 185, 129] },
    });

    (stockExportData.groups || []).forEach((group) => {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 8,
        theme: "grid",
        head: [[`Detalle · ${group.categoria}`, "Subcategoría", "Stock actual", "Stock mínimo", "Estado"]],
        body: (group.items || []).map((item) => [
          item.nombreDisplay || item.nombre,
          item.subcategoria,
          fmtNum(item.stockActual),
          fmtNum(item.stockMinimo),
          item.estado,
        ]),
        styles: { fontSize: 9, cellPadding: 2.1, overflow: "linebreak" },
        headStyles: { fillColor: [51, 65, 85] },
      });
    });
  }

  if (activeReport === "caducidad" && caducidadExportData) {
    autoTable(doc, {
      startY: y,
      theme: "grid",
      head: [["Resumen", "Valor"]],
      body: [
        ["Registros visibles", fmtNum(caducidadExportData.totalItems)],
        ["Caducados", fmtNum(caducidadExportData.totalCaducados)],
        ["Próximos a caducar", fmtNum(caducidadExportData.totalProximos)],
        ["Vigentes", fmtNum(caducidadExportData.totalVigentes)],
      ],
      styles: { fontSize: 10, cellPadding: 2.5 },
      headStyles: { fillColor: [14, 165, 233] },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      theme: "grid",
      head: [["Producto", "Categoría", "Subcategoría", "Zona", "Tamaño", "Fecha caducidad", "Días", "Estado"]],
      body: (caducidadExportData.items || []).map((item) => [
        item.nombre,
        item.categoria,
        item.subcategoria,
        item.zona,
        item.tamano,
        fmtFechaSolo(item.fechaCaducidad),
        String(item.diasRestantes),
        item.estado,
      ]),
      styles: { fontSize: 8.7, cellPadding: 2.0, overflow: "linebreak" },
      headStyles: { fillColor: [245, 158, 11] },
    });
  }

  if (activeReport === "externos" && Array.isArray(externosData)) {
    autoTable(doc, {
      startY: y,
      theme: "grid",
      head: [["Fecha", "Producto", "Cantidad", "Origen", "Destino", "Ubicación destino", "Registrado por"]],
      body: externosData.map((row) => [
        fmtFecha(row.fecha_movimiento),
        row.producto_nombre || "—",
        fmtNum(row.cantidad),
        `${row.origen_tipo || "—"}${row.zona_origen ? ` · ${row.zona_origen}` : ""}${row.tamano_origen ? ` · ${row.tamano_origen}` : ""}`,
        `${row.destino_tipo || "—"}${row.zona_destino ? ` · ${row.zona_destino}` : ""}${row.tamano_destino ? ` · ${row.tamano_destino}` : ""}`,
        [row.distrito_destino, row.barrio_destino, row.direccion_destino].filter(Boolean).join(" · ") || "—",
        row.created_by || "—",
      ]),
      styles: { fontSize: 8.5, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: [16, 185, 129] },
    });
  }


  if (activeReport === "bajas" && bajasExportData) {
    autoTable(doc, {
      startY: y,
      theme: "grid",
      head: [["Filtro", "Valor"]],
      body: [
        ["Producto", bajasExportData.filtros.producto || "—"],
        ["Categoría", bajasExportData.filtros.categoria || "Todas"],
        ["Subcategoría", bajasExportData.filtros.subcategoria || "Todas"],
        ["Fecha desde", bajasExportData.filtros.fecha_desde || "—"],
        ["Fecha hasta", bajasExportData.filtros.fecha_hasta || "—"],
      ],
      styles: { fontSize: 10, cellPadding: 2.5 },
      headStyles: { fillColor: [14, 165, 233] },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      theme: "grid",
      head: [["Resumen", "Valor"]],
      body: [
        ["Movimientos visibles", fmtNum(bajasExportData.totalMovimientos)],
        ["Productos únicos", fmtNum(bajasExportData.productosUnicos)],
        ["Unidades totales", fmtNum(bajasExportData.totalUnidades)],
      ],
      styles: { fontSize: 10, cellPadding: 2.5 },
      headStyles: { fillColor: [220, 38, 38] },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      theme: "grid",
      head: [["Fecha", "Producto", "Categoría", "Subcategoría", "Zona origen", "Tamaño", "Unidades", "UUID lote", "Registrado por"]],
      body: (bajasExportData.items || []).map((item) => [
        fmtFecha(item.fecha),
        item.producto,
        item.categoria,
        item.subcategoria,
        item.zonaOrigen,
        item.tamano,
        fmtNum(item.cantidad),
        item.uuidLote,
        item.createdBy,
      ]),
      styles: { fontSize: 8.5, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: [220, 38, 38] },
    });
  }

  if (activeReport === "abastecimiento" && abastecimientoExportData) {
    autoTable(doc, {
      startY: y,
      theme: "grid",
      head: [["Resumen", "Valor"]],
      body: [
        ["Pedidos visibles", fmtNum(abastecimientoExportData.total)],
        ["En reserva", fmtNum(abastecimientoExportData.reserva)],
        ["Aprobados", fmtNum(abastecimientoExportData.aprobados)],
        ["Servidos", fmtNum(abastecimientoExportData.servidos)],
        ["Denegados", fmtNum(abastecimientoExportData.denegados)],
        ["Cancelados", fmtNum(abastecimientoExportData.cancelados)],
        ["Total pedido", fmtNum(abastecimientoExportData.totalPedido)],
        ["Total servido", fmtNum(abastecimientoExportData.totalServido)],
        ["Total pendiente", fmtNum(abastecimientoExportData.totalPendiente)],
      ],
      styles: { fontSize: 10, cellPadding: 2.5 },
      headStyles: { fillColor: [14, 165, 233] },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      theme: "grid",
      head: [["Pedido", "Fecha", "Solicitante", "Estado", "Líneas", "Pedido", "Servido", "Pendiente"]],
      body: (abastecimientoExportData.items || []).map((item) => [
        `#${item.id}`,
        fmtFecha(item.fecha),
        item.solicitante,
        item.estado,
        item.lineas.map((l) => `${l.producto} · ${l.tamano} · ${fmtNum(l.cantidadPedida)}`).join("\n"),
        fmtNum(item.totalPedido),
        fmtNum(item.totalServido),
        fmtNum(item.totalPendiente),
      ]),
      styles: { fontSize: 8.5, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: [245, 158, 11] },
    });
  }

  if (activeReport === "prestamos" && prestamosExportData) {
    autoTable(doc, {
      startY: y,
      theme: "grid",
      head: [["Resumen", "Valor"]],
      body: [
        ["Préstamos visibles", fmtNum(prestamosExportData.totalPrestamos)],
        ["Activos", fmtNum(prestamosExportData.totalActivos)],
        ["Devueltos", fmtNum(prestamosExportData.totalDevueltos)],
      ],
      styles: { fontSize: 10, cellPadding: 2.5 },
      headStyles: { fillColor: [14, 165, 233] },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      theme: "grid",
      head: [["Pedido", "Fecha", "Solicitante", "Destino", "Elementos", "Estado", "Prestado", "Devuelto", "Pendiente"]],
      body: (prestamosExportData.items || []).map((item) => [
        `#${item.pedidoId}`,
        fmtFecha(item.fechaPrestamo),
        item.solicitante,
        item.destinatario,
        item.lineas.map((l) => `${l.producto} · ${l.tamano} · ${fmtNum(l.prestado)}`).join("\n"),
        item.estado,
        fmtNum(item.totalPrestado),
        fmtNum(item.totalDevuelto),
        fmtNum(item.totalPendiente),
      ]),
      styles: { fontSize: 8.5, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: [59, 130, 246] },
    });
  }

  if (activeReport === "estadisticas" && estadisticasExportData) {
    const d = estadisticasExportData;
    autoTable(doc, {
      startY: y,
      theme: "grid",
      head: [["Filtro / Resumen", "Valor"]],
      body: [
        ["Rango de fechas", `${d.filters?.desde || "—"} a ${d.filters?.hasta || "—"}`],
        ["Producto", d.filters?.producto || "Todos"],
        ["Categoría", d.filters?.categoria || "Todas"],
        ["Subcategoría", d.filters?.subcategoria || "Todas"],
        ["Coste total reposición", fmtEuro(d.totalCoste)],
        ["Unidades recibidas", fmtNum(d.totalUds)],
        ["Movimientos", fmtNum((d.rows || []).length)],
        ...(d.simulado ? [["Origen de los datos", "SIMULADOS (no reales)"]] : []),
      ],
      styles: { fontSize: 10, cellPadding: 2.5 },
      headStyles: { fillColor: [14, 165, 233] },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      theme: "grid",
      head: [["Mes", "Coste de reposición"]],
      body: (d.costesMensuales || []).map((m) => [fmtMesLabel(m.mes), fmtEuro(m.total)]),
      styles: { fontSize: 9.5, cellPadding: 2.2 },
      headStyles: { fillColor: [14, 165, 233] },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      theme: "grid",
      head: [["Producto más solicitado", "Unidades"]],
      body: (d.topProductos || []).map((p) => [p.nombre, fmtNum(p.cantidad)]),
      styles: { fontSize: 9.5, cellPadding: 2.2 },
      headStyles: { fillColor: [16, 185, 129] },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      theme: "grid",
      head: [["Fecha", "Producto", "Categoría", "Subcat.", "Tamaño", "Cant.", "Precio", "Coste"]],
      body: (d.rows || []).map((r) => [
        r.fecha ? fmtFecha(r.fecha) : "—",
        r.nombreDisplay,
        r.categoria,
        r.subcategoria,
        r.tamano,
        fmtNum(r.cantidad),
        r.precio == null ? "—" : fmtEuro(r.precio),
        r.coste == null ? "—" : fmtEuro(r.coste),
      ]),
      styles: { fontSize: 8, cellPadding: 1.8, overflow: "linebreak" },
      headStyles: { fillColor: [51, 65, 85] },
    });
  }

  const fileName = `${sanitizeFileName(
    activeReport === "trazabilidad"
      ? "reporte_trazabilidad"
      : activeReport === "distribucion"
      ? "reporte_distribucion"
      : activeReport === "inventario"
      ? "inventario_vivero"
      : activeReport === "stock"
      ? "reporte_existencias"
      : activeReport === "caducidad"
      ? "reporte_caducidad"
      : activeReport === "abastecimiento"
      ? "reporte_abastecimiento"
      : activeReport === "prestamos"
      ? "reporte_prestamos"
      : activeReport === "bajas"
      ? "reporte_baja_vivero"
      : activeReport === "estadisticas"
      ? "estadisticas_reposicion"
      : "reporte_movimientos_externos"
  )}_${new Date().toISOString().slice(0, 10)}.pdf`;

  addPageFooter(doc);
  await savePdfWithDialog(doc, fileName);
}

function MessageBanner({ msg, msgType, onClose }) {
  if (!msg) return null;
  const isError = msgType === "error";

  return (
    <div
      style={{
        ...cardStyle(),
        marginTop: 14,
        padding: "14px 16px",
        border: isError
          ? "1px solid rgba(239,68,68,0.18)"
          : "1px solid rgba(16,185,129,0.18)",
        background: isError
          ? "linear-gradient(180deg, rgba(254,242,242,0.98), rgba(255,255,255,0.98))"
          : "linear-gradient(180deg, rgba(236,253,245,0.98), rgba(255,255,255,0.98))",
        color: isError ? "#991b1b" : "#065f46",
        fontWeight: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <span>{msg}</span>
      <button
        onClick={onClose}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: 18,
          fontWeight: 900,
          color: isError ? "#991b1b" : "#065f46",
          lineHeight: 1,
        }}
        title="Cerrar"
        aria-label="Cerrar mensaje"
      >
        ×
      </button>
    </div>
  );
}

function EmptyState({ text = "No hay datos para mostrar." }) {
  return (
    <div
      style={{
        ...cardStyle(),
        padding: 20,
        marginTop: 20,
        color: "#64748b",
        fontWeight: 800,
      }}
    >
      {text}
    </div>
  );
}

export default function Informes() {
  const { me } = useOutletContext();

  const role = me?.rol || me?.role;
  // Acceso restringido por rol a informes concretos:
  //   - empresa externa → solo "Movimientos externos".
  //   - técnico → "Distribución", "Inventario vivero" y "Existencias".
  //   - gestor_vivero, admin y manager → TODOS los informes.
  const isEmpresaExterna = role === "empresa_externa";
  const isTecnico = role === "tecnico";
  const isGestorVivero = role === "gestor_vivero";
  const isAdmin = role === "admin";
  const canAccess =
    role === "admin" || role === "manager" || isGestorVivero || isEmpresaExterna || isTecnico;

  // Informes permitidos por rol (null = todos):
  //   - empresa externa → solo "Movimientos externos".
  //   - técnico → "Distribución", "Inventario vivero" y "Existencias".
  //   - gestor_vivero / admin / manager → todos (null).
  const allowedReportKeys = isEmpresaExterna
    ? ["externos"]
    : isTecnico
    ? ["distribucion", "inventario", "stock"]
    : null;

  // Pestañas visibles según el rol. "estadisticas" es SOLO para administrador,
  // aunque otros roles (manager/gestor) vean el resto de informes.
  const visibleReports = useMemo(() => {
    let list = allowedReportKeys ? REPORTS.filter((r) => allowedReportKeys.includes(r.key)) : REPORTS;
    if (!isAdmin) list = list.filter((r) => r.key !== "estadisticas");
    return list;
  }, [role]);

  const [activeReport, setActiveReport] = useState(
    allowedReportKeys ? allowedReportKeys[0] : "trazabilidad"
  );
  // Menú del botón Exportar (PDF / Excel).
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  // Zonas colapsadas en el informe de inventario (por id de zona).
  const [zonasInvColapsadas, setZonasInvColapsadas] = useState({});
  const toggleZonaInv = (zona) =>
    setZonasInvColapsadas((prev) => ({ ...prev, [zona]: !prev[zona] }));
  // Filtros del informe de inventario (por producto/categoría/subcategoría).
  const [invSearch, setInvSearch] = useState("");
  const [invCategoria, setInvCategoria] = useState("");
  const [invSubcategoria, setInvSubcategoria] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("success");
  const msgTimerRef = useRef(null);

  const [productos, setProductos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [pedidos, setPedidos] = useState([]);

  const [uuid, setUuid] = useState("");
  const [trazabilidadData, setTrazabilidadData] = useState(null);

  const [productoSearch, setProductoSearch] = useState("");
  const [selectedProducto, setSelectedProducto] = useState(null);
  const [showProductoDropdown, setShowProductoDropdown] = useState(false);
  const [distribucionData, setDistribucionData] = useState(null);

  const [stockSearch, setStockSearch] = useState("");
  const [stockCategoriaFilter, setStockCategoriaFilter] = useState("");
  const [stockSubcategoriaFilter, setStockSubcategoriaFilter] = useState("");
  // Filtro por estado de existencias: "" (todos), "con_stock", "bajo", "agotado".
  const [stockEstadoFilter, setStockEstadoFilter] = useState("");

  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [distrito, setDistrito] = useState("");
  const [barrio, setBarrio] = useState("");
  const [direccion, setDireccion] = useState("");
  const [externosData, setExternosData] = useState([]);
  const [externosSearched, setExternosSearched] = useState(false);
  const [externosCategoria, setExternosCategoria] = useState("");
  const [externosSubcategoria, setExternosSubcategoria] = useState("");

  // Categorías/subcategorías para los filtros del informe de movimientos externos.
  const externosCategorias = useMemo(() => {
    const set = new Set();
    for (const p of (Array.isArray(productos) ? productos : [])) {
      const c = String(p?.categoria || "").trim();
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [productos]);
  const externosSubcategorias = useMemo(() => {
    if (!externosCategoria) return [];
    const set = new Set();
    for (const p of (Array.isArray(productos) ? productos : [])) {
      if (String(p?.categoria || "").trim() !== externosCategoria) continue;
      const s = String(p?.subcategoria || "").trim();
      if (s) set.add(s);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [productos, externosCategoria]);
  // Total de elementos (suma de cantidades) del informe externos.
  const externosTotal = useMemo(
    () => (Array.isArray(externosData) ? externosData : []).reduce((s, r) => s + Number(r?.cantidad || 0), 0),
    [externosData]
  );

  const [prestamoProductoFilter, setPrestamoProductoFilter] = useState("");
  const [prestamoSolicitanteFilter, setPrestamoSolicitanteFilter] = useState("");
  const [prestamoEstadoFilter, setPrestamoEstadoFilter] = useState("");
  const [prestamoFechaDesde, setPrestamoFechaDesde] = useState("");
  const [prestamoFechaHasta, setPrestamoFechaHasta] = useState("");

  const [abastEstadoFilter, setAbastEstadoFilter] = useState("");
  const [abastSolicitanteFilter, setAbastSolicitanteFilter] = useState("");
  const [abastProductoFilter, setAbastProductoFilter] = useState("");
  const [abastFechaDesde, setAbastFechaDesde] = useState("");
  const [abastFechaHasta, setAbastFechaHasta] = useState("");

  const [bajaProductoFilter, setBajaProductoFilter] = useState("");
  const [bajaCategoriaFilter, setBajaCategoriaFilter] = useState("");
  const [bajaSubcategoriaFilter, setBajaSubcategoriaFilter] = useState("");
  const [bajaFechaDesde, setBajaFechaDesde] = useState("");
  const [bajaFechaHasta, setBajaFechaHasta] = useState("");

  const productoSearchRef = useRef(null);

  const clearMsgTimer = () => {
    if (msgTimerRef.current) {
      clearTimeout(msgTimerRef.current);
      msgTimerRef.current = null;
    }
  };

  const showTimedMessage = (text, type = "success") => {
    clearMsgTimer();
    setMsg(text);
    setMsgType(type);
    msgTimerRef.current = setTimeout(() => {
      setMsg("");
    }, 3000);
  };

  const loadProductos = async (showSuccessMessage = false) => {
    setLoading(true);
    try {
      const [dataProductos, dataMovimientos, dataPedidos] = await Promise.all([
        getProductos(),
        getMovimientos(),
        getPedidos(),
      ]);
      setProductos(Array.isArray(dataProductos) ? dataProductos : []);
      setMovimientos(Array.isArray(dataMovimientos) ? dataMovimientos : []);
      setPedidos(Array.isArray(dataPedidos) ? dataPedidos : []);
      if (showSuccessMessage) {
        showTimedMessage("Informe actualizado.", "success");
      }
    } catch (e) {
      setProductos([]);
      setMovimientos([]);
      setPedidos([]);
      showTimedMessage(
        e?.response?.data?.detail || e?.message || "Error cargando los productos",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProductos(false);
    return () => clearMsgTimer();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (productoSearchRef.current && !productoSearchRef.current.contains(event.target)) {
        setShowProductoDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredProductos = useMemo(() => {
    const term = productoSearch.trim().toLowerCase();
    if (!term) return productos.slice(0, 12);

    return productos
      .filter((p) => {
        const natural = String(p.nombre_natural || "").toLowerCase();
        const cientifico = String(p.nombre_cientifico || "").toLowerCase();
        const categoria = String(p.categoria || "").toLowerCase();
        const subcategoria = String(p.subcategoria || "").toLowerCase();

        return (
          natural.includes(term) ||
          cientifico.includes(term) ||
          categoria.includes(term) ||
          subcategoria.includes(term)
        );
      })
      .slice(0, 20);
  }, [productos, productoSearch]);

  const normalizedStockItems = useMemo(() => {
    return (productos || []).map((p) => {
      const nombre = getProductoNombre(p);
      const categoria = getProductoCategoria(p);
      const subcategoria = getProductoSubcategoria(p);
      const stockActual = getProductoStockActual(p);
      const stockMinimo = getProductoStockMinimo(p);
      const estado = getEstadoStock(stockActual, stockMinimo);

      return {
        id: p.id ?? `${nombre}-${categoria}-${subcategoria}`,
        nombre,
        nombreComun: p.nombre_natural || "",
        nombreCientifico: p.nombre_cientifico || "",
        nombreDisplay: nombreCientificoComun(p.nombre_cientifico, p.nombre_natural) || nombre,
        categoria,
        subcategoria,
        stockActual,
        stockMinimo,
        estado,
      };
    });
  }, [productos]);

  const stockCategoriasDisponibles = useMemo(() => {
    return [...new Set(normalizedStockItems.map((p) => p.categoria))].sort((a, b) =>
      a.localeCompare(b, "es")
    );
  }, [normalizedStockItems]);

  const stockSubcategoriasDisponibles = useMemo(() => {
    const filteredByCategory = stockCategoriaFilter
      ? normalizedStockItems.filter((p) => p.categoria === stockCategoriaFilter)
      : normalizedStockItems;

    return [...new Set(filteredByCategory.map((p) => p.subcategoria))].sort((a, b) =>
      a.localeCompare(b, "es")
    );
  }, [normalizedStockItems, stockCategoriaFilter]);

  // Inventario por zona: reconstruido de los movimientos (misma lógica que el
  // mapa del vivero). Por cada zona, productos con su cantidad por tamaño.
  const inventarioVivero = useMemo(() => {
    const movs = Array.isArray(movimientos) ? movimientos : [];
    const prods = Array.isArray(productos) ? productos : [];
    const prodById = new Map();
    for (const p of prods) prodById.set(String(p.id), p);

    const agg = new Map(); // zona -> Map(producto_id -> Map(tamaño -> cantidad))
    const addTo = (zona, pid, tam, delta) => {
      const z = String(zona || "").trim();
      const t = String(tam || "").trim();
      if (!z || !pid || !t) return;
      if (!agg.has(z)) agg.set(z, new Map());
      const porProd = agg.get(z);
      const key = String(pid);
      if (!porProd.has(key)) porProd.set(key, new Map());
      const porTam = porProd.get(key);
      porTam.set(t, (porTam.get(t) || 0) + delta);
    };

    for (const m of movs) {
      const cant = Number(m?.cantidad || 0);
      if (!cant) continue;
      const pid = m?.producto_id;
      if (!pid) continue;
      const destino = String(m?.destino_tipo || "").trim().toLowerCase();
      const origen = String(m?.origen_tipo || "").trim().toLowerCase();
      if (destino === "vivero" && m?.zona_destino && m?.tamano_destino) {
        addTo(m.zona_destino, pid, m.tamano_destino, cant);
      }
      if (origen === "vivero" && m?.zona_origen && m?.tamano_origen) {
        addTo(m.zona_origen, pid, m.tamano_origen, -cant);
      }
    }

    const zonas = [];
    for (const [zona, porProd] of agg.entries()) {
      const tamsSet = new Set();
      const productosZona = [];
      for (const [pid, porTam] of porProd.entries()) {
        const tamanos = {};
        let total = 0;
        for (const [tam, q] of porTam.entries()) {
          if (q > 1e-9) {
            tamanos[tam] = q;
            tamsSet.add(tam);
            total += q;
          }
        }
        if (total <= 0) continue;
        const prod = prodById.get(String(pid));
        productosZona.push({
          producto_id: pid,
          nombre: prod?.nombre_cientifico || prod?.nombre_natural || `Producto #${pid}`,
          nombreComun: prod?.nombre_natural || "",
          categoria: prod?.categoria || "",
          subcategoria: prod?.subcategoria || "",
          tamanos,
          total,
        });
      }
      if (productosZona.length === 0) continue;
      productosZona.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
      zonas.push({
        zona,
        label: getZonaLabel(zona) || zona,
        tamanos: ordenarTamanos([...tamsSet]),
        productos: productosZona,
      });
    }
    zonas.sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true }));
    return zonas;
  }, [movimientos, productos]);

  // Categorías/subcategorías presentes en el inventario (para los desplegables).
  const invCategoriasDisponibles = useMemo(() => {
    const s = new Set();
    for (const z of inventarioVivero) for (const p of z.productos) { const c = String(p.categoria || "").trim(); if (c) s.add(c); }
    return [...s].sort((a, b) => a.localeCompare(b, "es"));
  }, [inventarioVivero]);
  const invSubcategoriasDisponibles = useMemo(() => {
    const s = new Set();
    for (const z of inventarioVivero) for (const p of z.productos) {
      if (invCategoria && String(p.categoria || "").trim() !== invCategoria) continue;
      const sc = String(p.subcategoria || "").trim(); if (sc) s.add(sc);
    }
    return [...s].sort((a, b) => a.localeCompare(b, "es"));
  }, [inventarioVivero, invCategoria]);

  // Inventario tras aplicar los filtros de producto/categoría/subcategoría.
  // Filtra los productos dentro de cada zona, recalcula los tamaños presentes
  // y descarta zonas que se quedan sin productos.
  const inventarioFiltrado = useMemo(() => {
    const term = normalizarBusqueda(invSearch);
    const out = [];
    for (const z of inventarioVivero) {
      const productos = z.productos.filter((p) => {
        if (invCategoria && String(p.categoria || "").trim() !== invCategoria) return false;
        if (invSubcategoria && String(p.subcategoria || "").trim() !== invSubcategoria) return false;
        if (!term) return true;
        return (
          normalizarBusqueda(p.nombre).includes(term) ||
          normalizarBusqueda(p.nombreComun).includes(term) ||
          normalizarBusqueda(p.categoria).includes(term) ||
          normalizarBusqueda(p.subcategoria).includes(term)
        );
      });
      if (productos.length === 0) continue;
      const tamsSet = new Set();
      for (const p of productos) for (const t of Object.keys(p.tamanos)) tamsSet.add(t);
      out.push({ ...z, productos, tamanos: ordenarTamanos([...tamsSet]) });
    }
    return out;
  }, [inventarioVivero, invSearch, invCategoria, invSubcategoria]);

  const stockFilteredItems = useMemo(() => {
    const term = normalizarBusqueda(stockSearch);

    return normalizedStockItems.filter((item) => {
      const matchesCategory = !stockCategoriaFilter || item.categoria === stockCategoriaFilter;
      const matchesSubcategory =
        !stockSubcategoriaFilter || item.subcategoria === stockSubcategoriaFilter;
      const stockActualNum = Number(item.stockActual);
      const matchesEstado =
        stockEstadoFilter === "con_stock" ? stockActualNum > 0 :
        stockEstadoFilter === "bajo" ? (item.estado === "Bajo stock" && stockActualNum > 0) :
        stockEstadoFilter === "agotado" ? stockActualNum <= 0 :
        true;
      // Busca en nombre científico Y común (y categoría/subcategoría), sin acentos.
      const matchesSearch =
        !term ||
        normalizarBusqueda(item.nombreCientifico).includes(term) ||
        normalizarBusqueda(item.nombreComun).includes(term) ||
        normalizarBusqueda(item.nombre).includes(term) ||
        normalizarBusqueda(item.categoria).includes(term) ||
        normalizarBusqueda(item.subcategoria).includes(term);

      return matchesCategory && matchesSubcategory && matchesEstado && matchesSearch;
    });
  }, [
    normalizedStockItems,
    stockSearch,
    stockCategoriaFilter,
    stockSubcategoriaFilter,
    stockEstadoFilter,
  ]);

  const stockGroupedByCategory = useMemo(() => {
    const map = new Map();

    stockFilteredItems.forEach((item) => {
      if (!map.has(item.categoria)) {
        map.set(item.categoria, {
          categoria: item.categoria,
          totalProductos: 0,
          stockTotal: 0,
          bajoStock: 0,
          items: [],
        });
      }

      const group = map.get(item.categoria);
      group.totalProductos += 1;
      group.stockTotal += item.stockActual;
      if (item.estado === "Bajo stock") group.bajoStock += 1;
      group.items.push(item);
    });

    return [...map.values()]
      .map((group) => ({
        ...group,
        items: [...group.items].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
      }))
      .sort((a, b) => a.categoria.localeCompare(b.categoria, "es"));
  }, [stockFilteredItems]);

  const stockSummary = useMemo(() => {
    return {
      totalCategorias: stockGroupedByCategory.length,
      totalProductos: stockFilteredItems.length,
      totalStock: stockFilteredItems.reduce((sum, item) => sum + item.stockActual, 0),
      totalBajoStock: stockFilteredItems.filter((item) => item.estado === "Bajo stock").length,
    };
  }, [stockFilteredItems, stockGroupedByCategory]);

  const stockExportData = useMemo(() => {
    return {
      filters: {
        categoria: stockCategoriaFilter,
        subcategoria: stockSubcategoriaFilter,
        search: stockSearch,
        estado: stockEstadoFilter,
      },
      totalCategorias: stockSummary.totalCategorias,
      totalProductos: stockSummary.totalProductos,
      groups: stockGroupedByCategory,
    };
  }, [
    stockCategoriaFilter,
    stockSubcategoriaFilter,
    stockSearch,
    stockEstadoFilter,
    stockSummary,
    stockGroupedByCategory,
  ]);

  const caducidadItems = useMemo(() => buildCaducidadItems(productos), [productos]);

  const caducidadSummary = useMemo(() => {
    return {
      totalItems: caducidadItems.length,
      totalCaducados: caducidadItems.filter((item) => item.estado === "Caducado").length,
      totalProximos: caducidadItems.filter((item) => item.estado === "Próximo a caducar").length,
      totalVigentes: caducidadItems.filter((item) => item.estado === "Vigente").length,
    };
  }, [caducidadItems]);

  const caducidadExportData = useMemo(() => {
    return {
      items: caducidadItems,
      totalItems: caducidadSummary.totalItems,
      totalCaducados: caducidadSummary.totalCaducados,
      totalProximos: caducidadSummary.totalProximos,
      totalVigentes: caducidadSummary.totalVigentes,
    };
  }, [caducidadItems, caducidadSummary]);

  const barriosDisponibles = useMemo(() => {
    return distrito ? DISTRICT_BARRIOS[distrito] || [] : [];
  }, [distrito]);

  const trazabilidadResumen = useMemo(() => {
    if (!trazabilidadData?.movimientos) return [];
    return trazabilidadData.movimientos;
  }, [trazabilidadData]);


  const prestamosItems = useMemo(() => {
    const items = buildPrestamoItems(pedidos, movimientos);
    const productoTerm = prestamoProductoFilter.trim().toLowerCase();
    const solicitanteTerm = prestamoSolicitanteFilter.trim().toLowerCase();
    const fechaDesdeObj = prestamoFechaDesde ? new Date(`${prestamoFechaDesde}T00:00:00`) : null;
    const fechaHastaObj = prestamoFechaHasta ? new Date(`${prestamoFechaHasta}T23:59:59`) : null;

    return items.filter((item) => {
      const productoMatch =
        !productoTerm ||
        item.lineas.some((l) => l.producto.toLowerCase().includes(productoTerm));

      const solicitanteMatch =
        !solicitanteTerm ||
        item.solicitante.toLowerCase().includes(solicitanteTerm) ||
        item.destinatario.toLowerCase().includes(solicitanteTerm);

      const estadoMatch = !prestamoEstadoFilter || item.estado === prestamoEstadoFilter;

      const fechaItem = item.fechaPrestamo ? new Date(item.fechaPrestamo) : null;
      const fechaDesdeMatch = !fechaDesdeObj || (fechaItem && fechaItem >= fechaDesdeObj);
      const fechaHastaMatch = !fechaHastaObj || (fechaItem && fechaItem <= fechaHastaObj);

      return productoMatch && solicitanteMatch && estadoMatch && fechaDesdeMatch && fechaHastaMatch;
    });
  }, [
    pedidos,
    movimientos,
    prestamoProductoFilter,
    prestamoSolicitanteFilter,
    prestamoEstadoFilter,
    prestamoFechaDesde,
    prestamoFechaHasta,
  ]);

  const prestamosSummary = useMemo(() => {
    return {
      totalPrestamos: prestamosItems.length,
      totalActivos: prestamosItems.filter((item) => item.estado === "Activo").length,
      totalDevueltos: prestamosItems.filter((item) => item.estado === "Devuelto").length,
    };
  }, [prestamosItems]);

  const prestamosExportData = useMemo(() => {
    return {
      items: prestamosItems,
      totalPrestamos: prestamosSummary.totalPrestamos,
      totalActivos: prestamosSummary.totalActivos,
      totalDevueltos: prestamosSummary.totalDevueltos,
    };
  }, [prestamosItems, prestamosSummary]);

  const abastecimientoItems = useMemo(() => {
    const base = buildAbastecimientoItems(pedidos);
    const prodTerm = abastProductoFilter.trim().toLowerCase();
    const solTerm = abastSolicitanteFilter.trim().toLowerCase();
    const desde = abastFechaDesde ? new Date(`${abastFechaDesde}T00:00:00`) : null;
    const hasta = abastFechaHasta ? new Date(`${abastFechaHasta}T23:59:59`) : null;

    return base.filter((item) => {
      const estadoMatch = !abastEstadoFilter || item.estado === abastEstadoFilter;
      const prodMatch =
        !prodTerm || item.lineas.some((l) => l.producto.toLowerCase().includes(prodTerm));
      const solMatch = !solTerm || String(item.solicitante).toLowerCase().includes(solTerm);

      const f = item.fecha ? new Date(item.fecha) : null;
      const desdeOk = !desde || (f && f >= desde);
      const hastaOk = !hasta || (f && f <= hasta);

      return estadoMatch && prodMatch && solMatch && desdeOk && hastaOk;
    });
  }, [
    pedidos,
    abastEstadoFilter,
    abastSolicitanteFilter,
    abastProductoFilter,
    abastFechaDesde,
    abastFechaHasta,
  ]);

  const abastecimientoSummary = useMemo(() => {
    return {
      total: abastecimientoItems.length,
      reserva: abastecimientoItems.filter((x) => x.estado === "RESERVA").length,
      aprobados: abastecimientoItems.filter((x) => x.estado === "APROBADO").length,
      servidos: abastecimientoItems.filter((x) => x.estado === "SERVIDO").length,
      denegados: abastecimientoItems.filter((x) => x.estado === "DENEGADO").length,
      cancelados: abastecimientoItems.filter((x) => x.estado === "CANCELADO").length,
      totalPedido: abastecimientoItems.reduce((s, x) => s + x.totalPedido, 0),
      totalServido: abastecimientoItems.reduce((s, x) => s + x.totalServido, 0),
      totalPendiente: abastecimientoItems.reduce((s, x) => s + x.totalPendiente, 0),
    };
  }, [abastecimientoItems]);

  const abastecimientoExportData = useMemo(() => ({
    items: abastecimientoItems,
    ...abastecimientoSummary,
  }), [abastecimientoItems, abastecimientoSummary]);

  const onLimpiarAbastecimiento = () => {
    setAbastEstadoFilter("");
    setAbastSolicitanteFilter("");
    setAbastProductoFilter("");
    setAbastFechaDesde("");
    setAbastFechaHasta("");
  };

  const bajasItemsAll = useMemo(
    () => buildBajasItems(movimientos, productos),
    [movimientos, productos]
  );

  const bajasCategoriasDisponibles = useMemo(() => {
    return [...new Set(bajasItemsAll.map((x) => x.categoria))].sort((a, b) =>
      a.localeCompare(b, "es")
    );
  }, [bajasItemsAll]);

  const bajasSubcategoriasDisponibles = useMemo(() => {
    const base = bajaCategoriaFilter
      ? bajasItemsAll.filter((x) => x.categoria === bajaCategoriaFilter)
      : bajasItemsAll;
    return [...new Set(base.map((x) => x.subcategoria))].sort((a, b) =>
      a.localeCompare(b, "es")
    );
  }, [bajasItemsAll, bajaCategoriaFilter]);

  const bajasItems = useMemo(() => {
    const prodTerm = bajaProductoFilter.trim().toLowerCase();
    const desde = bajaFechaDesde ? new Date(`${bajaFechaDesde}T00:00:00`) : null;
    const hasta = bajaFechaHasta ? new Date(`${bajaFechaHasta}T23:59:59`) : null;

    return bajasItemsAll.filter((x) => {
      const prodMatch =
        !prodTerm ||
        x.producto.toLowerCase().includes(prodTerm) ||
        x.uuidLote.toLowerCase().includes(prodTerm);
      const catMatch = !bajaCategoriaFilter || x.categoria === bajaCategoriaFilter;
      const subMatch = !bajaSubcategoriaFilter || x.subcategoria === bajaSubcategoriaFilter;
      const f = x.fecha ? new Date(x.fecha) : null;
      const desdeOk = !desde || (f && f >= desde);
      const hastaOk = !hasta || (f && f <= hasta);
      return prodMatch && catMatch && subMatch && desdeOk && hastaOk;
    });
  }, [bajasItemsAll, bajaProductoFilter, bajaCategoriaFilter, bajaSubcategoriaFilter, bajaFechaDesde, bajaFechaHasta]);

  const bajasSummary = useMemo(() => {
    const totalUnidades = bajasItems.reduce((s, x) => s + x.cantidad, 0);
    const productosUnicos = new Set(bajasItems.map((x) => x.productoId)).size;
    return {
      totalMovimientos: bajasItems.length,
      totalUnidades,
      productosUnicos,
    };
  }, [bajasItems]);

  // =========================================================
  // INFORME DE ESTADÍSTICAS (solo administrador)
  // Entradas de reposición (compras a proveedores) con su coste.
  // =========================================================
  const [estadDesde, setEstadDesde] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [estadHasta, setEstadHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [estadProducto, setEstadProducto] = useState("");
  const [estadCategoria, setEstadCategoria] = useState("");
  const [estadSubcategoria, setEstadSubcategoria] = useState("");
  // Modo simulación: genera datos ficticios (precios + movimientos de reposición
  // de los 3 últimos meses) SOLO en memoria, para previsualizar el informe. No
  // se guarda nada en la base de datos.
  const [estadSimular, setEstadSimular] = useState(false);
  useEffect(() => { setEstadSubcategoria(""); }, [estadCategoria]);
  // Al activar la simulación ampliamos el rango a los 3 últimos meses (los datos
  // simulados cubren ese periodo); al desactivarla volvemos al último mes.
  useEffect(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - (estadSimular ? 3 : 1));
    setEstadDesde(d.toISOString().slice(0, 10));
    setEstadHasta(new Date().toISOString().slice(0, 10));
  }, [estadSimular]);

  const productosById = useMemo(() => {
    const m = new Map();
    for (const p of Array.isArray(productos) ? productos : []) m.set(String(p.id), p);
    return m;
  }, [productos]);

  // Ids de pedidos de tipo "reposición".
  const reposicionPedidoIds = useMemo(() => {
    const s = new Set();
    for (const p of Array.isArray(pedidos) ? pedidos : []) {
      if (String(p?.tipo || "").trim().toLowerCase() === "reposicion") s.add(String(p.id));
    }
    return s;
  }, [pedidos]);

  // Movimientos REALES de ENTRADA asociados a un pedido de reposición, con coste.
  const estadRowsReales = useMemo(() => {
    const rows = [];
    for (const m of Array.isArray(movimientos) ? movimientos : []) {
      if (m?.es_devolucion) continue;
      const pid = m?.pedido_id;
      if (pid == null || !reposicionPedidoIds.has(String(pid))) continue;
      const tipo = String(m?.tipo_movimiento || "").trim().toLowerCase();
      if (tipo && tipo !== "entrada") continue;
      const prod = productosById.get(String(m.producto_id));
      const precio = prod?.precio != null ? Number(prod.precio) : null;
      const cantidad = Number(m.cantidad || 0);
      const nombreCientifico = m.producto_nombre_cientifico || prod?.nombre_cientifico || "";
      const nombreComun = m.producto_nombre_natural || prod?.nombre_natural || "";
      rows.push({
        id: m.id,
        fecha: m.fecha_movimiento,
        producto_id: m.producto_id,
        nombreCientifico,
        nombreComun,
        nombreDisplay: nombreCientificoComun(nombreCientifico, nombreComun),
        categoria: m.producto_categoria || prod?.categoria || "",
        subcategoria: m.producto_subcategoria || prod?.subcategoria || "",
        tamano: m.tamano_destino || m.tamano_origen || "—",
        cantidad,
        precio,
        coste: precio != null ? precio * cantidad : null,
        pedido_id: pid,
      });
    }
    return rows;
  }, [movimientos, reposicionPedidoIds, productosById]);

  // Datos SIMULADOS: por cada producto del catálogo generamos entradas de
  // reposición en los 3 últimos meses, con un precio ficticio y cantidades
  // deterministas (dependen del id, para que no cambien en cada render). Solo
  // en memoria — no toca la base de datos.
  const estadRowsSimulados = useMemo(() => {
    const lista = (Array.isArray(productos) ? productos : []).slice(0, 60);
    if (lista.length === 0) return [];
    const TAMS = ["M12", "M20", "M35"];
    const now = new Date();
    const rows = [];
    lista.forEach((p, idx) => {
      const pid = Number(p.id) || idx + 1;
      // Precio ficticio si no tiene: entre ~4 y ~64 €.
      const precio = p.precio != null ? Number(p.precio) : 4 + ((pid * 7) % 60) + ((pid % 4) * 0.25);
      const nombreCientifico = p.nombre_cientifico || "";
      const nombreComun = p.nombre_natural || "";
      for (let mesAtras = 0; mesAtras < 3; mesAtras++) {
        const d = new Date(now.getFullYear(), now.getMonth() - mesAtras, ((pid * 3 + mesAtras) % 26) + 1);
        // Algunas combinaciones no generan movimiento (para que el informe no sea uniforme).
        if ((pid + mesAtras) % 5 === 0) continue;
        const cantidad = ((pid * 13 + mesAtras * 29) % 40) + 1;
        rows.push({
          id: `sim-${pid}-${mesAtras}`,
          fecha: d.toISOString(),
          producto_id: pid,
          nombreCientifico,
          nombreComun,
          nombreDisplay: nombreCientificoComun(nombreCientifico, nombreComun) || `Producto #${pid}`,
          categoria: p.categoria || "",
          subcategoria: p.subcategoria || "",
          tamano: TAMS[(pid + mesAtras) % TAMS.length],
          cantidad,
          precio,
          coste: precio * cantidad,
          pedido_id: `sim-${pid}`,
        });
      }
    });
    return rows;
  }, [productos]);

  const estadRowsAll = estadSimular ? estadRowsSimulados : estadRowsReales;

  // Categorías / subcategorías EXISTENTES en el catálogo (para poder filtrar
  // aunque aún no haya movimientos reales de reposición).
  const estadCategorias = useMemo(
    () => [...new Set((Array.isArray(productos) ? productos : []).map((p) => String(p?.categoria || "").trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "es")),
    [productos]
  );
  const estadSubcategorias = useMemo(() => {
    if (!estadCategoria) return [];
    return [...new Set(
      (Array.isArray(productos) ? productos : [])
        .filter((p) => String(p?.categoria || "").trim() === estadCategoria)
        .map((p) => String(p?.subcategoria || "").trim())
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, "es"));
  }, [productos, estadCategoria]);

  const estadFiltrado = useMemo(() => {
    const term = normalizarBusqueda(estadProducto);
    const desde = estadDesde ? new Date(`${estadDesde}T00:00:00`) : null;
    const hasta = estadHasta ? new Date(`${estadHasta}T23:59:59`) : null;
    return estadRowsAll
      .filter((r) => {
        const f = r.fecha ? new Date(r.fecha) : null;
        if (desde && (!f || f < desde)) return false;
        if (hasta && (!f || f > hasta)) return false;
        if (estadCategoria && r.categoria !== estadCategoria) return false;
        if (estadSubcategoria && r.subcategoria !== estadSubcategoria) return false;
        if (term && !(normalizarBusqueda(r.nombreCientifico).includes(term) || normalizarBusqueda(r.nombreComun).includes(term))) return false;
        return true;
      })
      .sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
  }, [estadRowsAll, estadProducto, estadCategoria, estadSubcategoria, estadDesde, estadHasta]);

  const estadTotalCoste = useMemo(() => estadFiltrado.reduce((s, r) => s + (r.coste || 0), 0), [estadFiltrado]);
  const estadTotalUds = useMemo(() => estadFiltrado.reduce((s, r) => s + Number(r.cantidad || 0), 0), [estadFiltrado]);
  const estadSinPrecio = useMemo(() => estadFiltrado.some((r) => r.coste == null), [estadFiltrado]);

  // Coste mensual de reposición (para la gráfica de barras).
  const estadCostesMensuales = useMemo(() => {
    const m = new Map();
    for (const r of estadFiltrado) {
      if (!r.fecha) continue;
      const d = new Date(r.fecha);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      m.set(key, (m.get(key) || 0) + (r.coste || 0));
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([mes, total]) => ({ mes, total }));
  }, [estadFiltrado]);

  // Productos más solicitados (por unidades recibidas en reposición).
  const estadTopProductos = useMemo(() => {
    const m = new Map();
    for (const r of estadFiltrado) {
      const key = String(r.producto_id);
      const cur = m.get(key) || { nombre: r.nombreDisplay || r.nombreCientifico, cantidad: 0 };
      cur.cantidad += Number(r.cantidad || 0);
      m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => b.cantidad - a.cantidad).slice(0, 10);
  }, [estadFiltrado]);

  const estadExportData = useMemo(() => ({
    simulado: estadSimular,
    filters: { desde: estadDesde, hasta: estadHasta, producto: estadProducto, categoria: estadCategoria, subcategoria: estadSubcategoria },
    rows: estadFiltrado,
    totalCoste: estadTotalCoste,
    totalUds: estadTotalUds,
    costesMensuales: estadCostesMensuales,
    topProductos: estadTopProductos,
  }), [estadSimular, estadDesde, estadHasta, estadProducto, estadCategoria, estadSubcategoria, estadFiltrado, estadTotalCoste, estadTotalUds, estadCostesMensuales, estadTopProductos]);

  const exportarEstadisticasExcel = () => {
    const esc = (v) => {
      const s = String(v ?? "");
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = ["Fecha", "Producto", "Categoría", "Subcategoría", "Tamaño", "Cantidad", "Precio unit. (€)", "Coste (€)"];
    const lineas = estadFiltrado.map((r) =>
      [
        r.fecha ? formatFechaCanaria(r.fecha) : "",
        r.nombreDisplay,
        r.categoria,
        r.subcategoria,
        r.tamano,
        r.cantidad,
        r.precio == null ? "" : Number(r.precio).toFixed(2).replace(".", ","),
        r.coste == null ? "" : Number(r.coste).toFixed(2).replace(".", ","),
      ].map(esc).join(";")
    );
    const total = ["", "TOTAL", "", "", "", estadTotalUds, "", Number(estadTotalCoste).toFixed(2).replace(".", ",")];
    const csv = [headers.map(esc).join(";"), ...lineas, total.map(esc).join(";")].join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `estadisticas_reposicion_${estadDesde}_a_${estadHasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const bajasExportData = useMemo(() => ({
    items: bajasItems,
    filtros: {
      producto: bajaProductoFilter,
      categoria: bajaCategoriaFilter,
      subcategoria: bajaSubcategoriaFilter,
      fecha_desde: bajaFechaDesde,
      fecha_hasta: bajaFechaHasta,
    },
    ...bajasSummary,
  }), [bajasItems, bajasSummary, bajaProductoFilter, bajaCategoriaFilter, bajaSubcategoriaFilter, bajaFechaDesde, bajaFechaHasta]);

  const onLimpiarBajas = () => {
    setBajaProductoFilter("");
    setBajaCategoriaFilter("");
    setBajaSubcategoriaFilter("");
    setBajaFechaDesde("");
    setBajaFechaHasta("");
  };

  const onActualizarPrestamos = async () => {
    await loadProductos(true);
  };

  const onLimpiarPrestamos = () => {
    setPrestamoProductoFilter("");
    setPrestamoSolicitanteFilter("");
    setPrestamoEstadoFilter("");
    setPrestamoFechaDesde("");
    setPrestamoFechaHasta("");
  };

  const canExportCurrentReport = useMemo(() => {
    if (activeReport === "trazabilidad") return !!trazabilidadData;
    if (activeReport === "distribucion") return !!distribucionData;
    if (activeReport === "inventario") return inventarioFiltrado.length > 0;
    if (activeReport === "stock") return stockFilteredItems.length > 0;
    if (activeReport === "caducidad") return caducidadItems.length > 0;
    if (activeReport === "externos") return externosSearched;
    if (activeReport === "prestamos") return prestamosItems.length > 0;
    if (activeReport === "abastecimiento") return abastecimientoItems.length > 0;
    if (activeReport === "bajas") return bajasItems.length > 0;
    if (activeReport === "estadisticas") return estadFiltrado.length > 0;
    return false;
  }, [
    activeReport,
    trazabilidadData,
    distribucionData,
    stockFilteredItems,
    caducidadItems,
    externosSearched,
    prestamosItems,
    abastecimientoItems,
    bajasItems,
    inventarioFiltrado,
    estadFiltrado,
  ]);

  const handleExportPdf = async () => {
    if (!canExportCurrentReport || exporting) return;
    try {
      setExporting(true);
      await exportReportToPdf({
        activeReport,
        me,
        trazabilidadData,
        distribucionData,
        inventarioVivero: inventarioFiltrado,
        stockExportData,
        caducidadExportData,
        externosData,
        prestamosExportData,
        abastecimientoExportData,
        bajasExportData,
        estadisticasExportData: estadExportData,
      });
      showTimedMessage("PDF exportado correctamente.", "success");
    } catch (e) {
      if (e?.name !== "AbortError") {
        showTimedMessage(e?.message || "No se pudo exportar el PDF.", "error");
      }
    } finally {
      setExporting(false);
    }
  };

  const onBuscarTrazabilidad = async () => {
    if (!uuid.trim()) {
      showTimedMessage("Debes introducir un UUID.", "error");
      return;
    }

    setLoading(true);
    try {
      const data = await getTrazabilidadReporte(uuid.trim());
      setTrazabilidadData(data);
      showTimedMessage("Informe de trazabilidad generado.", "success");
    } catch (e) {
      setTrazabilidadData(null);
      showTimedMessage(
        e?.response?.data?.detail || e?.message || "Error generando trazabilidad",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const onSelectProducto = (producto) => {
    const label =
      producto.nombre_natural ||
      producto.nombre_cientifico ||
      `Producto #${producto.id}`;
    setSelectedProducto(producto);
    setProductoSearch(label);
    setShowProductoDropdown(false);
  };

  const onBuscarDistribucion = async () => {
    const searchValue = (
      selectedProducto?.nombre_natural ||
      selectedProducto?.nombre_cientifico ||
      productoSearch ||
      ""
    ).trim();

    if (!searchValue) {
      showTimedMessage("Debes indicar el nombre del producto.", "error");
      return;
    }

    setLoading(true);
    try {
      const data = await getDistribucionReporte(searchValue);
      setDistribucionData(data);
      showTimedMessage("Informe de distribución generado.", "success");
    } catch (e) {
      setDistribucionData(null);
      showTimedMessage(
        e?.response?.data?.detail || e?.message || "Error generando distribución",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const onNuevaBusquedaDistribucion = () => {
    setProductoSearch("");
    setSelectedProducto(null);
    setShowProductoDropdown(false);
    setDistribucionData(null);
  };

  const onBuscarStock = async () => {
    await loadProductos(true);
  };

  const onBuscarCaducidad = async () => {
    await loadProductos(true);
  };

  const onLimpiarFiltrosStock = () => {
    setStockSearch("");
    setStockCategoriaFilter("");
    setStockSubcategoriaFilter("");
    setStockEstadoFilter("");
  };

  const onBuscarExternos = async () => {
    setLoading(true);
    try {
      const data = await getMovimientosExternosReporte({
        fecha_desde: fechaDesde || undefined,
        fecha_hasta: fechaHasta || undefined,
        distrito: distrito || undefined,
        barrio: barrio || undefined,
        direccion: direccion || undefined,
        categoria: externosCategoria || undefined,
        subcategoria: externosSubcategoria || undefined,
      });
      setExternosData(Array.isArray(data) ? data : []);
      setExternosSearched(true);
      showTimedMessage("Informe de movimientos externos generado.", "success");
    } catch (e) {
      setExternosData([]);
      setExternosSearched(false);
      showTimedMessage(
        e?.response?.data?.detail || e?.message || "Error generando movimientos externos",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const onNuevaBusquedaExternos = () => {
    setFechaDesde("");
    setFechaHasta("");
    setDistrito("");
    setBarrio("");
    setDireccion("");
    setExternosCategoria("");
    setExternosSubcategoria("");
    setExternosData([]);
    setExternosSearched(false);
  };

  // Exporta el informe de movimientos externos a CSV (lo abre Excel).
  const exportarExternosExcel = () => {
    const rows = Array.isArray(externosData) ? externosData : [];
    const headers = ["Fecha", "Producto", "Categoría", "Subcategoría", "Cantidad", "Origen", "Destino", "Ubicación destino", "Registrado por"];
    const esc = (v) => {
      const s = String(v ?? "");
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lineas = rows.map((r) => [
      fmtFecha(r.fecha_movimiento),
      r.producto_nombre || "",
      r.producto_categoria || "",
      r.producto_subcategoria || "",
      r.cantidad ?? "",
      [r.origen_tipo, r.zona_origen, r.tamano_origen].filter(Boolean).join(" · "),
      [r.destino_tipo, r.zona_destino, r.tamano_destino].filter(Boolean).join(" · "),
      [r.distrito_destino, r.barrio_destino, r.direccion_destino].filter(Boolean).join(" · "),
      r.created_by || "",
    ].map(esc).join(";"));
    const total = rows.reduce((s, r) => s + Number(r?.cantidad || 0), 0);
    const csv = [headers.join(";"), ...lineas, "", `Total elementos;;;;${total}`].join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "movimientos_externos.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Exporta el informe de Inventario vivero a CSV (matriz por zona con una
  // columna por tamaño; lo abre Excel).
  const exportarInventarioExcel = () => {
    const zonas = Array.isArray(inventarioFiltrado) ? inventarioFiltrado : [];
    if (zonas.length === 0) return;
    const esc = (v) => {
      const s = String(v ?? "");
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    // Unión ordenada de todos los tamaños presentes en cualquier zona.
    const tamsSet = new Set();
    for (const z of zonas) for (const t of z.tamanos) tamsSet.add(t);
    const tamanos = ordenarTamanos([...tamsSet]);
    const headers = ["Zona", "Nombre científico", "Nombre común", "Categoría", "Subcategoría", ...tamanos, "Total"];
    const lineas = [];
    for (const z of zonas) {
      for (const p of z.productos) {
        lineas.push([
          z.label,
          p.nombre,
          p.nombreComun || "",
          p.categoria || "",
          p.subcategoria || "",
          ...tamanos.map((t) => (p.tamanos[t] ? fmtCantInv(p.tamanos[t]) : "")),
          fmtCantInv(p.total),
        ].map(esc).join(";"));
      }
    }
    const csv = [headers.map(esc).join(";"), ...lineas].join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventario_vivero.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const csvEsc = (v) => {
    const s = String(v ?? "");
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const descargarCsv = (nombre, filas) => {
    const csv = filas.map((f) => f.map(csvEsc).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Exporta el informe de distribución a CSV (lo abre Excel).
  const exportarDistribucionExcel = () => {
    if (!distribucionData) return;
    const filas = [
      ["Producto", distribucionData.producto_nombre || `Producto #${distribucionData.producto_id || "—"}`],
      ["Stock total", fmtNum(distribucionData.stock_total)],
      ["Ubicaciones activas", fmtNum(distribucionData.distribucion?.length || 0)],
      [],
      ["Zona", "Tamaño", "Cantidad"],
      ...(distribucionData.distribucion || []).map((r) => [r.zona || "", r.tamano || "", fmtNum(r.cantidad)]),
    ];
    descargarCsv("distribucion.csv", filas);
  };

  // Exporta el informe de existencias a CSV (lo abre Excel).
  const exportarStockExcel = () => {
    const items = Array.isArray(stockFilteredItems) ? stockFilteredItems : [];
    if (items.length === 0) return;
    const filas = [
      ["Nombre científico", "Nombre común", "Categoría", "Subcategoría", "Stock", "Stock mínimo", "Estado"],
      ...items.map((it) => [
        it.nombreCientifico || it.nombre || "",
        it.nombreComun || "",
        it.categoria || "",
        it.subcategoria || "",
        fmtNum(it.stockActual),
        fmtNum(it.stockMinimo),
        it.estado || "",
      ]),
    ];
    descargarCsv("existencias.csv", filas);
  };

  if (!canAccess) {
    return (
      <div style={{ width: "100%" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
          <h1 style={{ fontSize: 44, margin: 0, fontWeight: 900, color: "#0f172a" }}>Informes</h1>
        </div>

        <div
          style={{
            ...cardStyle(),
            marginTop: 18,
            padding: 18,
            color: "#991b1b",
            fontWeight: 900,
            border: "1px solid rgba(239,68,68,0.18)",
            background: "linear-gradient(180deg, rgba(254,242,242,0.98), rgba(255,255,255,0.98))",
          }}
        >
          No tienes permisos para acceder a esta página.
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 44, margin: 0, fontWeight: 900, color: "#0f172a" }}>Informes</h1>
          <div style={{ marginTop: 8, color: "#64748b", fontWeight: 700 }}>
            Trazabilidad, distribución en vivero, existencias, caducidad, movimientos externos y préstamos.
          </div>
        </div>
      </div>

      <MessageBanner
        msg={msg}
        msgType={msgType}
        onClose={() => {
          clearMsgTimer();
          setMsg("");
        }}
      />

      <div style={{ ...cardStyle(), marginTop: 18, padding: 18 }}>
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {visibleReports.map((r) => {
              const active = activeReport === r.key;
              return (
                <button
                  key={r.key}
                  onClick={() => setActiveReport(r.key)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 14,
                    border: active
                      ? "1px solid rgba(6,182,212,0.25)"
                      : "1px solid rgba(15,23,42,0.10)",
                    background: active
                      ? "linear-gradient(135deg, #0ea5e9 0%, #06b6d4 40%, #10b981 100%)"
                      : "white",
                    color: active ? "white" : "#0f172a",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>

          <div style={{ position: "relative" }}>
            <button
              onClick={() => setExportMenuOpen((o) => !o)}
              disabled={!canExportCurrentReport || exporting}
              style={secondaryBtnStyle(!canExportCurrentReport || exporting)}
              title={canExportCurrentReport ? "Exportar informe" : "Genera primero un informe"}
            >
              {exporting ? "Exportando..." : "Exportar ▾"}
            </button>
            {exportMenuOpen && canExportCurrentReport && (
              <>
                <div onClick={() => setExportMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: "#fff", border: "1px solid rgba(15,23,42,0.12)", borderRadius: 12, boxShadow: "0 12px 30px rgba(2,6,23,0.18)", zIndex: 50, minWidth: 190, overflow: "hidden" }}>
                  <button
                    onClick={() => { setExportMenuOpen(false); handleExportPdf(); }}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 14px", border: "none", borderBottom: "1px solid rgba(15,23,42,0.06)", background: "#fff", cursor: "pointer", fontWeight: 800, color: "#0f172a", fontSize: 14 }}
                  >
                    📄 Exportar a PDF
                  </button>
                  {(activeReport === "inventario" || activeReport === "externos" || activeReport === "distribucion" || activeReport === "stock" || activeReport === "estadisticas") && (
                    <button
                      onClick={() => {
                        setExportMenuOpen(false);
                        if (activeReport === "inventario") exportarInventarioExcel();
                        else if (activeReport === "externos") exportarExternosExcel();
                        else if (activeReport === "distribucion") exportarDistribucionExcel();
                        else if (activeReport === "stock") exportarStockExcel();
                        else if (activeReport === "estadisticas") exportarEstadisticasExcel();
                      }}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 14px", border: "none", background: "#fff", cursor: "pointer", fontWeight: 800, color: "#0f172a", fontSize: 14 }}
                    >
                      📊 Exportar a Excel
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {(() => {
          const meta = REPORTS.find((r) => r.key === activeReport);
          return meta?.desc ? (
            <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 12, background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.16)", color: "#334155", fontWeight: 600, fontSize: 13.5, display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 16, lineHeight: "20px" }}>ℹ️</span>
              <span style={{ lineHeight: "20px" }}>{meta.desc}</span>
            </div>
          ) : null;
        })()}

        {activeReport === "trazabilidad" && (
          <>
            <div
              style={{
                marginTop: 22,
                display: "grid",
                gridTemplateColumns: "minmax(320px, 1fr) auto",
                gap: 18,
                alignItems: "end",
              }}
            >
              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>UUID del lote</div>
                <input
                  value={uuid}
                  onChange={(e) => setUuid(e.target.value)}
                  placeholder="Introduce el UUID"
                  style={softInputStyle()}
                />
              </div>

              <button onClick={onBuscarTrazabilidad} disabled={loading} style={primaryBtnStyle(loading)}>
                {loading ? "Generando..." : "Generar informe"}
              </button>
            </div>

            {trazabilidadData ? (
              <>
                <div style={{ ...cardStyle(), marginTop: 20, padding: 18 }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a", marginBottom: 10 }}>
                    Resumen del lote
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(4, minmax(160px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>UUID</div>
                      <div style={{ fontWeight: 800 }}>{trazabilidadData.uuid_lote || "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>Producto</div>
                      <div style={{ fontWeight: 800 }}>
                        {trazabilidadData.producto_nombre || `Producto #${trazabilidadData.producto_id || "—"}`}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>Cantidad inicial</div>
                      <div style={{ fontWeight: 800 }}>{fmtNum(trazabilidadData.cantidad_inicial)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>Fecha de entrada</div>
                      <div style={{ fontWeight: 800 }}>{fmtFecha(trazabilidadData.fecha_entrada)}</div>
                    </div>
                  </div>
                </div>

                <div style={{ ...cardStyle(), marginTop: 20, padding: 18 }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a", marginBottom: 10 }}>
                    Línea temporal
                  </div>

                  {!trazabilidadResumen.length ? (
                    <div style={{ color: "#64748b", fontWeight: 800 }}>No hay movimientos asociados a este UUID.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 12 }}>
                      {trazabilidadResumen.map((m, idx) => (
                        <div
                          key={`${m.movimiento_id || idx}-${idx}`}
                          style={{
                            padding: 14,
                            borderRadius: 16,
                            border: "1px solid rgba(15,23,42,0.08)",
                            background: "#fafcff",
                          }}
                        >
                          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>
                            {fmtFecha(m.fecha_movimiento)}
                          </div>
                          <div style={{ marginTop: 6, fontWeight: 800, color: "#0f172a" }}>
                            {m.descripcion || "Movimiento registrado"}
                          </div>
                          <div style={{ marginTop: 6, color: "#64748b", fontWeight: 700 }}>
                            Cantidad: {fmtNum(m.cantidad)} · Origen: {m.origen_tipo || "—"} · Destino: {m.destino_tipo || "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ ...cardStyle(), marginTop: 20, padding: 18 }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a", marginBottom: 10 }}>
                    Inventario actual del lote
                  </div>

                  {!trazabilidadData.inventario_actual?.length ? (
                    <div style={{ color: "#64748b", fontWeight: 800 }}>
                      El lote no tiene inventario disponible actualmente.
                    </div>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            <th style={thStyle()}>Zona</th>
                            <th style={thStyle()}>Tamaño</th>
                            <th style={thStyle()}>Cantidad disponible</th>
                          </tr>
                        </thead>
                        <tbody>
                          {trazabilidadData.inventario_actual.map((inv, idx) => (
                            <tr key={idx}>
                              <td style={tdStyle()}>{inv.zona || "—"}</td>
                              <td style={tdStyle()}>{inv.tamano || "—"}</td>
                              <td style={tdStyle()}>{fmtNum(inv.cantidad_disponible)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <EmptyState text="Introduce un UUID para generar el informe de trazabilidad." />
            )}
          </>
        )}

        {activeReport === "distribucion" && (
          <>
            <div
              style={{
                marginTop: 22,
                display: "grid",
                gridTemplateColumns: "minmax(360px, 1fr) auto auto",
                gap: 18,
                alignItems: "end",
              }}
            >
              <div ref={productoSearchRef} style={{ position: "relative", minWidth: 0 }}>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Buscar producto</div>
                <input
                  value={productoSearch}
                  onChange={(e) => {
                    setProductoSearch(e.target.value);
                    setSelectedProducto(null);
                    setShowProductoDropdown(true);
                  }}
                  onFocus={() => setShowProductoDropdown(true)}
                  placeholder="Escribe nombre natural, científico, categoría o subcategoría"
                  style={softInputStyle()}
                />

                {showProductoDropdown && filteredProductos.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 10px)",
                      left: 0,
                      right: 0,
                      zIndex: 20,
                      maxHeight: 280,
                      overflowY: "auto",
                      background: "white",
                      border: "2px solid #334155",
                      borderRadius: 14,
                      boxShadow: "0 18px 40px rgba(2,6,23,0.12)",
                    }}
                  >
                    {filteredProductos.map((p) => {
                      const label = p.nombre_natural || p.nombre_cientifico || `Producto #${p.id}`;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => onSelectProducto(p)}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "12px 14px",
                            border: "none",
                            borderBottom: "1px solid rgba(15,23,42,0.06)",
                            background: "white",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ fontWeight: 900, color: "#0f172a" }}>{label}</div>
                          <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>
                            {p.nombre_cientifico || "—"} · {p.categoria || "—"} · {p.subcategoria || "—"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button onClick={onBuscarDistribucion} disabled={loading} style={primaryBtnStyle(loading)}>
                {loading ? "Generando..." : "Generar informe"}
              </button>

              <button onClick={onNuevaBusquedaDistribucion} style={secondaryBtnStyle()}>
                Nueva búsqueda
              </button>
            </div>

            {distribucionData ? (
              <>
                <div style={{ ...cardStyle(), marginTop: 20, padding: 18 }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a", marginBottom: 10 }}>Resumen</div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(160px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>Producto</div>
                      <div style={{ fontWeight: 800 }}>
                        {distribucionData.producto_nombre || `Producto #${distribucionData.producto_id || "—"}`}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>Stock total</div>
                      <div style={{ fontWeight: 800 }}>{fmtNum(distribucionData.stock_total)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>Ubicaciones activas</div>
                      <div style={{ fontWeight: 800 }}>{fmtNum(distribucionData.distribucion?.length || 0)}</div>
                    </div>
                  </div>
                </div>

                <div style={{ ...cardStyle(), marginTop: 20, padding: 18 }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a", marginBottom: 10 }}>
                    Distribución dentro del vivero
                  </div>

                  {!distribucionData.distribucion?.length ? (
                    <div style={{ color: "#64748b", fontWeight: 800 }}>No hay inventario disponible para ese producto.</div>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            <th style={thStyle()}>Zona</th>
                            <th style={thStyle()}>Tamaño</th>
                            <th style={thStyle()}>Cantidad</th>
                          </tr>
                        </thead>
                        <tbody>
                          {distribucionData.distribucion.map((row, idx) => (
                            <tr key={idx}>
                              <td style={tdStyle()}>{row.zona || "—"}</td>
                              <td style={tdStyle()}>{row.tamano || "—"}</td>
                              <td style={tdStyle()}>{fmtNum(row.cantidad)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <EmptyState text="Escribe y selecciona un producto para ver su distribución dentro del vivero." />
            )}
          </>
        )}

        {activeReport === "inventario" && (
          <div style={{ marginTop: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
              <div style={{ color: "#64748b", fontWeight: 700 }}>
                Inventario del vivero por zona. Pulsa cada zona para plegar/desplegar.
              </div>
              {inventarioFiltrado.length > 0 && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setZonasInvColapsadas({})}
                    style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "#fff", color: "#475569", fontWeight: 800, cursor: "pointer", fontSize: 13 }}
                  >
                    Expandir todo
                  </button>
                  <button
                    type="button"
                    onClick={() => setZonasInvColapsadas(Object.fromEntries(inventarioFiltrado.map((z) => [z.zona, true])))}
                    style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "#fff", color: "#475569", fontWeight: 800, cursor: "pointer", fontSize: 13 }}
                  >
                    Colapsar todo
                  </button>
                </div>
              )}
            </div>

            {/* Filtros: producto (científico/común), categoría y subcategoría */}
            {inventarioVivero.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1.4fr) minmax(200px, 1fr) minmax(200px, 1fr)", gap: 14, marginBottom: 18, alignItems: "end" }}>
                <div>
                  <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Buscar producto</div>
                  <input
                    value={invSearch}
                    onChange={(e) => setInvSearch(e.target.value)}
                    placeholder="Nombre científico o común"
                    style={softInputStyle()}
                  />
                </div>
                <div>
                  <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Categoría</div>
                  <select
                    value={invCategoria}
                    onChange={(e) => { setInvCategoria(e.target.value); setInvSubcategoria(""); }}
                    style={softInputStyle()}
                  >
                    <option value="">Todas</option>
                    {invCategoriasDisponibles.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Subcategoría</div>
                  <select
                    value={invSubcategoria}
                    onChange={(e) => setInvSubcategoria(e.target.value)}
                    disabled={invSubcategoriasDisponibles.length === 0}
                    style={{ ...softInputStyle(), opacity: invSubcategoriasDisponibles.length === 0 ? 0.55 : 1 }}
                  >
                    <option value="">Todas</option>
                    {invSubcategoriasDisponibles.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            )}

            {inventarioVivero.length === 0 ? (
              <EmptyState text="No hay stock registrado en ninguna zona del vivero." />
            ) : inventarioFiltrado.length === 0 ? (
              <EmptyState text="Ningún producto coincide con los filtros aplicados." />
            ) : (
              <div style={{ display: "grid", gap: 22 }}>
                {inventarioFiltrado.map((zona) => {
                  const colapsada = !!zonasInvColapsadas[zona.zona];
                  return (
                  <div key={zona.zona} style={{ border: "1px solid rgba(15,23,42,0.10)", borderRadius: 14, overflow: "hidden" }}>
                    <div
                      onClick={() => toggleZonaInv(zona.zona)}
                      style={{ padding: "10px 14px", background: "#0f172a", color: "#fff", fontWeight: 900, fontSize: 15, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, cursor: "pointer" }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12 }}>{colapsada ? "▶" : "▼"}</span>
                        📍 {zona.label}
                      </span>
                      <span style={{ opacity: 0.85, fontWeight: 700, fontSize: 13 }}>
                        {zona.productos.length} {zona.productos.length === 1 ? "producto" : "productos"}
                      </span>
                    </div>
                    {!colapsada && (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
                        <thead>
                          <tr style={{ background: "#f8fafc" }}>
                            <th style={{ padding: 10, textAlign: "left", fontWeight: 900, fontSize: 12, color: "#334155", borderBottom: "1px solid rgba(15,23,42,0.08)" }}>Producto</th>
                            {zona.tamanos.map((t) => (
                              <th key={t} style={{ padding: 10, textAlign: "center", fontWeight: 900, fontSize: 12, color: "#334155", borderBottom: "1px solid rgba(15,23,42,0.08)", whiteSpace: "nowrap" }}>{t}</th>
                            ))}
                            <th style={{ padding: 10, textAlign: "center", fontWeight: 900, fontSize: 12, color: "#0f172a", borderBottom: "1px solid rgba(15,23,42,0.08)" }}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {zona.productos.map((p) => (
                            <tr key={p.producto_id} style={{ borderTop: "1px solid rgba(15,23,42,0.06)" }}>
                              <td style={{ padding: 10, textAlign: "left" }}>
                                <div style={{ fontWeight: 800, color: "#0f172a", fontSize: 13, fontStyle: "italic" }}>{p.nombre}</div>
                                {p.nombreComun && (
                                  <div style={{ fontSize: 12, color: "#334155", fontWeight: 700 }}>{p.nombreComun}</div>
                                )}
                                {(p.categoria || p.subcategoria) && (
                                  <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>
                                    {[p.categoria, p.subcategoria].filter(Boolean).join(" · ")}
                                  </div>
                                )}
                              </td>
                              {zona.tamanos.map((t) => (
                                <td key={t} style={{ padding: 10, textAlign: "center", fontWeight: 800, color: p.tamanos[t] ? "#0f172a" : "#cbd5e1" }}>
                                  {p.tamanos[t] ? fmtCantInv(p.tamanos[t]) : "—"}
                                </td>
                              ))}
                              <td style={{ padding: 10, textAlign: "center", fontWeight: 900, color: "#065f46" }}>{fmtCantInv(p.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeReport === "stock" && (
          <>
            <div
              style={{
                marginTop: 22,
                display: "grid",
                gridTemplateColumns: "minmax(260px, 1.2fr) minmax(220px, 1fr) minmax(220px, 1fr) auto auto",
                gap: 18,
                alignItems: "end",
              }}
            >
              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Buscar</div>
                <input
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  placeholder="Producto, categoría o subcategoría"
                  style={softInputStyle()}
                />
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Categoría</div>
                <select
                  value={stockCategoriaFilter}
                  onChange={(e) => {
                    setStockCategoriaFilter(e.target.value);
                    setStockSubcategoriaFilter("");
                  }}
                  style={softInputStyle()}
                >
                  <option value="">Todas</option>
                  {stockCategoriasDisponibles.map((categoria) => (
                    <option key={categoria} value={categoria}>{categoria}</option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Subcategoría</div>
                <select
                  value={stockSubcategoriaFilter}
                  onChange={(e) => setStockSubcategoriaFilter(e.target.value)}
                  style={softInputStyle()}
                >
                  <option value="">Todas</option>
                  {stockSubcategoriasDisponibles.map((subcategoria) => (
                    <option key={subcategoria} value={subcategoria}>{subcategoria}</option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Estado de existencias</div>
                <select
                  value={stockEstadoFilter}
                  onChange={(e) => setStockEstadoFilter(e.target.value)}
                  style={softInputStyle()}
                >
                  {ESTADO_STOCK_OPTIONS.map((o) => (
                    <option key={o.value || "todos"} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button onClick={onBuscarStock} disabled={loading} style={primaryBtnStyle(loading)}>
                  {loading ? "Actualizando..." : "Actualizar"}
                </button>

                <button onClick={onLimpiarFiltrosStock} style={secondaryBtnStyle()}>
                  Limpiar filtros
                </button>
              </div>
            </div>

            <div
              style={{
                marginTop: 20,
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
                gap: 16,
              }}
            >
              <div style={{ ...cardStyle(), padding: 18 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>Categorías visibles</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#0f172a", marginTop: 6 }}>
                  {fmtNum(stockSummary.totalCategorias)}
                </div>
              </div>
              <div style={{ ...cardStyle(), padding: 18 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>Productos visibles</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#0f172a", marginTop: 6 }}>
                  {fmtNum(stockSummary.totalProductos)}
                </div>
              </div>
              <div style={{ ...cardStyle(), padding: 18 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>Stock total visible</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#0f172a", marginTop: 6 }}>
                  {fmtNum(stockSummary.totalStock)}
                </div>
              </div>
              <div style={{ ...cardStyle(), padding: 18 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>Bajo stock</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#b91c1c", marginTop: 6 }}>
                  {fmtNum(stockSummary.totalBajoStock)}
                </div>
              </div>
            </div>

            {stockGroupedByCategory.length === 0 ? (
              <EmptyState text="No hay productos que coincidan con los filtros seleccionados." />
            ) : (
              <div style={{ display: "grid", gap: 18, marginTop: 20 }}>
                {stockGroupedByCategory.map((group) => (
                  <div key={group.categoria} style={{ ...cardStyle(), padding: 18 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 16,
                        flexWrap: "wrap",
                        marginBottom: 14,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 900, color: "#0f172a" }}>{group.categoria}</div>
                        <div style={{ marginTop: 6, color: "#64748b", fontWeight: 700 }}>
                          {fmtNum(group.totalProductos)} productos · Stock total: {fmtNum(group.stockTotal)} · Bajo stock: {fmtNum(group.bajoStock)}
                        </div>
                      </div>
                    </div>

                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            <th style={thStyle()}>Producto</th>
                            <th style={thStyle()}>Subcategoría</th>
                            <th style={thStyle()}>Stock actual</th>
                            <th style={thStyle()}>Stock mínimo</th>
                            <th style={thStyle()}>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map((item) => (
                            <tr key={item.id}>
                              <td style={tdStyle()}>{item.nombreDisplay}</td>
                              <td style={tdStyle()}>{item.subcategoria}</td>
                              <td style={tdStyle()}>{fmtNum(item.stockActual)}</td>
                              <td style={tdStyle()}>{fmtNum(item.stockMinimo)}</td>
                              <td style={tdStyle()}><StockBadge estado={item.estado} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeReport === "caducidad" && (
          <>
            <div
              style={{
                marginTop: 22,
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <button onClick={onBuscarCaducidad} disabled={loading} style={primaryBtnStyle(loading)}>
                {loading ? "Actualizando..." : "Actualizar"}
              </button>
            </div>

            <div
              style={{
                marginTop: 20,
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(200px, 1fr))",
                gap: 16,
              }}
            >
              <div style={{ ...cardStyle(), padding: 18 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>Total registros</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#0f172a", marginTop: 6 }}>
                  {fmtNum(caducidadSummary.totalItems)}
                </div>
              </div>
              <div style={{ ...cardStyle(), padding: 18 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>Caducados</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#b91c1c", marginTop: 6 }}>
                  {fmtNum(caducidadSummary.totalCaducados)}
                </div>
              </div>
              <div style={{ ...cardStyle(), padding: 18 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>Próximos a caducar</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#92400e", marginTop: 6 }}>
                  {fmtNum(caducidadSummary.totalProximos)}
                </div>
              </div>
              <div style={{ ...cardStyle(), padding: 18 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>Vigentes</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#047857", marginTop: 6 }}>
                  {fmtNum(caducidadSummary.totalVigentes)}
                </div>
              </div>
            </div>

            {caducidadItems.length === 0 ? (
              <EmptyState text="No hay productos con fecha de caducidad para mostrar." />
            ) : (
              <div style={{ ...cardStyle(), marginTop: 20, padding: 18 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a", marginBottom: 10 }}>
Productos con fecha de caducidad
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle()}>Producto</th>
                        <th style={thStyle()}>Categoría</th>
                        <th style={thStyle()}>Subcategoría</th>
                        <th style={thStyle()}>Zona</th>
                        <th style={thStyle()}>Tamaño</th>
                        <th style={thStyle()}>Cantidad</th>
                        <th style={thStyle()}>Fecha caducidad</th>
                        <th style={thStyle()}>Días</th>
                        <th style={thStyle()}>Estado</th>
                        <th style={thStyle()}>UUID lote</th>
                      </tr>
                    </thead>
                    <tbody>
                      {caducidadItems.map((item) => (
                        <tr key={item.id}>
                          <td style={tdStyle()}>{item.nombre}</td>
                          <td style={tdStyle()}>{item.categoria}</td>
                          <td style={tdStyle()}>{item.subcategoria}</td>
                          <td style={tdStyle()}>{item.zona}</td>
                          <td style={tdStyle()}>{item.tamano}</td>
                          <td style={tdStyle()}>{fmtNum(item.cantidad)}</td>
                          <td style={tdStyle()}>{fmtFechaSolo(item.fechaCaducidad)}</td>
                          <td style={tdStyle()}>{item.diasRestantes}</td>
                          <td style={tdStyle()}><CaducidadBadge estado={item.estado} /></td>
                          <td style={tdStyle()}>{item.loteUuid}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}


        {activeReport === "prestamos" && (
          <>
            <div
              style={{
                marginTop: 22,
                display: "grid",
                gridTemplateColumns: "minmax(220px, 1fr) minmax(220px, 1fr) minmax(180px, 180px) minmax(180px, 1fr) minmax(180px, 1fr) auto auto",
                gap: 18,
                alignItems: "end",
              }}
            >
              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Producto</div>
                <input
                  value={prestamoProductoFilter}
                  onChange={(e) => setPrestamoProductoFilter(e.target.value)}
                  placeholder="Buscar por producto"
                  style={softInputStyle()}
                />
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Solicitante / destino</div>
                <input
                  value={prestamoSolicitanteFilter}
                  onChange={(e) => setPrestamoSolicitanteFilter(e.target.value)}
                  placeholder="Solicitante o destinatario"
                  style={softInputStyle()}
                />
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Estado</div>
                <select
                  value={prestamoEstadoFilter}
                  onChange={(e) => setPrestamoEstadoFilter(e.target.value)}
                  style={softInputStyle()}
                >
                  <option value="">Todos</option>
                  <option value="Activo">Activo</option>
                  <option value="Devuelto">Devuelto</option>
                </select>
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Fecha desde</div>
                <input
                  type="date"
                  value={prestamoFechaDesde}
                  onChange={(e) => setPrestamoFechaDesde(e.target.value)}
                  style={softInputStyle()}
                />
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Fecha hasta</div>
                <input
                  type="date"
                  value={prestamoFechaHasta}
                  onChange={(e) => setPrestamoFechaHasta(e.target.value)}
                  style={softInputStyle()}
                />
              </div>

              <button onClick={onActualizarPrestamos} disabled={loading} style={primaryBtnStyle(loading)}>
                {loading ? "Actualizando..." : "Actualizar"}
              </button>

              <button onClick={onLimpiarPrestamos} style={secondaryBtnStyle()}>
                Limpiar filtros
              </button>
            </div>

            <div
              style={{
                marginTop: 20,
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(200px, 1fr))",
                gap: 16,
              }}
            >
              <div style={{ ...cardStyle(), padding: 18 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>Préstamos visibles</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#0f172a", marginTop: 6 }}>
                  {fmtNum(prestamosSummary.totalPrestamos)}
                </div>
              </div>
              <div style={{ ...cardStyle(), padding: 18 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>Activos</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#1d4ed8", marginTop: 6 }}>
                  {fmtNum(prestamosSummary.totalActivos)}
                </div>
              </div>
              <div style={{ ...cardStyle(), padding: 18 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>Devueltos</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#047857", marginTop: 6 }}>
                  {fmtNum(prestamosSummary.totalDevueltos)}
                </div>
              </div>
            </div>

            {prestamosItems.length === 0 ? (
              <EmptyState text="No hay préstamos que coincidan con los filtros seleccionados." />
            ) : (
              <div style={{ ...cardStyle(), marginTop: 20, padding: 18 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a", marginBottom: 10 }}>
                  Préstamos
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle()}>Pedido</th>
                        <th style={thStyle()}>Fecha</th>
                        <th style={thStyle()}>Solicitante</th>
                        <th style={thStyle()}>Destino</th>
                        <th style={thStyle()}>Elementos</th>
                        <th style={thStyle()}>Prestado</th>
                        <th style={thStyle()}>Devuelto</th>
                        <th style={thStyle()}>Pendiente</th>
                        <th style={thStyle()}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prestamosItems.map((item) => (
                        <tr key={item.id}>
                          <td style={tdStyle()}>{item.pedidoId ? `#${item.pedidoId}` : <span style={{ color: "#64748b", fontWeight: 700 }}>Sin pedido</span>}</td>
                          <td style={tdStyle()}>{fmtFecha(item.fechaPrestamo)}</td>
                          <td style={tdStyle()}>{item.solicitante}</td>
                          <td style={tdStyle()}>{item.destinatario}</td>
                          <td style={tdStyle()}>
                            <div style={{ display: "grid", gap: 8 }}>
                              {item.lineas.map((linea) => (
                                <div key={linea.key}>
                                  <div style={{ fontWeight: 900, color: "#0f172a" }}>
                                    {linea.producto}
                                  </div>
                                  <div style={{ color: "#64748b", fontWeight: 700, marginTop: 2 }}>
                                    Tamaño: {linea.tamano} · Pedido: {fmtNum(linea.cantidadPedida)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td style={tdStyle()}>{fmtNum(item.totalPrestado)}</td>
                          <td style={tdStyle()}>{fmtNum(item.totalDevuelto)}</td>
                          <td style={tdStyle()}>{fmtNum(item.totalPendiente)}</td>
                          <td style={tdStyle()}><PrestamoBadge estado={item.estado} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {activeReport === "bajas" && (
          <>
            <div
              style={{
                marginTop: 22,
                display: "grid",
                gridTemplateColumns: "minmax(220px, 1.3fr) minmax(200px, 1fr) minmax(200px, 1fr) minmax(160px, 180px) minmax(160px, 180px) auto",
                gap: 18,
                alignItems: "end",
              }}
            >
              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Producto</div>
                <input
                  value={bajaProductoFilter}
                  onChange={(e) => setBajaProductoFilter(e.target.value)}
                  placeholder="Nombre científico o UUID"
                  style={softInputStyle()}
                />
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Categoría</div>
                <select
                  value={bajaCategoriaFilter}
                  onChange={(e) => {
                    setBajaCategoriaFilter(e.target.value);
                    setBajaSubcategoriaFilter("");
                  }}
                  style={softInputStyle()}
                >
                  <option value="">Todas</option>
                  {bajasCategoriasDisponibles.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Subcategoría</div>
                <select
                  value={bajaSubcategoriaFilter}
                  onChange={(e) => setBajaSubcategoriaFilter(e.target.value)}
                  style={softInputStyle()}
                >
                  <option value="">Todas</option>
                  {bajasSubcategoriasDisponibles.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Fecha desde</div>
                <input
                  type="date"
                  value={bajaFechaDesde}
                  onChange={(e) => setBajaFechaDesde(e.target.value)}
                  style={softInputStyle()}
                />
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Fecha hasta</div>
                <input
                  type="date"
                  value={bajaFechaHasta}
                  onChange={(e) => setBajaFechaHasta(e.target.value)}
                  style={softInputStyle()}
                />
              </div>

              <button onClick={onLimpiarBajas} style={secondaryBtnStyle()}>
                Limpiar filtros
              </button>
            </div>

            <div
              style={{
                marginTop: 20,
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(220px, 1fr))",
                gap: 16,
              }}
            >
              <div style={{ ...cardStyle(), padding: 18 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>Bajas visibles</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#b91c1c", marginTop: 6 }}>
                  {fmtNum(bajasSummary.totalMovimientos)}
                </div>
              </div>
              <div style={{ ...cardStyle(), padding: 18 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>Productos distintos</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#0f172a", marginTop: 6 }}>
                  {fmtNum(bajasSummary.productosUnicos)}
                </div>
              </div>
              <div style={{ ...cardStyle(), padding: 18 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>Unidades totales dadas de baja</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#b91c1c", marginTop: 6 }}>
                  {fmtNum(bajasSummary.totalUnidades)}
                </div>
              </div>
            </div>

            {bajasItems.length === 0 ? (
              <EmptyState text="No hay bajas registradas con los filtros seleccionados." />
            ) : (
              <div style={{ ...cardStyle(), marginTop: 20, padding: 18 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a", marginBottom: 10 }}>
                  Productos dados de baja
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle()}>Fecha</th>
                        <th style={thStyle()}>Producto</th>
                        <th style={thStyle()}>Categoría</th>
                        <th style={thStyle()}>Subcategoría</th>
                        <th style={thStyle()}>Zona origen</th>
                        <th style={thStyle()}>Tamaño</th>
                        <th style={thStyle()}>Unidades</th>
                        <th style={thStyle()}>UUID lote</th>
                        <th style={thStyle()}>Registrado por</th>
                        <th style={thStyle()}>Observaciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bajasItems.map((item) => (
                        <tr key={item.id}>
                          <td style={tdStyle()}>{fmtFecha(item.fecha)}</td>
                          <td style={tdStyle()}>{item.producto}</td>
                          <td style={tdStyle()}>{item.categoria}</td>
                          <td style={tdStyle()}>{item.subcategoria}</td>
                          <td style={tdStyle()}>{item.zonaOrigen}</td>
                          <td style={tdStyle()}>{item.tamano}</td>
                          <td style={tdStyle()}>
                            <span style={{ fontWeight: 900, color: "#b91c1c" }}>{fmtNum(item.cantidad)}</span>
                          </td>
                          <td style={{ ...tdStyle(), fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 12 }}>
                            {item.uuidLote}
                          </td>
                          <td style={tdStyle()}>{item.createdBy}</td>
                          <td style={tdStyle()}>{item.observaciones || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {activeReport === "abastecimiento" && (
          <>
            <div
              style={{
                marginTop: 22,
                display: "grid",
                gridTemplateColumns: "minmax(200px, 1fr) minmax(200px, 1fr) minmax(160px, 180px) minmax(160px, 1fr) minmax(160px, 1fr) auto",
                gap: 18,
                alignItems: "end",
              }}
            >
              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Producto</div>
                <input
                  value={abastProductoFilter}
                  onChange={(e) => setAbastProductoFilter(e.target.value)}
                  placeholder="Buscar por producto"
                  style={softInputStyle()}
                />
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Solicitante</div>
                <input
                  value={abastSolicitanteFilter}
                  onChange={(e) => setAbastSolicitanteFilter(e.target.value)}
                  placeholder="Solicitante"
                  style={softInputStyle()}
                />
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Estado</div>
                <select
                  value={abastEstadoFilter}
                  onChange={(e) => setAbastEstadoFilter(e.target.value)}
                  style={softInputStyle()}
                >
                  <option value="">Todos</option>
                  <option value="RESERVA">Reserva</option>
                  <option value="APROBADO_PARCIAL">Aprobado parcial</option>
                  <option value="APROBADO">Aprobado</option>
                  <option value="SERVIDO">Servido</option>
                  <option value="DENEGADO">Denegado</option>
                  <option value="CANCELADO">Cancelado</option>
                </select>
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Fecha desde</div>
                <input type="date" value={abastFechaDesde} onChange={(e) => setAbastFechaDesde(e.target.value)} style={softInputStyle()} />
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Fecha hasta</div>
                <input type="date" value={abastFechaHasta} onChange={(e) => setAbastFechaHasta(e.target.value)} style={softInputStyle()} />
              </div>

              <button onClick={onLimpiarAbastecimiento} style={secondaryBtnStyle()}>
                Limpiar filtros
              </button>
            </div>

            <div
              style={{
                marginTop: 20,
                display: "grid",
                gridTemplateColumns: "repeat(6, minmax(150px, 1fr))",
                gap: 16,
              }}
            >
              <div style={{ ...cardStyle(), padding: 16 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>Pedidos visibles</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: "#0f172a", marginTop: 6 }}>{fmtNum(abastecimientoSummary.total)}</div>
              </div>
              <div style={{ ...cardStyle(), padding: 16 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>Reserva</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: "#92400e", marginTop: 6 }}>{fmtNum(abastecimientoSummary.reserva)}</div>
              </div>
              <div style={{ ...cardStyle(), padding: 16 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>Aprobados</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: "#065f46", marginTop: 6 }}>{fmtNum(abastecimientoSummary.aprobados)}</div>
              </div>
              <div style={{ ...cardStyle(), padding: 16 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>Servidos</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: "#1e3a8a", marginTop: 6 }}>{fmtNum(abastecimientoSummary.servidos)}</div>
              </div>
              <div style={{ ...cardStyle(), padding: 16 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>Total pedido</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: "#0f172a", marginTop: 6 }}>{fmtNum(abastecimientoSummary.totalPedido)}</div>
              </div>
              <div style={{ ...cardStyle(), padding: 16 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900 }}>Pendiente</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: "#b91c1c", marginTop: 6 }}>{fmtNum(abastecimientoSummary.totalPendiente)}</div>
              </div>
            </div>

            {abastecimientoItems.length === 0 ? (
              <EmptyState text="No hay pedidos de abastecimiento que coincidan con los filtros." />
            ) : (
              <div style={{ ...cardStyle(), marginTop: 20, padding: 18 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a", marginBottom: 10 }}>
                  Pedidos de abastecimiento
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle()}>Pedido</th>
                        <th style={thStyle()}>Fecha</th>
                        <th style={thStyle()}>Solicitante</th>
                        <th style={thStyle()}>Estado</th>
                        <th style={thStyle()}>Líneas</th>
                        <th style={thStyle()}>Pedido</th>
                        <th style={thStyle()}>Servido</th>
                        <th style={thStyle()}>Pendiente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {abastecimientoItems.map((item) => (
                        <tr key={item.id}>
                          <td style={tdStyle()}>#{item.id}</td>
                          <td style={tdStyle()}>{fmtFecha(item.fecha)}</td>
                          <td style={tdStyle()}>{item.solicitante}</td>
                          <td style={tdStyle()}><AbastecimientoBadge estado={item.estado} /></td>
                          <td style={tdStyle()}>
                            <div style={{ display: "grid", gap: 6 }}>
                              {item.lineas.map((l) => (
                                <div key={l.key}>
                                  <div style={{ fontWeight: 900, color: "#0f172a" }}>{l.producto}</div>
                                  <div style={{ color: "#64748b", fontWeight: 700, marginTop: 2, fontSize: 12 }}>
                                    Tamaño: {l.tamano} · Pedido: {fmtNum(l.cantidadPedida)} · Servido: {fmtNum(l.cantidadServida)} · Pendiente: {fmtNum(l.pendiente)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td style={tdStyle()}>{fmtNum(item.totalPedido)}</td>
                          <td style={tdStyle()}>{fmtNum(item.totalServido)}</td>
                          <td style={tdStyle()}>{fmtNum(item.totalPendiente)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {activeReport === "externos" && (
          <>
            <div
              style={{
                marginTop: 22,
                display: "grid",
                gridTemplateColumns: "repeat(6, minmax(170px, 1fr))",
                gap: 22,
                rowGap: 20,
                alignItems: "end",
              }}
            >
              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Fecha desde</div>
                <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} style={softInputStyle()} />
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Fecha hasta</div>
                <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} style={softInputStyle()} />
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Distrito</div>
                <select
                  value={distrito}
                  onChange={(e) => {
                    setDistrito(e.target.value);
                    setBarrio("");
                  }}
                  style={softInputStyle()}
                >
                  <option value="">Todos</option>
                  {DISTRICTS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Barrio</div>
                <select
                  value={barrio}
                  onChange={(e) => setBarrio(e.target.value)}
                  style={softInputStyle()}
                  disabled={!distrito}
                >
                  <option value="">{distrito ? "Todos" : "Selecciona distrito"}</option>
                  {barriosDisponibles.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Dirección</div>
                <input
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  placeholder="Déjalo en blanco o escribe dirección"
                  style={softInputStyle()}
                />
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Categoría</div>
                <select
                  value={externosCategoria}
                  onChange={(e) => { setExternosCategoria(e.target.value); setExternosSubcategoria(""); }}
                  style={softInputStyle()}
                >
                  <option value="">Todas</option>
                  {externosCategorias.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Subcategoría</div>
                <select
                  value={externosSubcategoria}
                  onChange={(e) => setExternosSubcategoria(e.target.value)}
                  style={softInputStyle()}
                  disabled={!externosCategoria || externosSubcategorias.length === 0}
                >
                  <option value="">{externosCategoria ? "Todas" : "Elige categoría"}</option>
                  {externosSubcategorias.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <button onClick={onBuscarExternos} disabled={loading} style={primaryBtnStyle(loading)}>
                  {loading ? "Generando..." : "Buscar"}
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <button onClick={onNuevaBusquedaExternos} style={secondaryBtnStyle()}>
                  Nueva búsqueda
                </button>
              </div>
            </div>

            {externosSearched && externosData.length === 0 ? (
              <EmptyState text="No se encontraron coincidencias." />
            ) : !externosSearched ? (
              <EmptyState text="Define los filtros y genera el informe de movimientos externos." />
            ) : (
              <div style={{ ...cardStyle(), marginTop: 20, padding: 18 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 10 }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a" }}>
                    Movimientos externos
                    <span style={{ marginLeft: 12, fontSize: 14, fontWeight: 800, color: "#0f6e56" }}>
                      Total elementos: {fmtNum(externosTotal)} · {externosData.length} {externosData.length === 1 ? "movimiento" : "movimientos"}
                    </span>
                  </div>
                  <button onClick={exportarExternosExcel} style={secondaryBtnStyle()}>
                    ⬇ Exportar a Excel
                  </button>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle()}>Fecha</th>
                        <th style={thStyle()}>Producto</th>
                        <th style={thStyle()}>Categoría</th>
                        <th style={thStyle()}>Subcategoría</th>
                        <th style={thStyle()}>Cantidad</th>
                        <th style={thStyle()}>Origen</th>
                        <th style={thStyle()}>Destino</th>
                        <th style={thStyle()}>Ubicación destino</th>
                        <th style={thStyle()}>Registrado por</th>
                      </tr>
                    </thead>
                    <tbody>
                      {externosData.map((row, idx) => (
                        <tr key={idx}>
                          <td style={tdStyle()}>{fmtFecha(row.fecha_movimiento)}</td>
                          <td style={tdStyle()}>{row.producto_nombre}</td>
                          <td style={tdStyle()}>{row.producto_categoria || "—"}</td>
                          <td style={tdStyle()}>{row.producto_subcategoria || "—"}</td>
                          <td style={tdStyle()}>{fmtNum(row.cantidad)}</td>
                          <td style={tdStyle()}>
                            {row.origen_tipo || "—"} {row.zona_origen ? `· ${row.zona_origen}` : ""} {row.tamano_origen ? `· ${row.tamano_origen}` : ""}
                          </td>
                          <td style={tdStyle()}>
                            {row.destino_tipo || "—"} {row.zona_destino ? `· ${row.zona_destino}` : ""} {row.tamano_destino ? `· ${row.tamano_destino}` : ""}
                          </td>
                          <td style={tdStyle()}>
                            {[row.distrito_destino, row.barrio_destino, row.direccion_destino].filter(Boolean).join(" · ") || "—"}
                          </td>
                          <td style={tdStyle()}>{row.created_by || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {activeReport === "estadisticas" && (
          <>
            {/* Simular resultados */}
            <label style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 12, cursor: "pointer", background: estadSimular ? "rgba(139,92,246,0.10)" : "rgba(148,163,184,0.08)", border: estadSimular ? "1px solid rgba(139,92,246,0.35)" : "1px solid rgba(15,23,42,0.10)" }}>
              <input type="checkbox" checked={estadSimular} onChange={(e) => setEstadSimular(e.target.checked)} style={{ width: 18, height: 18 }} />
              <div>
                <div style={{ fontWeight: 900, color: "#0f172a" }}>Simular resultados</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "#64748b" }}>
                  Genera datos de ejemplo (precios y reposiciones de los últimos 3 meses) solo para previsualizar el informe. No se guarda nada en la base de datos.
                </div>
              </div>
            </label>
            {estadSimular && (
              <div style={{ marginTop: 12, padding: "8px 14px", borderRadius: 10, background: "rgba(139,92,246,0.10)", border: "1px solid rgba(139,92,246,0.30)", color: "#5b21b6", fontWeight: 800, fontSize: 13 }}>
                🧪 Mostrando datos SIMULADOS (no reales).
              </div>
            )}

            {/* Filtros */}
            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, alignItems: "end" }}>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Desde</div>
                <input type="date" value={estadDesde} onChange={(e) => setEstadDesde(e.target.value)} style={softInputStyle()} />
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Hasta</div>
                <input type="date" value={estadHasta} onChange={(e) => setEstadHasta(e.target.value)} style={softInputStyle()} />
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Producto</div>
                <input value={estadProducto} onChange={(e) => setEstadProducto(e.target.value)} placeholder="Científico o común" style={softInputStyle()} />
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Categoría</div>
                <select value={estadCategoria} onChange={(e) => setEstadCategoria(e.target.value)} style={softInputStyle()}>
                  <option value="">Todas</option>
                  {estadCategorias.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 900, color: "#0f172a" }}>Subcategoría</div>
                <select value={estadSubcategoria} onChange={(e) => setEstadSubcategoria(e.target.value)} disabled={!estadCategoria} style={{ ...softInputStyle(), opacity: estadCategoria ? 1 : 0.55 }}>
                  <option value="">Todas</option>
                  {estadSubcategorias.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Resumen (el export a PDF/Excel está en el botón «Exportar ▾» de arriba) */}
            <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
              {[
                { l: "Coste total reposición", v: fmtEuro(estadTotalCoste), c: "#0e7490" },
                { l: "Unidades recibidas", v: fmtNum(estadTotalUds), c: "#065f46" },
                { l: "Movimientos", v: fmtNum(estadFiltrado.length), c: "#334155" },
              ].map((s) => (
                <div key={s.l} style={{ ...cardStyle(), padding: "12px 16px", minWidth: 160 }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: "#64748b", textTransform: "uppercase" }}>{s.l}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: s.c, marginTop: 2 }}>{s.v}</div>
                </div>
              ))}
            </div>

            {estadSinPrecio && (
              <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.28)", color: "#92400e", fontWeight: 700, fontSize: 13 }}>
                ⚠️ Algunos productos no tienen precio unitario definido; su coste no se contabiliza. Añade el precio en «Gestionar productos».
              </div>
            )}

            {/* Gráficas */}
            <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 18 }}>
              <div style={{ ...cardStyle(), padding: 18 }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: "#0f172a", marginBottom: 10 }}>Coste mensual de reposición</div>
                <BarrasVerticales data={estadCostesMensuales} color="#0ea5e9" valueFmt={(v) => fmtEuro(v)} />
              </div>
              <div style={{ ...cardStyle(), padding: 18 }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: "#0f172a", marginBottom: 10 }}>Productos más solicitados (uds)</div>
                <BarrasHorizontales data={estadTopProductos} color="#10b981" valueFmt={(v) => fmtNum(v)} />
              </div>
            </div>

            {/* Tabla */}
            {estadFiltrado.length === 0 ? (
              <EmptyState text="No hay entradas de reposición en el rango de fechas / filtros seleccionados." />
            ) : (
              <div style={{ ...cardStyle(), marginTop: 18, padding: 0, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle()}>Fecha</th>
                        <th style={thStyle()}>Producto</th>
                        <th style={thStyle()}>Categoría</th>
                        <th style={thStyle()}>Subcategoría</th>
                        <th style={thStyle()}>Tamaño</th>
                        <th style={{ ...thStyle(), textAlign: "right" }}>Cantidad</th>
                        <th style={{ ...thStyle(), textAlign: "right" }}>Precio unit.</th>
                        <th style={{ ...thStyle(), textAlign: "right" }}>Coste</th>
                      </tr>
                    </thead>
                    <tbody>
                      {estadFiltrado.map((r) => (
                        <tr key={r.id}>
                          <td style={tdStyle()}>{r.fecha ? formatFechaCanaria(r.fecha) : "—"}</td>
                          <td style={tdStyle()}>{r.nombreDisplay}</td>
                          <td style={tdStyle()}>{r.categoria || "—"}</td>
                          <td style={tdStyle()}>{r.subcategoria || "—"}</td>
                          <td style={tdStyle()}>{r.tamano}</td>
                          <td style={{ ...tdStyle(), textAlign: "right", fontWeight: 800 }}>{fmtNum(r.cantidad)}</td>
                          <td style={{ ...tdStyle(), textAlign: "right" }}>{r.precio == null ? "—" : fmtEuro(r.precio)}</td>
                          <td style={{ ...tdStyle(), textAlign: "right", fontWeight: 800 }}>{r.coste == null ? "—" : fmtEuro(r.coste)}</td>
                        </tr>
                      ))}
                      <tr style={{ background: "rgba(6,182,212,0.06)" }}>
                        <td style={{ ...tdStyle(), fontWeight: 900 }} colSpan={5}>TOTAL</td>
                        <td style={{ ...tdStyle(), textAlign: "right", fontWeight: 900 }}>{fmtNum(estadTotalUds)}</td>
                        <td style={tdStyle()}></td>
                        <td style={{ ...tdStyle(), textAlign: "right", fontWeight: 900, color: "#0e7490" }}>{fmtEuro(estadTotalCoste)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
