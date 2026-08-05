import React, { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import logoViverApp from "../assets/logo.png";
import { formatUsername } from "../utils/format";
import { formatFechaCanaria } from "../utils/fecha";
import { getProductFormatoConfig, getFormatoOptions } from "../utils/formato";
import { formatCantidad } from "../utils/numero";
import {
  getPedidos,
  getProductos,
  getMovimientos,
  createPedido,
  updatePedido,
  cancelarPedido,
  descargarPedidoPdf,
} from "../api/api";

const TAMANOS = ["Semillero", "M12", "M20", "M35"];

const ESTADO_FILTERS = [
  { value: "TODOS", label: "Todos" },
  { value: "RESERVA", label: "Reserva" },
  { value: "APROBADO_PARCIAL", label: "Aprobado parcial" },
  { value: "APROBADO", label: "Aprobado" },
  { value: "SERVIDO", label: "Servido" },
  { value: "DENEGADO", label: "Denegado" },
  { value: "CANCELADO", label: "Cancelado" },
  { value: "CADUCADO", label: "Caducado" },
];

// Human-readable label for the estado.  APROBADO_PARCIAL is otherwise
// rendered as a single ugly token in the UI.
const estadoLabel = (estado) => {
  const e = String(estado || "").trim().toUpperCase();
  if (e === "APROBADO_PARCIAL") return "APROBADO PARCIAL";
  return e || "—";
};

const DISTRITO_BARRIOS = {
  Anaga: [
    "Almáciga",
    "Afur",
    "Casas de La Cumbre",
    "Chamorga",
    "Cueva Bermeja",
    "El Bailadero",
    "El Suculum",
    "Igueste San Andrés",
    "La Alegría",
    "Lomo de las Bodegas-La Cumbrilla",
    "Los Campitos",
    "María Jiménez",
    "Roque Negro",
    "San Andrés",
    "Taborno",
    "Taganana",
    "Valle Tahodio",
    "Valleseco",
    "Benijo",
    "El Draguillo",
    "Catalanes",
  ],
  "Centro-Ifara": [
    "Barrio Nuevo",
    "Duggi",
    "Ifara",
    "Las Acacias",
    "Las Mimosas",
    "Los Hoteles",
    "Los Lavaderos",
    "Salamanca",
    "Toscal",
    "Urbanización Anaga",
    "Uruguay",
    "Zona Centro",
    "Zona Rambla",
  ],
  "Salud-La Salle": [
    "Buenavista",
    "Chapatal",
    "Cruz del Señor",
    "Cuatro Torres",
    "Cuesta de Piedra",
    "El Cabo",
    "El Perú",
    "La Salle",
    "La Salud",
    "La Victoria",
    "Los Gladiolos",
    "Los Llanos",
    "San Sebastián",
    "Villa Ascensión",
  ],
  "Ofra-Costa Sur": [
    "Chimisay",
    "Ballester",
    "Buenos Aires",
    "Camino del Hierro",
    "César Casariego",
    "Chamberí",
    "Finca La Multa",
    "García Escámez",
    "Juan XXIII",
    "Las Cabritas",
    "Las Delicias",
    "Las Retamas",
    "Mayorazgo",
    "Miramar",
    "Moraditas",
    "Nuevo Obrero",
    "San Antonio",
    "San Pío X",
    "Santa Clara",
    "Somosierra",
    "Tío Pino",
    "Tristán",
    "Villa Benítez",
    "Vistabella",
  ],
  Suroeste: [
    "Acorán",
    "Alisios",
    "Añaza",
    "Barranco Grande",
    "El Chorrillo",
    "El Sobradillo",
    "El Tablero",
    "La Gallega",
    "Llano del Moro",
    "Santa María del Mar",
    "Tíncer",
  ],
};

const DISTRITOS = Object.keys(DISTRITO_BARRIOS);

const safeArray = (x) => (Array.isArray(x) ? x : []);

const fmtFechaES = (value) => formatFechaCanaria(value);

const dateInputValue = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const estadoNormalizado = (estado) => String(estado || "").trim().toUpperCase();

// Devuelve la fecha de caducidad del pedido.
// 1) Si el pedido tiene fecha_caducidad a nivel pedido (ej. empresa_externa = 15 días), usa esa.
// 2) Si no, calcula la más próxima entre los movimientos_servicio de sus items.
const getPedidoFechaCaducidad = (pedido) => {
  let fecha = null;
  if (pedido?.fecha_caducidad) {
    const d = new Date(pedido.fecha_caducidad);
    if (!Number.isNaN(d.getTime())) fecha = d;
  }
  if (!fecha) {
    const items = Array.isArray(pedido?.items) ? pedido.items : [];
    let min = null;
    for (const it of items) {
      const movs = Array.isArray(it?.movimientos_servicio) ? it.movimientos_servicio : [];
      for (const m of movs) {
        if (!m?.fecha_caducidad) continue;
        const d = new Date(m.fecha_caducidad);
        if (Number.isNaN(d.getTime())) continue;
        if (!min || d < min) min = d;
      }
    }
    fecha = min;
  }
  // La caducidad de un pedido es, como máximo, 15 días desde su creación
  // (cubre también pedidos antiguos cuya fecha venía de la planta).
  if (pedido?.created_at) {
    const creado = new Date(pedido.created_at);
    if (!Number.isNaN(creado.getTime())) {
      const tope = new Date(creado.getTime() + 15 * 24 * 60 * 60 * 1000);
      if (!fecha || fecha > tope) fecha = tope;
    }
  }
  return fecha;
};

function lineKey(productoId, tamano) {
  return `${productoId}__${tamano}`;
}

function parseLineKey(key) {
  const [producto_id, tamano] = String(key).split("__");
  return { producto_id: Number(producto_id), tamano: tamano || "M12" };
}

function clampNumber(v, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function cardStyle() {
  return {
    background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%)",
    border: "1px solid rgba(148,163,184,0.16)",
    borderRadius: 22,
    boxShadow: "0 18px 50px rgba(15,23,42,0.08)",
  };
}

function softInputStyle() {
  return {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid rgba(148,163,184,0.22)",
    background: "rgba(255,255,255,0.94)",
    color: "#0f172a",
    fontWeight: 700,
    outline: "none",
    boxSizing: "border-box",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
  };
}

function thStyle() {
  return {
    textAlign: "left",
    // Tightened horizontal padding (was 12) so columns don't waste space
    // on either side — relevant for the Destino → Producto transition.
    padding: "14px 8px",
    color: "#475569",
    fontWeight: 900,
    fontSize: 13,
    letterSpacing: 0.2,
    borderBottom: "1px solid rgba(15,23,42,0.08)",
    whiteSpace: "nowrap",
  };
}

function tdStyle() {
  return {
    padding: "14px 8px",
    verticalAlign: "top",
    color: "#0f172a",
    fontWeight: 700,
  };
}

function actionBtn(enabled) {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(148,163,184,0.22)",
    background: enabled ? "white" : "rgba(148,163,184,0.14)",
    color: enabled ? "#0f172a" : "#94a3b8",
    fontWeight: 900,
    cursor: enabled ? "pointer" : "not-allowed",
    boxShadow: enabled ? "0 10px 24px rgba(15,23,42,0.05)" : "none",
  };
}

function dangerBtn(enabled) {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(239,68,68,0.18)",
    background: enabled ? "rgba(239,68,68,0.08)" : "rgba(148,163,184,0.14)",
    color: enabled ? "#991b1b" : "#94a3b8",
    fontWeight: 900,
    cursor: enabled ? "pointer" : "not-allowed",
  };
}

function primaryBtn(disabled) {
  return {
    padding: "12px 16px",
    borderRadius: 14,
    border: "1px solid rgba(6,182,212,0.25)",
    background: disabled
      ? "linear-gradient(90deg, rgba(148,163,184,0.45), rgba(148,163,184,0.35))"
      : "linear-gradient(135deg, #0ea5e9 0%, #06b6d4 40%, #10b981 100%)",
    color: "white",
    fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer",
    boxShadow: disabled ? "none" : "0 16px 36px rgba(6,182,212,0.24)",
  };
}

function badge(estado) {
  const e = estadoNormalizado(estado);
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "7px 12px",
    borderRadius: 999,
    fontWeight: 900,
    fontSize: 12,
    border: "1px solid rgba(15,23,42,0.08)",
    minWidth: 108,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
  };

  if (e === "APROBADO") return { ...base, background: "rgba(16,185,129,0.12)", color: "#065f46" };
  if (e === "APROBADO_PARCIAL") return { ...base, background: "rgba(20,184,166,0.14)", color: "#115e59", borderColor: "rgba(20,184,166,0.28)" };
  if (e === "DENEGADO") return { ...base, background: "rgba(239,68,68,0.10)", color: "#991b1b" };
  if (e === "SERVIDO") return { ...base, background: "rgba(59,130,246,0.10)", color: "#1e3a8a" };
  if (e === "CANCELADO") return { ...base, background: "rgba(148,163,184,0.18)", color: "#334155" };
  if (e === "CADUCADO") return { ...base, background: "rgba(100,116,139,0.16)", color: "#475569" };
  return { ...base, background: "rgba(245,158,11,0.12)", color: "#92400e" };
}

async function loadImageAsDataUrl(src) {
  try {
    const res = await fetch(src);
    if (!res.ok) throw new Error("No se pudo cargar la imagen");
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function sanitizeFileName(name) {
  return String(name || "pedido")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

const _fmtFechaPdf = (v) => formatFechaCanaria(v);

// Renderiza UN pedido en el jsPDF actual. Si es el primero, no añade página previa.
async function renderPedidoEnPdf(doc, pedido, mapProdName, isFirst, logoDataUrl) {
  if (!isFirst) doc.addPage();
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
  doc.text("Comprobante de pedido", 14, 23);

  if (logoDataUrl) {
    try { doc.addImage(logoDataUrl, "PNG", pageWidth - 42, 1, 32, 32); } catch {}
  }

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(`Pedido #${pedido.id}`, 14, 44);

  doc.setDrawColor(226, 232, 240);
  doc.line(14, 48, pageWidth - 14, 48);

  const estado = String(pedido.estado || "—").toUpperCase();
  const tipo = pedido.tipo === "reposicion" ? "Reposición" : "Salida";
  const solicitante = formatUsername(
    pedido.solicitante_username || pedido.solicitante || pedido.created_by || ""
  ) || "—";
  const destino =
    pedido.tipo === "reposicion"
      ? "Vivero"
      : [pedido.distrito_destino, pedido.barrio_destino, pedido.direccion_destino]
          .filter(Boolean)
          .join(" · ") || "—";

  // Información compacta en 4 columnas (dos pares campo/valor por fila) para
  // ahorrar espacio vertical frente a la lista larga anterior.
  autoTable(doc, {
    startY: 55,
    theme: "grid",
    body: [
      ["Tipo", tipo, "Estado", estado],
      ["Solicitante", solicitante, "Caduca el", _fmtFechaPdf(pedido.fecha_caducidad)],
      ["Aprobado por", formatUsername(pedido.aprobado_por) || "—", "Aprobado el", _fmtFechaPdf(pedido.aprobado_at)],
      ["Servido por", formatUsername(pedido.served_by) || "—", "Servido el", _fmtFechaPdf(pedido.served_at)],
    ],
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 30, fontStyle: "bold", fillColor: [241, 245, 249] },
      2: { cellWidth: 30, fontStyle: "bold", fillColor: [241, 245, 249] },
    },
    margin: { left: 14, right: 14 },
  });

  // Cronología en una sola línea (creado > aprobado > servido).
  const crono = [];
  if (pedido.created_at) crono.push(`Creado: ${_fmtFechaPdf(pedido.created_at)}`);
  if (pedido.aprobado_at) crono.push(`Aprobado: ${_fmtFechaPdf(pedido.aprobado_at)}`);
  if (pedido.served_at) crono.push(`Servido: ${_fmtFechaPdf(pedido.served_at)}`);
  if (crono.length) {
    const yC = doc.lastAutoTable.finalY + 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30, 58, 138);
    doc.text(crono.join("     >     "), 14, yC);
  }
  if (pedido.nota) {
    const yN = doc.lastAutoTable.finalY + (crono.length ? 11 : 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(`Nota: ${pedido.nota}`, 14, yN);
  }

  // Productos AGRUPADOS por destino, con un color intenso distinto por destino.
  const items = Array.isArray(pedido.items) ? pedido.items : [];
  const PDF_DESTINO_COLORS = [
    [30, 58, 138], [6, 95, 70], [154, 52, 18], [107, 33, 168], [21, 94, 117],
    [159, 18, 57], [63, 98, 18], [133, 77, 14], [91, 33, 182], [15, 118, 110],
  ];
  const gruposPdf = (() => {
    if (pedido.tipo === "reposicion") return [{ destino: "Vivero", items }];
    const order = [];
    const map = new Map();
    for (const it of items) {
      const dst = [it.distrito_destino, it.barrio_destino, it.direccion_destino].filter(Boolean).join(" · ") || destino;
      if (!map.has(dst)) { map.set(dst, []); order.push(dst); }
      map.get(dst).push(it);
    }
    return order.map((dst) => ({ destino: dst, items: map.get(dst) }));
  })();

  const estadoItemPdf = (it) => {
    const e = String(it.estado_item || "").toUpperCase();
    if (e === "APROBADO") return "Aprobado";
    if (e === "DENEGADO") return "Denegado";
    if (e === "SERVIDO") return "Servido";
    return "Pendiente";
  };

  let yPos = doc.lastAutoTable.finalY + (pedido.nota ? 14 : 10);
  gruposPdf.forEach((g, gi) => {
    const col = PDF_DESTINO_COLORS[gi % PDF_DESTINO_COLORS.length];
    autoTable(doc, {
      startY: yPos,
      theme: "plain",
      body: [[`Destino: ${g.destino}`]],
      styles: { fontSize: 10, fontStyle: "bold", textColor: [255, 255, 255], fillColor: col, cellPadding: 2.5 },
      margin: { left: 14, right: 14 },
    });
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY,
      theme: "grid",
      head: [["Producto", "Tamaño", "Cant.", "Servido", "Pend.", "Estado"]],
      body: g.items.map((it) => {
        const nombre =
          it.producto_nombre_cientifico ||
          it.producto_nombre ||
          it.producto_nombre_natural ||
          (mapProdName && mapProdName.get(it.producto_id)) ||
          `Producto #${it.producto_id}`;
        const cantidad = Number(it.cantidad || 0);
        const servida = Number(it.cantidad_servida || 0);
        const pendiente = Math.max(cantidad - servida, 0);
        return [nombre, it.tamano || "—", String(cantidad), String(servida), String(pendiente), estadoItemPdf(it)];
      }),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: col },
      margin: { left: 14, right: 14 },
    });
    yPos = doc.lastAutoTable.finalY + 5;
  });
}

function addFootersToAllPages(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    const h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(226, 232, 240);
    doc.line(14, h - 12, pageWidth - 14, h - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generado: ${new Date().toLocaleString("es-ES")}`, 14, h - 7);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - 14, h - 7, { align: "right" });
  }
}

// Construye el documento PDF con uno o varios pedidos (uno por página).
async function buildPedidosPdf(pedidos, mapProdName) {
  const doc = new jsPDF("p", "mm", "a4");
  const logoDataUrl = await loadImageAsDataUrl(logoViverApp);
  for (let i = 0; i < pedidos.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await renderPedidoEnPdf(doc, pedidos[i], mapProdName, i === 0, logoDataUrl);
  }
  addFootersToAllPages(doc);
  return doc;
}

// Guarda los pedidos como PDF (descarga directa).
async function guardarPedidosPdf(pedidos, mapProdName) {
  if (!pedidos.length) return;
  const doc = await buildPedidosPdf(pedidos, mapProdName);
  const fileName =
    pedidos.length === 1
      ? `${sanitizeFileName(`pedido_${pedidos[0].id}`)}_${new Date().toISOString().slice(0, 10)}.pdf`
      : `pedidos_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}

// Abre el diálogo nativo de impresión (impresora física o "Guardar como PDF").
async function imprimirPedidosEnNavegador(pedidos, mapProdName) {
  if (!pedidos.length) return;
  const doc = await buildPedidosPdf(pedidos, mapProdName);
  const blobUrl = doc.output("bloburl");

  // Usa un iframe oculto para abrir el print dialog sin salir de la página
  let iframe = document.getElementById("__printFramePedidos");
  if (iframe) iframe.remove();
  iframe = document.createElement("iframe");
  iframe.id = "__printFramePedidos";
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.src = blobUrl;
  document.body.appendChild(iframe);

  iframe.onload = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch {
      // Fallback: abrir en nueva pestaña
      window.open(blobUrl, "_blank");
    }
  };
}

function buildStockByProductSize(movimientos) {
  const map = new Map();

  const add = (productoId, tamano, delta) => {
    if (!productoId || !tamano) return;
    const key = lineKey(productoId, tamano);
    map.set(key, (map.get(key) || 0) + delta);
  };

  for (const m of safeArray(movimientos)) {
    const productoId = m?.producto_id;
    const origenTipo = String(m?.origen_tipo || "").trim().toLowerCase();
    const destinoTipo = String(m?.destino_tipo || "").trim().toLowerCase();
    const cantidad = Number(m?.cantidad || 0);

    if (!productoId || !cantidad) continue;

    if (destinoTipo === "vivero" && m?.tamano_destino) {
      add(productoId, m.tamano_destino, cantidad);
    }

    if (origenTipo === "vivero" && m?.tamano_origen) {
      add(productoId, m.tamano_origen, -cantidad);
    }
  }

  return map;
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

function DestinoResumen({ distrito, barrio, direccion }) {
  const parts = [distrito, barrio, direccion].filter(Boolean);
  if (!parts.length) return "—";
  return parts.join(" · ");
}

function getProductDisplayName(p) {
  return p?.nombre_cientifico || p?.producto_nombre_cientifico || p?.nombre || p?.nombre_natural || `Producto #${p?.id}`;
}

function getScientificProductDisplayName(p) {
  return (
    p?.nombre_cientifico ||
    p?.producto_nombre_cientifico ||
    p?.nombre_cientifico_producto ||
    p?.nombre ||
    p?.producto_nombre ||
    p?.nombre_natural ||
    p?.producto_nombre_natural ||
    `Producto #${p?.id || p?.producto_id || "—"}`
  );
}

function ModalStat({ label, value, tone = "default" }) {
  const tones = {
    default: {
      background: "rgba(255,255,255,0.76)",
      color: "#0f172a",
      border: "1px solid rgba(148,163,184,0.15)",
    },
    success: {
      background: "rgba(16,185,129,0.10)",
      color: "#065f46",
      border: "1px solid rgba(16,185,129,0.15)",
    },
    warn: {
      background: "rgba(245,158,11,0.10)",
      color: "#92400e",
      border: "1px solid rgba(245,158,11,0.15)",
    },
  };

  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 16,
        ...tones[tone],
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 900, color: "#64748b", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ marginTop: 4, fontSize: 22, fontWeight: 900, color: tones[tone].color }}>{value}</div>
    </div>
  );
}

/* ===========================
   NUEVO PEDIDO
   =========================== */

// Colores intensos y distintos por destino, coherentes con Aprobaciones/Movimientos.
const DESTINO_COLORS = [
  { bg: "#1e3a8a", fg: "#ffffff" },
  { bg: "#065f46", fg: "#ffffff" },
  { bg: "#9a3412", fg: "#ffffff" },
  { bg: "#6b21a8", fg: "#ffffff" },
  { bg: "#155e75", fg: "#ffffff" },
  { bg: "#9f1239", fg: "#ffffff" },
  { bg: "#3f6212", fg: "#ffffff" },
  { bg: "#854d0e", fg: "#ffffff" },
  { bg: "#5b21b6", fg: "#ffffff" },
  { bg: "#0f766e", fg: "#ffffff" },
];
const destinoColorAt = (i) => DESTINO_COLORS[((i % DESTINO_COLORS.length) + DESTINO_COLORS.length) % DESTINO_COLORS.length];

function PedidoModal({
  open,
  onClose,
  productos,
  stockByProductSize,
  onSubmit,
  saving,
  esEmpresaExterna = false,
}) {
  const [search, setSearch] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroSubcategoria, setFiltroSubcategoria] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [qtyInput, setQtyInput] = useState({});
  const [localError, setLocalError] = useState("");

  // El pedido se construye por GRUPOS: cada grupo es un destino con su propia
  // cesta de productos. Un pedido normal tiene un único grupo (un destino); la
  // empresa externa (UTE) puede añadir hasta 10 grupos (producto→destino),
  // eligiendo productos y asociándolos a cada destino.
  const MAX_DESTINOS = 10;
  const grupoSeqRef = useRef(1);
  const makeGrupo = () => ({ _id: grupoSeqRef.current++, distrito: "", barrio: "", direccion: "", cart: {} });
  const [grupos, setGrupos] = useState(() => [makeGrupo()]);
  // Grupo al que se añaden los productos seleccionados en el panel izquierdo.
  const [activeGrupoId, setActiveGrupoId] = useState(null);
  // Destinos plegados en el modal (por _id de grupo).
  const [gruposColapsados, setGruposColapsados] = useState({});
  const toggleGrupoColapsado = (id) => setGruposColapsados((p) => ({ ...p, [id]: !p[id] }));
  // Comentarios/anotaciones que la empresa externa adjunta al pedido; los ve
  // quien aprueba y quien sirve, y salen en el PDF impreso.
  const [nota, setNota] = useState("");

  useEffect(() => {
    if (!open) {
      setSearch("");
      setFiltroCategoria("");
      setFiltroSubcategoria("");
      setSelectedProductId("");
      setQtyInput({});
      setLocalError("");
      const g = makeGrupo();
      setGrupos([g]);
      setActiveGrupoId(g._id);
      setGruposColapsados({});
      setNota("");
    }
  }, [open]);

  // Al cambiar de categoría se limpia la subcategoría (dependen entre sí).
  useEffect(() => {
    setFiltroSubcategoria("");
  }, [filtroCategoria]);

  // Solo los productos que TIENEN stock disponible (en alguno de sus formatos).
  // Los desplegables de categoría/subcategoría se derivan EXCLUSIVAMENTE de
  // estos, para no ofrecer categorías/subcategorías sin existencias.
  const productosConStock = useMemo(() => {
    return safeArray(productos).filter((p) => {
      const formatoOptions = getFormatoOptions(getProductFormatoConfig(p));
      return formatoOptions.some(
        (t) => (stockByProductSize.get(lineKey(p.id, t)) || 0) > 0
      );
    });
  }, [productos, stockByProductSize]);

  // Categorías y subcategorías disponibles para los desplegables de filtro,
  // solo entre productos con stock.
  const categoriasDisponibles = useMemo(() => {
    const set = new Set();
    for (const p of productosConStock) {
      const c = String(p?.categoria || "").trim();
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [productosConStock]);

  const subcategoriasDisponibles = useMemo(() => {
    if (!filtroCategoria) return [];
    const set = new Set();
    for (const p of productosConStock) {
      if (String(p?.categoria || "").trim() !== filtroCategoria) continue;
      const s = String(p?.subcategoria || "").trim();
      if (s) set.add(s);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [productosConStock, filtroCategoria]);

  const barriosDe = (distrito) => (distrito ? DISTRITO_BARRIOS[distrito] || [] : []);

  const activeGrupo = grupos.find((g) => g._id === activeGrupoId) || grupos[0];

  // Suma de un producto+tamaño reservado en TODOS los grupos (para no exceder
  // el stock disponible al repartir el mismo producto entre varios destinos).
  const totalAsignado = (key) =>
    grupos.reduce((s, g) => s + Number(g.cart?.[key] || 0), 0);

  // Líneas (producto, tamaño, cantidad) de un grupo.
  const grupoLines = (g) =>
    Object.entries(g.cart || {})
      .map(([key, cantidad]) => {
        const parsed = parseLineKey(key);
        const prod = productos.find((p) => p.id === parsed.producto_id);
        return {
          key,
          producto_id: parsed.producto_id,
          tamano: parsed.tamano,
          cantidad: Number(cantidad),
          nombre: getScientificProductDisplayName(prod),
        };
      })
      .filter((x) => x.cantidad > 0);

  const grupoAddressValid = (g) =>
    !!g.distrito && !!g.barrio && !!String(g.direccion || "").trim();

  // Gestión de grupos/destinos (solo la UTE puede tener más de uno).
  const updateGrupo = (id, field, value) => {
    setGrupos((prev) =>
      prev.map((g) =>
        g._id === id
          ? { ...g, [field]: value, ...(field === "distrito" ? { barrio: "" } : {}) }
          : g
      )
    );
  };
  const addGrupo = () => {
    if (grupos.length >= MAX_DESTINOS) return;
    const g = makeGrupo();
    setGrupos((prev) => [...prev, g]);
    setActiveGrupoId(g._id);
    // Colapsa los destinos anteriores para que el foco quede en el nuevo.
    setGruposColapsados((prev) => {
      const next = { ...prev };
      for (const gr of grupos) next[gr._id] = true;
      return next;
    });
  };
  const removeGrupo = (id) => {
    if (grupos.length <= 1) return;
    const next = grupos.filter((g) => g._id !== id);
    setGrupos(next);
    if (activeGrupoId === id) setActiveGrupoId(next[0]._id);
  };

  const addToGrupo = (grupoId, productoId, tamano, qty) => {
    const key = lineKey(productoId, tamano);
    setGrupos((prev) =>
      prev.map((g) =>
        g._id === grupoId
          ? { ...g, cart: { ...g.cart, [key]: Number(g.cart?.[key] || 0) + qty } }
          : g
      )
    );
  };
  const setGrupoLineQty = (grupoId, key, qty) => {
    setGrupos((prev) =>
      prev.map((g) => {
        if (g._id !== grupoId) return g;
        const cart = { ...g.cart };
        if (qty <= 0) delete cart[key];
        else cart[key] = qty;
        return { ...g, cart };
      })
    );
  };

  const productosDisponibles = useMemo(() => {
    const texto = search.trim().toLowerCase();

    return safeArray(productos)
      .filter((p) => {
        // Las opciones válidas dependen de la categoría del producto:
        // plantas → tamaños de maceta; fito/fert → formatos de polvo/líquido;
        // áridos/material vegetal → "metros cúbicos"; ferretería → "metros" o "unidades".
        const formatoOptions = getFormatoOptions(getProductFormatoConfig(p));
        const tieneStock = formatoOptions.some(
          (t) => (stockByProductSize.get(lineKey(p.id, t)) || 0) > 0
        );
        if (!tieneStock) return false;

        // Filtros por desplegable de categoría / subcategoría.
        if (filtroCategoria && String(p?.categoria || "").trim() !== filtroCategoria) return false;
        if (filtroSubcategoria && String(p?.subcategoria || "").trim() !== filtroSubcategoria) return false;

        if (!texto) return true;

        const nombreCientifico = String(p?.nombre_cientifico || p?.producto_nombre_cientifico || "").toLowerCase();
        const categoria = String(p?.categoria || "").toLowerCase();
        const subcategoria = String(p?.subcategoria || "").toLowerCase();

        return (
          nombreCientifico.includes(texto) ||
          categoria.includes(texto) ||
          subcategoria.includes(texto)
        );
      })
      .sort((a, b) =>
        String(getScientificProductDisplayName(a)).localeCompare(String(getScientificProductDisplayName(b)))
      );
  }, [productos, stockByProductSize, search, filtroCategoria, filtroSubcategoria]);

  const selectedProduct = useMemo(
    () => productosDisponibles.find((p) => String(p.id) === String(selectedProductId)) || null,
    [productosDisponibles, selectedProductId]
  );

  // FormatoConfig del producto seleccionado — usado para decidir si la cantidad
  // admite decimales (fitosanitarios/fertilizantes) o solo enteros.
  const selectedFormatoConfig = useMemo(
    () => getProductFormatoConfig(selectedProduct),
    [selectedProduct]
  );

  const selectedProductSizes = useMemo(() => {
    if (!selectedProduct) return [];
    const formatoOptions = getFormatoOptions(getProductFormatoConfig(selectedProduct));
    return formatoOptions.map((tamano) => {
      const key = lineKey(selectedProduct.id, tamano);
      const disponible = Math.max(0, Number(stockByProductSize.get(key) || 0));
      // Ya asignado a TODOS los destinos del pedido (no solo al grupo activo),
      // para no permitir repartir más unidades de las que hay.
      const asignado = totalAsignado(key);
      const restante = Math.max(0, disponible - asignado);
      return { tamano, disponible, restante, enCesta: asignado };
    }).filter((x) => x.disponible > 0);
  }, [selectedProduct, stockByProductSize, grupos]);

  const totalLineas = grupos.reduce((s, g) => s + grupoLines(g).length, 0);
  const totalItems = grupos.reduce(
    (s, g) => s + Object.values(g.cart || {}).reduce((a, q) => a + Number(q || 0), 0),
    0
  );
  const hasAnyProduct = totalLineas > 0;

  // Ningún producto puede superar, sumando todos los destinos, su stock.
  const stockValid = useMemo(() => {
    const totals = {};
    for (const g of grupos) {
      for (const [key, q] of Object.entries(g.cart || {})) {
        totals[key] = (totals[key] || 0) + Number(q || 0);
      }
    }
    return Object.entries(totals).every(
      ([key, q]) => q <= Math.max(0, Number(stockByProductSize.get(key) || 0))
    );
  }, [grupos, stockByProductSize]);

  // Cada destino debe tener dirección completa y al menos un producto.
  const allGruposValid = grupos.every(
    (g) => grupoAddressValid(g) && grupoLines(g).length > 0
  );

  const canSubmit = !saving && hasAnyProduct && allGruposValid && stockValid;

  const addToCart = (productoId, tamano) => {
    setLocalError("");
    const key = lineKey(productoId, tamano);
    const qty = Number(qtyInput[key]);
    const disponible = Math.max(0, Number(stockByProductSize.get(key) || 0));
    const restante = disponible - totalAsignado(key);

    if (!qty || qty <= 0) {
      setLocalError("Indica una cantidad válida mayor que 0.");
      return;
    }
    if (qty > restante) {
      setLocalError(`No puedes añadir ${qty}. Disponible restante para ${tamano}: ${restante}.`);
      return;
    }
    if (!activeGrupo) return;

    addToGrupo(activeGrupo._id, productoId, tamano, qty);
    setQtyInput((prev) => ({ ...prev, [key]: "" }));
  };

  const submitPedido = async () => {
    setLocalError("");

    if (!hasAnyProduct) {
      setLocalError("Añade al menos un producto a algún destino.");
      return;
    }
    if (!stockValid) {
      setLocalError("Hay productos cuya cantidad total supera el stock disponible.");
      return;
    }
    for (const g of grupos) {
      if (grupoLines(g).length === 0) {
        setLocalError("Cada destino debe tener al menos un producto.");
        return;
      }
      if (!grupoAddressValid(g)) {
        setLocalError("Cada destino debe tener distrito, barrio y dirección.");
        return;
      }
    }

    // Una línea por (producto, destino): así al servir se genera un movimiento
    // por cada una con su dirección.
    const items = [];
    for (const g of grupos) {
      for (const line of grupoLines(g)) {
        items.push({
          producto_id: line.producto_id,
          tamano: line.tamano,
          cantidad: line.cantidad,
          distrito_destino: g.distrito,
          barrio_destino: g.barrio,
          direccion_destino: String(g.direccion || "").trim(),
        });
      }
    }
    const primero = grupos[0];
    await onSubmit({
      items,
      // Destino a nivel de pedido = primer destino (compatibilidad/visualización).
      distrito_destino: primero.distrito,
      barrio_destino: primero.barrio,
      direccion_destino: String(primero.direccion || "").trim(),
      nota: String(nota || "").trim() || null,
    });
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background:
          "radial-gradient(circle at top left, rgba(14,165,233,0.18), transparent 30%), radial-gradient(circle at top right, rgba(16,185,129,0.16), transparent 30%), rgba(2,6,23,0.62)",
        backdropFilter: "blur(8px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 22,
      }}
    >
      <div
        style={{
          width: "min(1760px, 98vw)",
          height: "min(930px, 94vh)",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%)",
          borderRadius: 28,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.35)",
          boxShadow: "0 40px 120px rgba(2,6,23,0.40)",
          display: "grid",
          gridTemplateColumns: "0.95fr 1.02fr 1fr",
        }}
      >
        <div
          style={{
            padding: 24,
            borderRight: "1px solid rgba(15,23,42,0.07)",
            overflowY: "auto",
            overflowX: "hidden",
            minWidth: 0,
            background: "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(248,250,252,0.98))",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 30, fontWeight: 900, color: "#0f172a" }}>Nuevo pedido</div>
              <div style={{ marginTop: 6, color: "#64748b", fontWeight: 700 }}>
                Selecciona productos con stock disponible y confirma el destino final.
              </div>
            </div>

            <button
              onClick={onClose}
              style={{
                width: 42,
                height: 42,
                borderRadius: 999,
                border: "1px solid rgba(148,163,184,0.18)",
                background: "white",
                fontWeight: 900,
                fontSize: 18,
                cursor: "pointer",
                color: "#0f172a",
              }}
              title="Cerrar"
            >
              ×
            </button>
          </div>

          <div style={{ marginTop: 18, position: "relative" }}>
            <input
              placeholder="Buscar por nombre científico, categoría o subcategoría..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={softInputStyle()}
            />
          </div>

          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              style={softInputStyle()}
            >
              <option value="">Todas las categorías</option>
              {categoriasDisponibles.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={filtroSubcategoria}
              onChange={(e) => setFiltroSubcategoria(e.target.value)}
              style={{ ...softInputStyle(), opacity: filtroCategoria ? 1 : 0.55 }}
              disabled={!filtroCategoria || subcategoriasDisponibles.length === 0}
            >
              <option value="">Todas las subcategorías</option>
              {subcategoriasDisponibles.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <ModalStat label="Productos con stock" value={productosDisponibles.length} />
            <ModalStat label="Líneas del pedido" value={totalLineas} tone={totalLineas ? "success" : "default"} />
          </div>

          {esEmpresaExterna && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.18)", color: "#1e3a8a", fontWeight: 800, fontSize: 12 }}>
              Añadiendo a: <strong>Destino {Math.max(0, grupos.findIndex((g) => g._id === activeGrupo?._id)) + 1}</strong>
              {activeGrupo?.barrio ? ` · ${activeGrupo.barrio}` : ""}
            </div>
          )}

          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {productosDisponibles.length === 0 ? (
              <div style={{ color: "#64748b", fontWeight: 700 }}>
                No hay productos disponibles para esa búsqueda.
              </div>
            ) : (
              productosDisponibles.map((p) => {
                const active = String(selectedProductId) === String(p.id);
                const formatoOptionsP = getFormatoOptions(getProductFormatoConfig(p));
                const total = formatoOptionsP.reduce(
                  (acc, t) => acc + Math.max(0, Number(stockByProductSize.get(lineKey(p.id, t)) || 0)),
                  0
                );

                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProductId(String(p.id))}
                    style={{
                      ...cardStyle(),
                      textAlign: "left",
                      padding: 16,
                      cursor: "pointer",
                      border: active
                        ? "1px solid rgba(6,182,212,0.34)"
                        : "1px solid rgba(148,163,184,0.14)",
                      background: active
                        ? "linear-gradient(180deg, rgba(240,249,255,0.98), rgba(236,253,245,0.98))"
                        : "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98))",
                      boxShadow: active
                        ? "0 22px 40px rgba(6,182,212,0.12)"
                        : "0 12px 28px rgba(15,23,42,0.05)",
                    }}
                  >
                    <div style={{ fontWeight: 900, fontSize: 18, color: "#0f172a" }}>
                      {getScientificProductDisplayName(p)}
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 12,
                        color: "#64748b",
                        fontWeight: 800,
                        letterSpacing: 0.2,
                        textTransform: "uppercase",
                      }}
                    >
                      {(p.categoria || "—") + (p.subcategoria ? ` · ${p.subcategoria}` : "")}
                    </div>

                    <div
                      style={{
                        marginTop: 12,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "7px 10px",
                        borderRadius: 999,
                        background: "rgba(15,23,42,0.04)",
                        color: "#0f172a",
                        fontWeight: 900,
                        fontSize: 13,
                      }}
                    >
                      Stock total disponible: {total}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div
          style={{
            padding: 24,
            borderRight: "1px solid rgba(15,23,42,0.07)",
            overflowY: "auto",
            overflowX: "hidden",
            minWidth: 0,
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 900, color: "#0f172a" }}>
            {selectedProduct ? getScientificProductDisplayName(selectedProduct) : "Selecciona un producto"}
          </div>

          <div style={{ marginTop: 6, color: "#64748b", fontWeight: 700 }}>
            {selectedProduct
              ? "Añade solo lo que realmente esté disponible. El sistema valida stock en tiempo real."
              : "Cuando elijas un producto, aquí verás los tamaños y las unidades disponibles."}
          </div>

          {!selectedProduct ? (
            <div
              style={{
                ...cardStyle(),
                marginTop: 22,
                padding: 22,
                color: "#64748b",
                fontWeight: 700,
                minHeight: 220,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
              }}
            >
              Elige un producto del panel izquierdo para continuar.
            </div>
          ) : (
            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.1fr 0.8fr 0.9fr auto",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 16,
                  background: "rgba(248,250,252,0.95)",
                  border: "1px solid rgba(15,23,42,0.08)",
                  color: "#475569",
                  fontWeight: 900,
                  fontSize: 13,
                  textTransform: "uppercase",
                  letterSpacing: 0.3,
                }}
              >
                <div>Tamaño</div>
                <div style={{ textAlign: "center" }}>Disponible</div>
                <div style={{ textAlign: "center" }}>Añadir</div>
                <div style={{ textAlign: "center" }}>Acción</div>
              </div>

              {selectedProductSizes.length === 0 ? (
                <div style={{ color: "#64748b", fontWeight: 700 }}>
                  Este producto no tiene stock por tamaño disponible.
                </div>
              ) : (
                selectedProductSizes.map((row) => {
                  const key = lineKey(selectedProduct.id, row.tamano);
                  const disabled = row.restante <= 0;
                  return (
                    <div
                      key={key}
                      style={{
                        ...cardStyle(),
                        padding: 14,
                        display: "grid",
                        gridTemplateColumns: "1.1fr 0.8fr 0.9fr auto",
                        gap: 12,
                        alignItems: "center",
                        minWidth: 0,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 900, color: "#0f172a", fontSize: 18 }}>{row.tamano}</div>
                        <div style={{ marginTop: 4, color: "#64748b", fontWeight: 700, fontSize: 12 }}>
                          En cesta: {formatCantidad(row.enCesta)} · Restante tras pedido: {formatCantidad(row.restante)}
                        </div>
                      </div>

                      <div
                        style={{
                          justifySelf: "center",
                          padding: "8px 12px",
                          borderRadius: 999,
                          background: row.restante > 0 ? "rgba(16,185,129,0.10)" : "rgba(148,163,184,0.12)",
                          color: row.restante > 0 ? "#065f46" : "#64748b",
                          fontWeight: 900,
                          minWidth: 70,
                          textAlign: "center",
                        }}
                      >
                        {formatCantidad(row.restante)}
                      </div>

                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <input
                          type="number"
                          min={0}
                          max={row.restante}
                          step={selectedFormatoConfig?.allowDecimals ? "0.001" : "1"}
                          value={qtyInput[key] ?? ""}
                          onChange={(e) =>
                            setQtyInput((prev) => ({
                              ...prev,
                              [key]: clampNumber(e.target.value, 0, row.restante),
                            }))
                          }
                          placeholder={selectedFormatoConfig?.allowDecimals ? "0.00" : "0"}
                          style={{
                            width: 104,
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: "1px solid rgba(15,23,42,0.12)",
                            textAlign: "center",
                            fontWeight: 900,
                            color: "#0f172a",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>

                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <button
                          onClick={() => addToCart(selectedProduct.id, row.tamano)}
                          disabled={disabled}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: "1px solid rgba(16,185,129,0.18)",
                            background: disabled
                              ? "rgba(148,163,184,0.14)"
                              : "linear-gradient(135deg, rgba(14,165,233,0.12), rgba(16,185,129,0.14))",
                            color: disabled ? "#94a3b8" : "#065f46",
                            fontWeight: 900,
                            cursor: disabled ? "not-allowed" : "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Añadir
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div
          style={{
            padding: 24,
            overflowY: "auto",
            overflowX: "hidden",
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(240,249,255,0.65) 100%)",
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 900, color: "#0f172a" }}>Resumen y destinos</div>
          <div style={{ marginTop: 6, color: "#64748b", fontWeight: 700 }}>
            {esEmpresaExterna
              ? "Añade productos a un destino y, si lo necesitas, crea más destinos para el mismo pedido."
              : "Revisa la cesta y define el destino exacto del pedido."}
          </div>

          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <ModalStat label={esEmpresaExterna ? "Destinos" : "Líneas"} value={esEmpresaExterna ? grupos.length : totalLineas} />
            <ModalStat label="Unidades" value={totalItems} tone={totalItems ? "success" : "default"} />
            <ModalStat label="Estado" value={canSubmit ? "Listo" : "Pendiente"} tone={canSubmit ? "success" : "warn"} />
          </div>

          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            {grupos.map((g, idx) => {
              const lines = grupoLines(g);
              const isActive = g._id === activeGrupo?._id;
              const col = destinoColorAt(idx);
              const colapsado = !!gruposColapsados[g._id];
              const labelMini = { fontSize: 12, fontWeight: 900, color: "#64748b", marginBottom: 6, textTransform: "uppercase" };
              return (
                <div
                  key={g._id}
                  style={{
                    ...cardStyle(),
                    padding: 16,
                    border: esEmpresaExterna && isActive
                      ? "2px solid rgba(6,182,212,0.45)"
                      : "1px solid rgba(148,163,184,0.16)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: colapsado ? 0 : 10 }}>
                    <div
                      onClick={() => toggleGrupoColapsado(g._id)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, background: col.bg, color: col.fg, fontWeight: 900, fontSize: 14, cursor: "pointer" }}
                      title={colapsado ? "Desplegar destino" : "Plegar destino"}
                    >
                      <span style={{ fontSize: 11 }}>{colapsado ? "▶" : "▼"}</span>
                      {esEmpresaExterna ? `Destino ${idx + 1}` : "Destino del pedido"}
                      <span style={{ opacity: 0.85, fontWeight: 800, fontSize: 12 }}>
                        ({lines.length}{g.barrio ? ` · ${g.barrio}` : ""})
                      </span>
                    </div>
                    {esEmpresaExterna && (
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {isActive ? (
                          <span style={{ fontSize: 11, fontWeight: 900, color: "#0e7490", background: "rgba(6,182,212,0.12)", padding: "4px 8px", borderRadius: 999 }}>Añadiendo aquí</span>
                        ) : (
                          <button type="button" onClick={() => setActiveGrupoId(g._id)} style={{ border: "1px solid rgba(6,182,212,0.30)", background: "rgba(6,182,212,0.06)", color: "#0e7490", fontWeight: 900, fontSize: 11, padding: "4px 8px", borderRadius: 999, cursor: "pointer" }}>Añadir aquí</button>
                        )}
                        {grupos.length > 1 && (
                          <button type="button" onClick={() => removeGrupo(g._id)} style={{ border: "none", background: "transparent", color: "#ef4444", fontWeight: 900, cursor: "pointer", fontSize: 12 }}>Quitar</button>
                        )}
                      </div>
                    )}
                  </div>

                  {!colapsado && (<>
                  <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                    <div>
                      <div style={labelMini}>Distrito</div>
                      <select value={g.distrito} onChange={(e) => updateGrupo(g._id, "distrito", e.target.value)} style={softInputStyle()}>
                        <option value="">Seleccionar distrito</option>
                        {DISTRITOS.map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={labelMini}>Barrio</div>
                      <select value={g.barrio} onChange={(e) => updateGrupo(g._id, "barrio", e.target.value)} disabled={!g.distrito} style={{ ...softInputStyle(), opacity: g.distrito ? 1 : 0.66 }}>
                        <option value="">{g.distrito ? "Seleccionar barrio" : "Primero el distrito"}</option>
                        {barriosDe(g.distrito).map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div style={{ gridColumn: "span 2" }}>
                      <div style={labelMini}>Dirección</div>
                      <input value={g.direccion} onChange={(e) => updateGrupo(g._id, "direccion", e.target.value)} placeholder="Escribe la dirección de destino" style={softInputStyle()} />
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 900, color: "#0f172a", fontSize: 13, marginBottom: 6 }}>Productos ({lines.length})</div>
                    {lines.length === 0 ? (
                      <div style={{ color: "#94a3b8", fontWeight: 700, fontSize: 12 }}>
                        {esEmpresaExterna ? "Pulsa «Añadir aquí» y elige productos en el panel izquierdo." : "Añade productos desde el panel izquierdo."}
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: 8 }}>
                        {lines.map((line) => {
                          const prod = productos.find((p) => p.id === line.producto_id);
                          const allowDecimals = !!getProductFormatoConfig(prod)?.allowDecimals;
                          return (
                            <div key={line.key} style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 10px", borderRadius: 10, background: "rgba(248,250,252,0.9)", border: "1px solid rgba(15,23,42,0.06)" }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 900, color: "#0f172a", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line.nombre}</div>
                                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Tamaño: {line.tamano}</div>
                              </div>
                              <input
                                type="number"
                                min={0}
                                step={allowDecimals ? "0.001" : "1"}
                                value={line.cantidad}
                                onChange={(e) => setGrupoLineQty(g._id, line.key, clampNumber(e.target.value, 0, Number.MAX_SAFE_INTEGER))}
                                style={{ width: 84, padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(15,23,42,0.12)", textAlign: "center", fontWeight: 900, color: "#0f172a" }}
                              />
                              <button type="button" onClick={() => setGrupoLineQty(g._id, line.key, 0)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(239,68,68,0.18)", background: "rgba(239,68,68,0.08)", color: "#991b1b", fontWeight: 900, cursor: "pointer", fontSize: 12 }}>Quitar</button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  </>)}
                </div>
              );
            })}

            {esEmpresaExterna && (
              <button
                type="button"
                onClick={addGrupo}
                disabled={grupos.length >= MAX_DESTINOS}
                style={{
                  padding: "12px 14px", borderRadius: 12, border: "1px dashed rgba(6,182,212,0.5)",
                  background: grupos.length >= MAX_DESTINOS ? "rgba(148,163,184,0.1)" : "rgba(6,182,212,0.06)",
                  color: grupos.length >= MAX_DESTINOS ? "#94a3b8" : "#0e7490", fontWeight: 900, fontSize: 13,
                  cursor: grupos.length >= MAX_DESTINOS ? "not-allowed" : "pointer",
                }}
              >
                {grupos.length >= MAX_DESTINOS ? `Máximo ${MAX_DESTINOS} destinos` : "+ Añadir otro destino"}
              </button>
            )}
          </div>

          <div style={{ ...cardStyle(), marginTop: 14, padding: 14 }}>
            <div style={{ fontWeight: 900, color: "#0f172a", fontSize: 14 }}>Comentarios / anotaciones</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "#64748b", fontWeight: 700 }}>
              Opcional. Lo verá quien aprueba y quien sirve el pedido, y aparecerá en el PDF impreso.
            </div>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej.: entregar en horario de mañana, avisar al llegar, plantas para reposición del parque…"
              maxLength={1000}
              style={{
                marginTop: 10, width: "100%", boxSizing: "border-box", minHeight: 70, resize: "vertical",
                padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(15,23,42,0.14)",
                outline: "none", fontWeight: 700, color: "#0f172a", background: "#fff", fontFamily: "inherit",
              }}
            />
          </div>

          {localError ? (
            <div
              style={{
                ...cardStyle(),
                marginTop: 14,
                padding: 14,
                background: "linear-gradient(180deg, rgba(254,242,242,0.96), rgba(255,255,255,0.98))",
                border: "1px solid rgba(239,68,68,0.16)",
                color: "#991b1b",
                fontWeight: 800,
              }}
            >
              {localError}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button
              onClick={onClose}
              disabled={saving}
              style={{ padding: "11px 18px", borderRadius: 12, border: "2px solid #94a3b8", background: "#e2e8f0", color: "#334155", fontWeight: 900, cursor: saving ? "not-allowed" : "pointer" }}
            >
              Cerrar
            </button>

            <button
              onClick={submitPedido}
              disabled={!canSubmit}
              style={{
                ...primaryBtn(!canSubmit),
                marginLeft: "auto",
              }}
            >
              {saving ? "Creando..." : "Confirmar pedido"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================
   LISTA DE PEDIDOS
   ========================================= */

// Per-item state badge for the items column in the Pedidos table.
// Renders only when the parent pedido is APROBADO_PARCIAL — in any other
// state every item shares the same status, so the badge would be
// redundant noise.
function ItemEstadoBadge({ estadoItem }) {
  const e = String(estadoItem || "RESERVA").toUpperCase();
  let label, bg, color, border;
  if (e === "APROBADO") {
    label = "✓ Aprobado";
    bg = "rgba(16,185,129,0.14)";
    color = "#065f46";
    border = "rgba(16,185,129,0.30)";
  } else if (e === "DENEGADO") {
    label = "✗ Denegado";
    bg = "rgba(239,68,68,0.12)";
    color = "#991b1b";
    border = "rgba(239,68,68,0.30)";
  } else {
    label = "⏳ Pendiente";
    bg = "rgba(245,158,11,0.14)";
    color = "#92400e";
    border = "rgba(245,158,11,0.30)";
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 900,
        letterSpacing: ".02em",
        background: bg,
        color,
        border: `1px solid ${border}`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function PedidoDetalleCellOld({
  pedido,
  mapProdName,
  expanded,
  toggleExpanded,
  editingId,
  editQty,
  setEditQty,
  editSearch,
  setEditSearch,
  productosDisponiblesParaEdicion,
}) {
  const items = editingId === pedido.id
    ? Object.entries(editQty).map(([key, cantidad]) => {
        const parsed = parseLineKey(key);
        return {
          producto_id: parsed.producto_id,
          tamano: parsed.tamano,
          cantidad: Number(cantidad),
        };
      })
    : safeArray(pedido.items);

  // Annotate per-item status whenever the items don't all share the same
  // state — the parent pedido's estado is the primary signal, but we also
  // compute it directly from items as a defensive fallback in case the
  // backend hasn't recomputed (or there's legacy data sitting in the wrong
  // state — e.g. an APROBADO pedido that secretly has a DENEGADO line).
  const itemStates = new Set(items.map((it) => String(it.estado_item || "RESERVA").toUpperCase()));
  const isPartial =
    estadoNormalizado(pedido?.estado) === "APROBADO_PARCIAL" ||
    itemStates.size > 1;

  // ¿El pedido reparte en varios destinos? Para mostrar el destino por línea.
  const _dstDeItem = (it) => [it.distrito_destino, it.barrio_destino, it.direccion_destino].filter(Boolean).join(" · ");
  const variosDestinos = new Set(items.map(_dstDeItem).filter(Boolean)).size > 1;

  if (editingId !== pedido.id) {
    // Show at most 3 items by default — including for APROBADO_PARCIAL.
    // The "+ ver N más" button expands the rest in-place.  For partial
    // pedidos with hidden denied/pending items we surface a small badge
    // in the toggle so the viewer notices there's masked state.
    const COLLAPSED_MAX = 3;
    const visibleItems = expanded ? items : items.slice(0, COLLAPSED_MAX);
    const hiddenCount = Math.max(0, items.length - visibleItems.length);
    // Count of "interesting" hidden items in partial mode (denied or
    // approved that the viewer otherwise might miss).
    const hiddenInteresting = expanded
      ? 0
      : items.slice(COLLAPSED_MAX).filter((it) => {
          if (!isPartial) return false;
          const e = String(it.estado_item || "RESERVA").toUpperCase();
          return e === "DENEGADO" || e === "APROBADO";
        }).length;

    return (
      <div>
        {items.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {visibleItems.map((it, idx) => {
              const pid = it.producto_id;
              const nombre =
                it.producto_nombre_cientifico ||
                it.nombre_cientifico ||
                mapProdName.get(pid) ||
                it.producto_nombre_natural ||
                it.nombre_natural ||
                it.nombre ||
                `ID ${pid}`;

              const estIt = String(it.estado_item || "RESERVA").toUpperCase();
              const isDenegado = isPartial && estIt === "DENEGADO";
              // In partial-approval mode, tint the row background by state
              // so the manager / proveedor can scan which lines are which.
              const rowBg = !isPartial
                ? "transparent"
                : estIt === "APROBADO"
                ? "rgba(16,185,129,0.06)"
                : estIt === "DENEGADO"
                ? "rgba(239,68,68,0.05)"
                : "rgba(245,158,11,0.06)";
              const rowBorder = !isPartial
                ? "transparent"
                : estIt === "APROBADO"
                ? "rgba(16,185,129,0.25)"
                : estIt === "DENEGADO"
                ? "rgba(239,68,68,0.25)"
                : "rgba(245,158,11,0.25)";

              return (
                <div
                  key={`${pedido.id}-${idx}`}
                  style={{
                    padding: isPartial ? "6px 8px" : "0",
                    borderRadius: isPartial ? 8 : 0,
                    background: rowBg,
                    borderLeft: isPartial ? `3px solid ${rowBorder}` : "none",
                  }}
                >
                  {/* Row 1: matches the header grid (1fr 90px 80px) so the
                      Producto / Tamaño / Cantidad columns line up perfectly
                      with the column headers above the table. */}
                  <div
                    style={{
                      display: "grid",
                      // Mantén estos valores en sync con la sub-grid del
                      // <th> de Producto.  Si cambias uno, cambia el otro.
                      gridTemplateColumns: "1fr 80px 70px",
                      gap: 8,
                      alignItems: "center",
                      opacity: isDenegado ? 0.55 : 1,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        color: "#0f172a",
                        textDecoration: isDenegado ? "line-through" : "none",
                      }}
                    >
                      {nombre}
                    </div>
                    <div style={{ textAlign: "center", fontWeight: 900, color: "#334155" }}>
                      {it.tamano || "—"}
                    </div>
                    <div style={{ textAlign: "right", fontWeight: 900, color: "#0f172a" }}>
                      {formatCantidad(it.cantidad ?? 0) || "0"}
                    </div>
                  </div>
                  {variosDestinos && _dstDeItem(it) ? (
                    <div style={{ marginTop: 2, fontSize: 11, fontWeight: 800, color: "#1e3a8a" }}>
                      📍 {_dstDeItem(it)}
                    </div>
                  ) : null}

                  {/* Row 2: small inline badge under the item — only in
                      partial-approval mode.  Does not consume horizontal
                      space, so the columns above stay aligned with the
                      table header. */}
                  {isPartial ? (
                    <div style={{ marginTop: 4 }}>
                      <ItemEstadoBadge estadoItem={it.estado_item} />
                    </div>
                  ) : null}
                </div>
              );
            })}

            {items.length > 3 ? (
              <button
                onClick={() => toggleExpanded(pedido.id)}
                style={{
                  alignSelf: "flex-start",
                  marginTop: 4,
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: `1px solid ${
                    hiddenInteresting > 0
                      ? "rgba(220,38,38,0.45)"
                      : "rgba(15,23,42,0.10)"
                  }`,
                  background: hiddenInteresting > 0 ? "rgba(220,38,38,0.06)" : "white",
                  color: "#0f172a",
                  fontWeight: 900,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
                title={
                  hiddenInteresting > 0
                    ? `Hay ${hiddenInteresting} líneas con decisión que están ocultas`
                    : undefined
                }
              >
                {hiddenInteresting > 0 && !expanded ? (
                  <span
                    style={{
                      display: "inline-block",
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: "#dc2626",
                    }}
                  />
                ) : null}
                {expanded ? "Ver menos" : `+ ver ${hiddenCount} más`}
              </button>
            ) : null}
          </div>
        ) : (
          <span style={{ color: "#64748b", fontWeight: 700 }}>Sin detalle</span>
        )}
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Object.entries(editQty).map(([key, cantidad]) => {
          const parsed = parseLineKey(key);
          return (
            <div
              key={`${pedido.id}-${key}`}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 90px 90px",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div style={{ fontWeight: 800, color: "#0f172a" }}>
                {mapProdName.get(parsed.producto_id) || `ID ${parsed.producto_id}`}
              </div>
              <div style={{ textAlign: "center", fontWeight: 900, color: "#334155" }}>
                {parsed.tamano}
              </div>
              <input
                type="number"
                min={0}
                value={cantidad}
                onChange={(e) =>
                  setEditQty((prev) => ({
                    ...prev,
                    [key]: Number(e.target.value),
                  }))
                }
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(15,23,42,0.12)",
                  textAlign: "center",
                  fontWeight: 900,
                }}
              />
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 12 }}>
        <input
          type="text"
          placeholder="Buscar productos para añadir por nombre científico..."
          value={editSearch}
          onChange={(e) => setEditSearch(e.target.value)}
          style={softInputStyle()}
        />

        <div
          style={{
            marginTop: 10,
            maxHeight: 180,
            overflow: "auto",
            border: "1px solid rgba(15,23,42,0.08)",
            borderRadius: 12,
          }}
        >
          {productosDisponiblesParaEdicion.length === 0 ? (
            <div style={{ padding: 12, color: "#64748b", fontWeight: 700 }}>
              No hay más productos que coincidan.
            </div>
          ) : (
            productosDisponiblesParaEdicion.flatMap((prod) =>
              getFormatoOptions(getProductFormatoConfig(prod)).map((tam) => {
                const key = lineKey(prod.id, tam);
                const disponible = Number(prod._stockBySize?.[tam] || 0);
                if (editQty[key] != null || disponible <= 0) return null;

                return (
                  <div
                    key={key}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 90px 90px auto",
                      gap: 10,
                      alignItems: "center",
                      padding: "10px 12px",
                      borderTop: "1px solid rgba(15,23,42,0.06)",
                    }}
                  >
                    <div style={{ fontWeight: 800, color: "#0f172a" }}>
                      {getScientificProductDisplayName(prod)}
                    </div>
                    <div style={{ textAlign: "center", fontWeight: 900, color: "#334155" }}>
                      {tam}
                    </div>
                    <div style={{ textAlign: "center", fontWeight: 900, color: "#0f172a" }}>
                      {disponible}
                    </div>
                    <button
                      onClick={() =>
                        setEditQty((prev) => ({
                          ...prev,
                          [key]: 1,
                        }))
                      }
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(16,185,129,0.25)",
                        background: "rgba(16,185,129,0.10)",
                        color: "#065f46",
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      Añadir
                    </button>
                  </div>
                );
              })
            )
          )}
        </div>
      </div>
    </>
  );
}

function ImprimirPedidosModal({ open, pedidos, mapProdName, onClose }) {
  const [seleccion, setSeleccion] = useState({}); // { [id]: true }
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) {
      setSeleccion({});
      setSearch("");
      setBusy(false);
      setErr("");
    }
  }, [open]);

  const lista = useMemo(() => {
    const t = search.trim().toLowerCase();
    const arr = Array.isArray(pedidos) ? [...pedidos] : [];
    arr.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    if (!t) return arr;
    return arr.filter((p) => {
      const sol = String(p.solicitante_username || p.solicitante || p.created_by || "").toLowerCase();
      const est = String(p.estado || "").toLowerCase();
      const tipo = String(p.tipo || "salida").toLowerCase();
      const destino = [p.distrito_destino, p.barrio_destino, p.direccion_destino].filter(Boolean).join(" ").toLowerCase();
      const detalle = (Array.isArray(p.items) ? p.items : [])
        .map((it) => `${it.producto_nombre_cientifico || it.producto_nombre || ""} ${it.tamano || ""}`.toLowerCase())
        .join(" ");
      return (
        String(p.id).includes(t) ||
        sol.includes(t) ||
        est.includes(t) ||
        tipo.includes(t) ||
        destino.includes(t) ||
        detalle.includes(t)
      );
    });
  }, [pedidos, search]);

  const seleccionados = useMemo(
    () => lista.filter((p) => seleccion[p.id]),
    [lista, seleccion]
  );

  const toggleOne = (id) =>
    setSeleccion((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });

  const marcarTodosVisibles = () => {
    setSeleccion((prev) => {
      const next = { ...prev };
      lista.forEach((p) => {
        next[p.id] = true;
      });
      return next;
    });
  };

  const limpiar = () => setSeleccion({});

  const handleGuardar = async () => {
    if (!seleccionados.length) {
      setErr("Selecciona al menos un pedido.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await guardarPedidosPdf(seleccionados, mapProdName);
    } catch (e) {
      setErr(e?.message || "Error generando PDF.");
    } finally {
      setBusy(false);
    }
  };

  const handleImprimir = async () => {
    if (!seleccionados.length) {
      setErr("Selecciona al menos un pedido.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await imprimirPedidosEnNavegador(seleccionados, mapProdName);
    } catch (e) {
      setErr(e?.message || "Error imprimiendo.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,6,23,0.55)",
        zIndex: 1500,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: 24,
        overflowY: "auto",
        overscrollBehavior: "contain",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1100px, 96vw)",
          background: "white",
          borderRadius: 22,
          boxShadow: "0 30px 80px rgba(2,6,23,0.35)",
          display: "flex",
          flexDirection: "column",
          marginTop: "auto",
          marginBottom: "auto",
        }}
      >
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid rgba(15,23,42,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            position: "sticky",
            top: 0,
            background: "white",
            zIndex: 2,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
          }}
        >
          <div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#0f172a" }}>Imprimir pedido</div>
            <div style={{ marginTop: 4, color: "#64748b", fontWeight: 700, fontSize: 14 }}>
              Selecciona uno o varios pedidos. Podrás elegir impresora o guardar como PDF.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              fontWeight: 900,
              cursor: "pointer",
              background: "#f59e0b",
              color: "#111827",
              border: "2px solid #000",
            }}
          >
            Cerrar
          </button>
        </div>

        <div
          style={{
            padding: "14px 22px",
            borderBottom: "1px solid rgba(15,23,42,0.05)",
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por ID, solicitante, estado, destino..."
            style={{
              flex: 1,
              minWidth: 240,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(15,23,42,0.15)",
              fontWeight: 700,
            }}
          />
          <button
            onClick={marcarTodosVisibles}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(15,23,42,0.10)",
              background: "white",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Seleccionar todos
          </button>
          <button
            onClick={limpiar}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(15,23,42,0.10)",
              background: "white",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Limpiar
          </button>
          <span style={{ fontWeight: 900, color: "#0f172a", marginLeft: "auto" }}>
            Seleccionados: {seleccionados.length}
          </span>
        </div>

        {err ? (
          <div
            style={{
              margin: "12px 22px 0",
              padding: "10px 14px",
              borderRadius: 10,
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
              color: "#991b1b",
              fontWeight: 800,
            }}
          >
            {err}
          </div>
        ) : null}

        <div style={{ padding: 22 }}>
          {lista.length === 0 ? (
            <div style={{ color: "#64748b", fontWeight: 800, padding: 20 }}>
              No hay pedidos que coincidan.
            </div>
          ) : (
            <div
              style={{
                border: "1px solid rgba(15,23,42,0.08)",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "36px 80px 110px 110px 1fr 160px 120px",
                  gap: 8,
                  padding: "10px 12px",
                  background: "#f8fafc",
                  fontWeight: 900,
                  fontSize: 12,
                  color: "#334155",
                  textTransform: "uppercase",
                }}
              >
                <div></div>
                <div>ID</div>
                <div>Tipo</div>
                <div>Fecha</div>
                <div>Solicitante / Destino</div>
                <div>Estado</div>
                <div>Caduca</div>
              </div>
              {lista.map((p) => {
                const checked = !!seleccion[p.id];
                // Si el pedido reparte en varios destinos distintos, lo indicamos
                // en vez de mostrar solo el primero.
                const _destinosPedido = new Set(
                  safeArray(p.items)
                    .map((it) => [it.distrito_destino, it.barrio_destino, it.direccion_destino].filter(Boolean).join(" · "))
                    .filter(Boolean)
                );
                const destino =
                  p.tipo === "reposicion"
                    ? "Vivero"
                    : _destinosPedido.size > 1
                    ? `Múltiples destinos (${_destinosPedido.size})`
                    : [p.distrito_destino, p.barrio_destino, p.direccion_destino]
                        .filter(Boolean)
                        .join(" · ") || "—";
                const solicitante =
                  formatUsername(
                    p.solicitante_username || p.solicitante || p.created_by || ""
                  ) || "—";
                return (
                  <label
                    key={p.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "36px 80px 110px 110px 1fr 160px 120px",
                      gap: 8,
                      padding: "10px 12px",
                      borderTop: "1px solid rgba(15,23,42,0.06)",
                      alignItems: "center",
                      background: checked ? "rgba(14,165,233,0.06)" : "white",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOne(p.id)}
                      style={{ width: 18, height: 18, cursor: "pointer" }}
                    />
                    <div style={{ fontWeight: 900 }}>#{p.id}</div>
                    <div style={{ fontWeight: 800, color: p.tipo === "reposicion" ? "#92400e" : "#1e3a8a" }}>
                      {p.tipo === "reposicion" ? "Reposición" : "Salida"}
                    </div>
                    <div>{fmtFechaES(p.created_at)}</div>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <div style={{ fontWeight: 800 }}>{solicitante}</div>
                      <div style={{ color: "#64748b", fontSize: 12 }}>{destino}</div>
                    </div>
                    <div style={{ fontWeight: 900 }}>{p.estado || "—"}</div>
                    <div style={{ color: "#b91c1c", fontWeight: 900 }}>
                      {/* La caducidad no aplica a pedidos ya cerrados (servidos,
                          denegados, cancelados o caducados). */}
                      {(() => {
                        const e = String(p.estado || "").toUpperCase();
                        const cerrado = ["SERVIDO", "DENEGADO", "CANCELADO", "CADUCADO"].includes(e);
                        return !cerrado && p.fecha_caducidad ? fmtFechaES(p.fecha_caducidad) : "—";
                      })()}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div
          style={{
            padding: "14px 22px",
            borderTop: "1px solid rgba(15,23,42,0.08)",
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            flexWrap: "wrap",
            position: "sticky",
            bottom: 0,
            background: "white",
            borderBottomLeftRadius: 22,
            borderBottomRightRadius: 22,
          }}
        >
          <button
            onClick={handleGuardar}
            disabled={busy || seleccionados.length === 0}
            style={{
              padding: "12px 18px",
              borderRadius: 12,
              border: "1px solid rgba(15,23,42,0.10)",
              background: busy || seleccionados.length === 0 ? "#f1f5f9" : "white",
              color: "#0f172a",
              fontWeight: 900,
              cursor: busy || seleccionados.length === 0 ? "not-allowed" : "pointer",
            }}
            title="Descargar como PDF"
          >
            {busy ? "Generando..." : "Descargar PDF"}
          </button>
          <button
            onClick={handleImprimir}
            disabled={busy || seleccionados.length === 0}
            style={{
              padding: "12px 18px",
              borderRadius: 12,
              border: "1px solid rgba(6,182,212,0.30)",
              background:
                busy || seleccionados.length === 0
                  ? "rgba(148,163,184,0.35)"
                  : "linear-gradient(135deg, #0ea5e9 0%, #06b6d4 60%, #10b981 100%)",
              color: "white",
              fontWeight: 900,
              cursor: busy || seleccionados.length === 0 ? "not-allowed" : "pointer",
            }}
            title="Abrir diálogo de impresión (imprimir o guardar como PDF)"
          >
            {busy ? "Preparando..." : `Imprimir${seleccionados.length > 1 ? ` ${seleccionados.length}` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Pedidos() {
  const { me } = useOutletContext();

  const [productos, setProductos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingNewPedido, setSavingNewPedido] = useState(false);

  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("success");
  const msgTimerRef = useRef(null);

  const [estadoFiltro, setEstadoFiltro] = useState("TODOS");
  const [idFiltro, setIdFiltro] = useState("");
  const [fechaFiltro, setFechaFiltro] = useState("");
  const [solicitanteFiltro, setSolicitanteFiltro] = useState("");
  const [textoFiltro, setTextoFiltro] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editQty, setEditQty] = useState({});
  const [editSearch, setEditSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [imprimirOpen, setImprimirOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});

  const role = me?.rol || me?.role;
  // Proveedor es estrictamente de lectura: no edita ni cancela ni crea.
  const isProveedor = role === "proveedor";
  const isReadOnly = role === "tecnico" || role === "gestor_vivero" || isProveedor;
  const isAdmin = role === "admin";

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

  useEffect(() => {
    refrescar();
    return () => clearMsgTimer();
  }, []);

  const solicitanteFromPedido = (p) =>
    formatUsername(
      p?.solicitante_username || p?.solicitante || p?.created_by || p?.usuario || p?.username || ""
    ) || "—";

  // Lista única de solicitantes presentes en los pedidos actuales.
  // Cada entrada: { value: "medina", label: "Medina" }.
  const solicitantesDisponibles = useMemo(() => {
    if (!Array.isArray(pedidos)) return [];
    const seen = new Map();
    for (const p of pedidos) {
      const raw = String(
        p?.solicitante_username ||
          p?.solicitante ||
          p?.created_by ||
          p?.usuario ||
          p?.username ||
          ""
      ).trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, { value: key, label: formatUsername(raw) });
      }
    }
    return [...seen.values()].sort((a, b) =>
      a.label.localeCompare(b.label, "es")
    );
  }, [pedidos]);

  const refrescar = async () => {
    setLoading(true);
    clearMsgTimer();
    setMsg("");

    try {
      // El rol 'proveedor' es de SOLO consulta y no tiene permiso sobre
      // /productos ni /movimientos (devolverían 403). Para ese rol solo
      // pedimos /pedidos; el resto de roles pide los tres en paralelo.
      // Usamos Promise.allSettled para que un fallo aislado en productos
      // o movimientos no aborte la carga de pedidos (antes Promise.all
      // hacía que un 403 vaciara toda la lista).
      if (isProveedor) {
        const peds = await getPedidos();
        setProductos([]);
        setMovimientos([]);
        setPedidos(safeArray(peds));
      } else {
        const [prodsRes, movsRes, pedsRes] = await Promise.allSettled([
          getProductos(),
          getMovimientos(),
          getPedidos(),
        ]);
        if (prodsRes.status === "fulfilled") setProductos(safeArray(prodsRes.value));
        if (movsRes.status === "fulfilled") setMovimientos(safeArray(movsRes.value));
        if (pedsRes.status === "fulfilled") {
          setPedidos(safeArray(pedsRes.value));
        } else {
          // Si lo único que ha fallado es /pedidos sí avisamos al usuario.
          const e = pedsRes.reason;
          showTimedMessage(
            e?.response?.data?.detail || e?.message || "Error cargando pedidos",
            "error"
          );
        }
      }
    } catch (e) {
      showTimedMessage(
        e?.response?.data?.detail || e?.message || "Error cargando pedidos",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  // Para crear pedidos usamos el stock DISPONIBLE que da el backend
  // (= stock real − reservado por otros pedidos vivos), no el derivado de
  // movimientos. Así la interfaz coincide con la validación del servidor y no
  // deja pedir lo que ya está comprometido en otro pedido.
  const stockByProductSize = useMemo(() => {
    const m = new Map();
    for (const p of (Array.isArray(productos) ? productos : [])) {
      const disp = p?.disponible_by_size || p?.stock_by_size || {};
      for (const [tam, qty] of Object.entries(disp)) {
        m.set(lineKey(p.id, tam), Math.max(0, Number(qty || 0)));
      }
    }
    return m;
  }, [productos]);

  const productosConStock = useMemo(() => {
    return productos
      .map((p) => {
        // Opciones válidas por categoría del producto.
        const formatoOptions = getFormatoOptions(getProductFormatoConfig(p));
        const stockBySize = {};
        formatoOptions.forEach((t) => {
          stockBySize[t] = Math.max(0, Number(stockByProductSize.get(lineKey(p.id, t)) || 0));
        });
        return { ...p, _stockBySize: stockBySize, _formatoOptions: formatoOptions };
      })
      .filter((p) => (p._formatoOptions || []).some((t) => Number(p._stockBySize[t] || 0) > 0));
  }, [productos, stockByProductSize]);

  const mapProdName = useMemo(() => {
    const m = new Map();
    for (const p of productos) {
      m.set(p.id, getScientificProductDisplayName(p));
    }
    return m;
  }, [productos]);

  const handleCreatePedidoFromModal = async (payload) => {
    setSavingNewPedido(true);

    try {
      const created = await createPedido(payload);
      setModalOpen(false);
      // El pedido recién creado entra en RESERVA. Si había un filtro de estado
      // activo (p.ej. "Aprobado"), el nuevo pedido no se vería. Reseteamos a
      // "Todos" para que siempre aparezca tras crearlo.
      setEstadoFiltro("TODOS");
      await refrescar();
      // If the backend surfaced any email-delivery warnings (e.g. a
      // manager without email registered), show them as a soft notice
      // RIGHT AFTER the success message so the user knows what didn't go
      // through, without making the create flow look like it failed.
      const warns = Array.isArray(created?.email_warnings) ? created.email_warnings : [];
      if (warns.length) {
        showTimedMessage(
          `Pedido creado. Aviso: ${warns.join(" · ")}`,
          "warning"
        );
      } else {
        showTimedMessage("Pedido creado correctamente.", "success");
      }
    } catch (e) {
      showTimedMessage(
        e?.response?.data?.detail || e?.message || "Error creando pedido",
        "error"
      );
    } finally {
      setSavingNewPedido(false);
    }
  };

  const puedeEditarCancelar = (p) => {
    const estado = estadoNormalizado(p?.estado);

    if (
      estado === "APROBADO" ||
      estado === "DENEGADO" ||
      estado === "SERVIDO" ||
      estado === "CANCELADO" ||
      estado === "CADUCADO"
    ) {
      return false;
    }

    if (isReadOnly) return false;
    if (isAdmin) return estado === "RESERVA";

    const solicitante = solicitanteFromPedido(p);
    const soyYo = solicitante && me?.username && solicitante === me.username;
    return role === "empresa_externa" && estado === "RESERVA" && soyYo;
  };

  const onCancelar = async (p) => {
    try {
      await cancelarPedido(p.id);
      await refrescar();
      showTimedMessage("Pedido cancelado.", "success");
    } catch (e) {
      showTimedMessage(
        e?.response?.data?.detail || e?.message || "Error cancelando pedido",
        "error"
      );
    }
  };

  const startEdit = (p) => {
    const items = safeArray(p.items);
    const map = {};
    items.forEach((it) => {
      const pid = it.producto_id;
      const tam = it.tamano || "M12";
      const cantidad = Number(it.cantidad ?? 0);
      if (pid) map[lineKey(pid, tam)] = cantidad;
    });
    setEditQty(map);
    setEditSearch("");
    setEditingId(p.id);
    setMsg("");
  };

  const stopEdit = () => {
    setEditingId(null);
    setEditQty({});
    setEditSearch("");
  };

  const onGuardarEdicion = async (pedidoId) => {
    try {
      const pedidoOriginal = pedidos.find((p) => p.id === pedidoId);

      const items = Object.entries(editQty)
        .map(([key, cantidad]) => {
          const parsed = parseLineKey(key);
          return {
            producto_id: parsed.producto_id,
            tamano: parsed.tamano,
            cantidad: Number(cantidad),
          };
        })
        .filter((x) => x.cantidad > 0 && Number.isFinite(x.producto_id) && x.tamano);

      await updatePedido(pedidoId, {
        items,
        distrito_destino: pedidoOriginal?.distrito_destino || null,
        barrio_destino: pedidoOriginal?.barrio_destino || null,
        direccion_destino: pedidoOriginal?.direccion_destino || null,
      });

      stopEdit();
      await refrescar();
      showTimedMessage("Pedido actualizado correctamente.", "success");
    } catch (e) {
      showTimedMessage(
        e?.response?.data?.detail || e?.message || "Error actualizando pedido",
        "error"
      );
    }
  };

  const productosDisponiblesParaEdicion = useMemo(() => {
    const texto = editSearch.trim().toLowerCase();
    return productosConStock.filter((p) => {
      const nombreCientifico = String(p?.nombre_cientifico || p?.producto_nombre_cientifico || "").toLowerCase();
      const categoria = String(p?.categoria || "").toLowerCase();
      const subcategoria = String(p?.subcategoria || "").toLowerCase();
      return !texto || nombreCientifico.includes(texto) || categoria.includes(texto) || subcategoria.includes(texto);
    });
  }, [productosConStock, editSearch]);

  const pedidosFiltrados = useMemo(() => {
    const texto = textoFiltro.trim().toLowerCase();
    const esEmpresaExterna = role === "empresa_externa";

    return pedidos
      .slice()
      .filter((p) => {
        if (!esEmpresaExterna) return true;
        // Defensa en frontend: oculta reposición y pedidos que no son suyos.
        // Comparamos el username CRUDO (no el formateado para mostrar) y sin
        // distinguir mayúsculas: el backend guarda "medina" pero formatUsername
        // devolvería "Medina", lo que dejaba la lista vacía a la empresa externa.
        const tipo = String(p?.tipo || "salida").toLowerCase();
        if (tipo === "reposicion") return false;
        const solicitanteRaw = String(
          p?.solicitante_username || p?.solicitante || p?.created_by || p?.usuario || p?.username || ""
        ).trim().toLowerCase();
        const miUsuario = String(me?.username || "").trim().toLowerCase();
        return !!miUsuario && solicitanteRaw === miUsuario;
      })
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .filter((p) => {
        const idOk = !idFiltro || String(p.id).includes(String(idFiltro).trim());
        const estadoOk = estadoFiltro === "TODOS" || estadoNormalizado(p?.estado) === estadoFiltro;
        const fechaOk = !fechaFiltro || dateInputValue(p?.created_at) === fechaFiltro;

        const solicitante = solicitanteFromPedido(p).toLowerCase();
        const solicitanteOk =
          !solicitanteFiltro ||
          solicitante === solicitanteFiltro.trim().toLowerCase();

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

        const destinoTxt = `${p?.distrito_destino || ""} ${p?.barrio_destino || ""} ${p?.direccion_destino || ""}`.toLowerCase();

        const textoOk =
          !texto ||
          String(p.id).toLowerCase().includes(texto) ||
          solicitante.includes(texto) ||
          estadoNormalizado(p?.estado).toLowerCase().includes(texto) ||
          detalle.includes(texto) ||
          destinoTxt.includes(texto);

        return idOk && estadoOk && fechaOk && solicitanteOk && textoOk;
      });
  }, [pedidos, estadoFiltro, idFiltro, fechaFiltro, solicitanteFiltro, textoFiltro, mapProdName]);

  const toggleExpanded = (pedidoId) => {
    setExpandedRows((prev) => ({
      ...prev,
      [pedidoId]: !prev[pedidoId],
    }));
  };

  const clearFilters = () => {
    setEstadoFiltro("TODOS");
    setIdFiltro("");
    setFechaFiltro("");
    setSolicitanteFiltro("");
    setTextoFiltro("");
  };

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 44, margin: 0, fontWeight: 900, color: "#0f172a" }}>
            {isProveedor ? "Pedidos de reposición" : "Pedidos"}
          </h1>
          <div style={{ marginTop: 8, color: "#64748b", fontWeight: 700 }}>
            {isProveedor
              ? "Listado de pedidos de reposición aprobados. Descarga o imprime el PDF para servir cada pedido."
              : "Crea y gestiona pedidos con control de stock y destino final."}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {!isReadOnly && (
            <button
              onClick={() => setModalOpen(true)}
              style={primaryBtn(false)}
            >
              Nuevo pedido
            </button>
          )}

          <button
            onClick={() => setImprimirOpen(true)}
            style={{
              padding: "12px 16px",
              borderRadius: 14,
              border: "1px solid rgba(59,130,246,0.30)",
              background: "rgba(59,130,246,0.08)",
              color: "#1d4ed8",
              fontWeight: 900,
              cursor: "pointer",
            }}
            title="Imprimir uno o varios pedidos"
          >
            Imprimir pedido
          </button>

          <div style={{ fontWeight: 800, color: "#64748b" }}>
            Usuario: <span style={{ color: "#0f172a" }}>{me?.username || "—"}</span> · Rol:{" "}
            <span style={{ color: "#0f172a" }}>{role || "—"}</span>
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

      <div
        style={{
          ...cardStyle(),
          marginTop: 16,
          padding: 16,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a", marginBottom: 14 }}>
          Lista de pedidos
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "140px 170px 180px 170px 1fr auto",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <input
            placeholder="Filtrar por ID"
            value={idFiltro}
            onChange={(e) => setIdFiltro(e.target.value)}
            style={softInputStyle()}
          />

          <select
            value={estadoFiltro}
            onChange={(e) => setEstadoFiltro(e.target.value)}
            style={softInputStyle()}
          >
            {ESTADO_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={fechaFiltro}
            onChange={(e) => setFechaFiltro(e.target.value)}
            style={softInputStyle()}
          />

          <select
            value={solicitanteFiltro}
            onChange={(e) => setSolicitanteFiltro(e.target.value)}
            style={softInputStyle()}
            disabled={solicitantesDisponibles.length === 0}
            aria-label="Filtrar por solicitante"
          >
            {solicitantesDisponibles.length === 0 ? (
              <option value="">No hay solicitantes</option>
            ) : (
              <>
                <option value="">Todos los solicitantes</option>
                {solicitantesDisponibles.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </>
            )}
          </select>

          <input
            placeholder="Buscar en detalle o destino..."
            value={textoFiltro}
            onChange={(e) => setTextoFiltro(e.target.value)}
            style={softInputStyle()}
          />

          <button onClick={clearFilters} style={actionBtn(true)}>
            Limpiar
          </button>
        </div>

        {loading ? (
          <div style={{ color: "#64748b", fontWeight: 800 }}>Cargando…</div>
        ) : pedidosFiltrados.length === 0 ? (
          <div style={{ color: "#64748b", fontWeight: 800 }}>No hay pedidos para los filtros seleccionados.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 10px", minWidth: 1180 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={thStyle()}>ID</th>
                  <th style={thStyle()}>Tipo</th>
                  <th style={thStyle()}>Pedido</th>
                  <th style={thStyle()}>Caduca</th>
                  <th style={thStyle()}>Solicitante</th>
                  <th style={thStyle()}>Destino</th>
                  <th style={{ ...thStyle(), minWidth: 320 }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 80px 70px",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <div>Producto</div>
                      <div style={{ textAlign: "center" }}>Tamaño</div>
                      <div style={{ textAlign: "right" }}>Cantidad</div>
                    </div>
                  </th>
                  <th style={thStyle()}>Estado</th>
                  <th style={thStyle()}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pedidosFiltrados.map((p) => {
                  const estado = p.estado || "RESERVA";
                  const canEditCancel = puedeEditarCancelar(p);
                  const expanded = !!expandedRows[p.id];

                  return (
                    <tr
                      key={p.id}
                      style={{
                        background: "white",
                        boxShadow: "0 6px 18px rgba(2,6,23,0.05)",
                      }}
                    >
                      <td
                        style={{
                          ...tdStyle(),
                          borderTop: "1px solid rgba(15,23,42,0.10)",
                          borderBottom: "1px solid rgba(15,23,42,0.10)",
                          borderLeft: "1px solid rgba(15,23,42,0.10)",
                          borderTopLeftRadius: 14,
                          borderBottomLeftRadius: 14,
                          whiteSpace: "nowrap",
                        }}
                      >
                        #{p.id}
                      </td>

                      <td style={{ ...tdStyle(), borderTop: "1px solid rgba(15,23,42,0.10)", borderBottom: "1px solid rgba(15,23,42,0.10)" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            padding: "4px 10px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 900,
                            background: (p.tipo === "reposicion") ? "rgba(245,158,11,0.12)" : "rgba(59,130,246,0.10)",
                            color: (p.tipo === "reposicion") ? "#92400e" : "#1e3a8a",
                            border: "1px solid rgba(15,23,42,0.08)",
                          }}
                        >
                          {p.tipo === "reposicion" ? "Reposición" : "Salida"}
                        </span>
                      </td>

                      <td style={{ ...tdStyle(), borderTop: "1px solid rgba(15,23,42,0.10)", borderBottom: "1px solid rgba(15,23,42,0.10)" }}>
                        {fmtFechaES(p.created_at)}
                      </td>

                      <td
                        style={{
                          ...tdStyle(),
                          borderTop: "1px solid rgba(15,23,42,0.10)",
                          borderBottom: "1px solid rgba(15,23,42,0.10)",
                          color: "#b91c1c",
                          fontWeight: 900,
                        }}
                      >
                        {(() => {
                          // La caducidad no aplica a pedidos cerrados (servido,
                          // denegado, cancelado o caducado).
                          const e = String(p.estado || "").toUpperCase();
                          const cerrado = ["SERVIDO", "DENEGADO", "CANCELADO", "CADUCADO"].includes(e);
                          const fc = cerrado ? null : getPedidoFechaCaducidad(p);
                          return fc ? fmtFechaES(fc) : <span style={{ color: "#94a3b8", fontWeight: 700 }}>—</span>;
                        })()}
                      </td>

                      <td style={{ ...tdStyle(), borderTop: "1px solid rgba(15,23,42,0.10)", borderBottom: "1px solid rgba(15,23,42,0.10)" }}>
                        {solicitanteFromPedido(p)}
                      </td>

                      <td
                        style={{
                          ...tdStyle(),
                          borderTop: "1px solid rgba(15,23,42,0.10)",
                          borderBottom: "1px solid rgba(15,23,42,0.10)",
                          // Cap the column width so a long address wraps
                          // instead of pushing the rest of the row right.
                          maxWidth: 220,
                          minWidth: 140,
                          whiteSpace: "normal",
                          wordBreak: "break-word",
                          lineHeight: 1.3,
                        }}
                      >
                        {p?.tipo === "reposicion" ? (
                          <span style={{ fontWeight: 900, color: "#065f46" }}>Vivero</span>
                        ) : (() => {
                          // Si el pedido reparte en varios destinos distintos
                          // (según sus líneas), lo indicamos en vez del primero.
                          const dset = new Set(
                            safeArray(p?.items)
                              .map((it) => [it.distrito_destino, it.barrio_destino, it.direccion_destino].filter(Boolean).join(" · "))
                              .filter(Boolean)
                          );
                          return dset.size > 1 ? (
                            <span style={{ fontWeight: 900, color: "#1e3a8a" }}>Múltiples destinos ({dset.size})</span>
                          ) : (
                            <DestinoResumen
                              distrito={p?.distrito_destino}
                              barrio={p?.barrio_destino}
                              direccion={p?.direccion_destino}
                            />
                          );
                        })()}
                      </td>

                      <td
                        style={{
                          ...tdStyle(),
                          borderTop: "1px solid rgba(15,23,42,0.10)",
                          borderBottom: "1px solid rgba(15,23,42,0.10)",
                          minWidth: 380,
                        }}
                      >
                        <PedidoDetalleCellOld
                          pedido={p}
                          mapProdName={mapProdName}
                          expanded={expanded}
                          toggleExpanded={toggleExpanded}
                          editingId={editingId}
                          editQty={editQty}
                          setEditQty={setEditQty}
                          editSearch={editSearch}
                          setEditSearch={setEditSearch}
                          productosDisponiblesParaEdicion={productosDisponiblesParaEdicion}
                        />
                      </td>

                      <td style={{ ...tdStyle(), borderTop: "1px solid rgba(15,23,42,0.10)", borderBottom: "1px solid rgba(15,23,42,0.10)", whiteSpace: "nowrap" }}>
                        {(() => {
                          const e = estadoNormalizado(estado);
                          let color = "#92400e"; // reserva/default ámbar
                          if (e === "APROBADO") color = "#065f46";
                          else if (e === "APROBADO_PARCIAL") color = "#115e59";
                          else if (e === "DENEGADO") color = "#991b1b";
                          else if (e === "SERVIDO") color = "#1e3a8a";
                          else if (e === "CANCELADO") color = "#334155";
                          else if (e === "CADUCADO") color = "#475569";
                          return <span style={{ fontWeight: 900, color, fontSize: 13 }}>{estadoLabel(estado)}</span>;
                        })()}
                      </td>

                      <td
                        style={{
                          ...tdStyle(),
                          borderTop: "1px solid rgba(15,23,42,0.10)",
                          borderBottom: "1px solid rgba(15,23,42,0.10)",
                          borderRight: "1px solid rgba(15,23,42,0.10)",
                          borderTopRightRadius: 14,
                          borderBottomRightRadius: 14,
                          minWidth: 220,
                        }}
                      >
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {canEditCancel && editingId !== p.id ? (
                            <>
                              {!isReadOnly && (
                                <button onClick={() => startEdit(p)} style={actionBtn(true)}>
                                  Editar
                                </button>
                              )}
                              {!isReadOnly && (
                                <button onClick={() => onCancelar(p)} style={dangerBtn(true)}>
                                  Cancelar
                                </button>
                              )}
                            </>
                          ) : null}

                          {canEditCancel && editingId === p.id ? (
                            <>
                              <button onClick={() => onGuardarEdicion(p.id)} style={primaryBtn(false)}>
                                Guardar
                              </button>
                              <button onClick={stopEdit} style={actionBtn(true)}>
                                Cerrar
                              </button>
                            </>
                          ) : null}

                          {/* Descarga del PDF "oficial" del pedido.  Disponible
                              en cualquier estado decidido (APROBADO, APROBADO_PARCIAL,
                              SERVIDO o DENEGADO) — incluso para los denegados,
                              porque el PDF lleva motivo de denegación + detalle
                              de líneas y sirve como registro de auditoría. */}
                          {(() => {
                            const e = estadoNormalizado(estado);
                            const puedePdf =
                              e === "APROBADO" ||
                              e === "APROBADO_PARCIAL" ||
                              e === "SERVIDO" ||
                              e === "DENEGADO";
                            if (!puedePdf) return null;
                            return (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await descargarPedidoPdf(p.id);
                                  } catch (err) {
                                    showTimedMessage(
                                      err?.response?.data?.detail || err?.message || "No se pudo descargar el PDF",
                                      "error"
                                    );
                                  }
                                }}
                                title="Descargar PDF del pedido aprobado"
                                style={{
                                  padding: "8px 12px",
                                  borderRadius: 12,
                                  border: "1px solid rgba(16,185,129,0.35)",
                                  background: "rgba(16,185,129,0.10)",
                                  color: "#065f46",
                                  fontWeight: 900,
                                  cursor: "pointer",
                                  fontSize: 13,
                                }}
                              >
                                📄 PDF
                              </button>
                            );
                          })()}

                          {(() => {
                            // Show the "—" placeholder ONLY when there are
                            // truly no actions to render: can't edit/cancel
                            // and no PDF available either.  PDF is now available
                            // in any decided state (including DENEGADO).
                            const e = estadoNormalizado(estado);
                            const hasPdf =
                              e === "APROBADO" ||
                              e === "APROBADO_PARCIAL" ||
                              e === "SERVIDO" ||
                              e === "DENEGADO";
                            if (canEditCancel || hasPdf) return null;
                            return <span style={{ color: "#94a3b8", fontWeight: 800 }}>—</span>;
                          })()}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PedidoModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        productos={productos}
        stockByProductSize={stockByProductSize}
        onSubmit={handleCreatePedidoFromModal}
        saving={savingNewPedido}
        esEmpresaExterna={role === "empresa_externa"}
      />

      <ImprimirPedidosModal
        open={imprimirOpen}
        pedidos={pedidos}
        mapProdName={mapProdName}
        onClose={() => setImprimirOpen(false)}
      />
    </div>
  );
}