/**
 * GENERACIÓN DE PDF E IMPRESIÓN DE PEDIDOS.
 *
 * Extraído de `Pedidos.jsx@1767485` SIN cambiar una línea. Mismo riesgo que
 * Informes: la maquetación comparte criterios de formato con la pantalla, así
 * que un rediseño podía alterar en silencio un documento que se imprime y se
 * archiva.
 *
 * `pedidos.pdf.contract.test.js` fija el contrato ANTES de tocar nada: número
 * de tablas, cabecera exacta, contenido de las celdas y nombre de fichero.
 *
 * REGLA: este fichero no se «mejora». Si algo cambia aquí, cambia un documento
 * que alguien archiva en un ayuntamiento.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import logoViverApp from "../assets/logo.png";
import { formatFechaCanaria } from "../utils/fecha";
import { formatUsername } from "../utils/format";
import { sanitizeFileName } from "./pedidos.logic";

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
    try {
      doc.addImage(logoDataUrl, "PNG", pageWidth - 42, 1, 32, 32);
    } catch {
      // Sin logotipo el comprobante sigue siendo válido: no se aborta.
    }
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
export async function buildPedidosPdf(pedidos, mapProdName) {
  const doc = new jsPDF("p", "mm", "a4");
  const logoDataUrl = await loadImageAsDataUrl(logoViverApp);
  for (let i = 0; i < pedidos.length; i += 1) {
    await renderPedidoEnPdf(doc, pedidos[i], mapProdName, i === 0, logoDataUrl);
  }
  addFootersToAllPages(doc);
  return doc;
}

// Guarda los pedidos como PDF (descarga directa).
export async function guardarPedidosPdf(pedidos, mapProdName) {
  if (!pedidos.length) return;
  const doc = await buildPedidosPdf(pedidos, mapProdName);
  const fileName =
    pedidos.length === 1
      ? `${sanitizeFileName(`pedido_${pedidos[0].id}`)}_${new Date().toISOString().slice(0, 10)}.pdf`
      : `pedidos_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}

// Abre el diálogo nativo de impresión (impresora física o "Guardar como PDF").
export async function imprimirPedidosEnNavegador(pedidos, mapProdName) {
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
