/**
 * GENERACIÓN DE PDF DE LOS INFORMES.
 *
 * Extraído de `Informes.jsx@cd959e7` SIN cambiar una línea. El motivo es el
 * riesgo concreto que señaló la auditoría: las 23 llamadas a `autoTable`
 * comparten arrays y criterios de formato con las tablas que se pintan en
 * pantalla, así que un rediseño de la interfaz podía alterar en silencio el
 * orden de las columnas de un PDF que ya está en uso.
 *
 * Sacarlo aquí permite fijar ese contrato ANTES de tocar nada:
 * `informes.pdf.contract.test.js` ejecuta los diez informes contra datos fijos,
 * intercepta cada llamada a `autoTable` y comprueba la cabecera exacta, el
 * orden de las columnas y el contenido de las celdas. Las pruebas de mutación
 * confirman que reordenar o renombrar una columna hace fallar el contrato.
 *
 * REGLA: este fichero no se «mejora». Si algo de aquí cambia, cambia un
 * documento que un ayuntamiento archiva.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import logoViverApp from "../assets/logo.png";
import {
  ESTADO_STOCK_LABEL,
  fmtCantInv,
  fmtEuro,
  fmtFecha,
  fmtFechaSolo,
  fmtMesLabel,
  fmtNum,
  sanitizeFileName,
} from "./informes.format";

/*
 * Etiquetas del filtro de estado de existencias. Se copia aquí porque el
 * generador la usa para el bloque de filtros del informe «Existencias»; la
 * pantalla mantiene la suya. Duplicar cuatro cadenas es preferible a que el
 * módulo de PDF dependa del componente de interfaz.
 */
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

export async function exportReportToPdf({
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
