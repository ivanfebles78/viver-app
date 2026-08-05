"""
Generador de PDF para pedidos aprobados (módulo de impresión).

Diseño minimalista con cabecera del ayuntamiento, datos del solicitante,
fechas de cada operación (creación, aprobación, servido), detalle de items
y dirección de entrega. Genera el PDF en memoria y lo devuelve como bytes,
listo para servir desde FastAPI con `Response(content=..., media_type=...)`.
"""
from __future__ import annotations

from datetime import datetime
from io import BytesIO
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
)


# Dirección del vivero (fija por ahora; cuando exista un segundo vivero,
# convertirla en una columna del pedido).
DIRECCION_VIVERO = "Calle José Fonspertius, 1 · Barrio La Salud · 38008 Santa Cruz de Tenerife"

# Paleta corporativa coherente con la UI
COLOR_PRIMARIO = colors.HexColor("#065F46")  # verde
COLOR_SECUNDARIO = colors.HexColor("#0F172A")  # casi negro
COLOR_GRIS = colors.HexColor("#64748B")
COLOR_GRIS_FONDO = colors.HexColor("#F1F5F9")
COLOR_BORDE = colors.HexColor("#CBD5E1")

# Per-item state colours.  Same logic as the UI badges — green for
# APROBADO, ámbar for RESERVA (pendiente), rojo for DENEGADO.
COLOR_APROBADO_BG = colors.HexColor("#DCFCE7")   # green-100
COLOR_APROBADO_FG = colors.HexColor("#065F46")   # green-800
COLOR_RESERVA_BG  = colors.HexColor("#FEF3C7")   # amber-100
COLOR_RESERVA_FG  = colors.HexColor("#92400E")   # amber-800
COLOR_DENEGADO_BG = colors.HexColor("#FEE2E2")   # red-100
COLOR_DENEGADO_FG = colors.HexColor("#991B1B")   # red-800

# Colores intensos y distintos por destino (coherentes con la UI), para
# diferenciar bien cada destino cuando el pedido reparte en varios.
DESTINO_PALETTE = [
    colors.HexColor("#1E3A8A"),
    colors.HexColor("#065F46"),
    colors.HexColor("#9A3412"),
    colors.HexColor("#6B21A8"),
    colors.HexColor("#155E75"),
    colors.HexColor("#9F1239"),
    colors.HexColor("#3F6212"),
    colors.HexColor("#854D0E"),
    colors.HexColor("#5B21B6"),
    colors.HexColor("#0F766E"),
]


def _item_estado_label(estado_item: Optional[str]) -> tuple[str, "colors.Color", "colors.Color"]:
    """Map a per-item state to (label, background, foreground) for the PDF
    cell.  Legacy data without `estado_item` is treated as Aprobado, because
    the pedido must already be APROBADO/SERVIDO to be reaching the PDF
    endpoint at all.
    """
    e = (str(estado_item or "APROBADO").strip().upper())
    if e == "APROBADO":
        return ("Aprobado", COLOR_APROBADO_BG, COLOR_APROBADO_FG)
    if e == "DENEGADO":
        return ("Denegado", COLOR_DENEGADO_BG, COLOR_DENEGADO_FG)
    # RESERVA y cualquier otro estado intermedio → pendiente
    return ("Pendiente", COLOR_RESERVA_BG, COLOR_RESERVA_FG)


def _fmt_fecha(value) -> str:
    """Formato 'dd/mm/aaaa HH:MM' para datetimes; '—' si vacío."""
    if not value:
        return "—"
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y %H:%M")
    return str(value)


def _fmt_cantidad(value) -> str:
    if value is None:
        return "0"
    try:
        f = float(value)
        if f == int(f):
            return str(int(f))
        s = f"{f:.2f}".rstrip("0").rstrip(".")
        return s
    except (TypeError, ValueError):
        return str(value)


def _unidad_para_categoria(categoria: Optional[str], tamano: Optional[str]) -> str:
    """Calcula el sufijo de unidad alineado con `formato.js` del frontend."""
    cat = (categoria or "").strip().lower()
    t = (tamano or "").strip().lower()

    if cat in ("planta", "plantas"):
        return "ud"
    if cat in ("fitosanitario", "fitosanitarios", "fertilizante", "fertilizantes"):
        return "lt" if "liquido" in t or "líquido" in t else "kg"
    if cat in ("arido", "aridos", "árido", "áridos", "material vegetal", "materiales vegetales"):
        return "m³"
    if cat == "ferreteria" or cat == "ferretería":
        return "m" if t == "metros" else "ud"
    return "ud"


def generar_pdf_pedido(pedido, viewer_role: Optional[str] = None) -> bytes:
    """
    Construye el PDF del pedido y devuelve los bytes.

    `pedido` es la instancia ORM de Pedido (con .items cargados). Accede a
    atributos directamente; no asume ningún serializer intermedio para
    poder mostrar campos que no salen al JSON de la API.
    """
    buf = BytesIO()

    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=f"Pedido #{getattr(pedido, 'id', '?')}",
        author="ViverApp",
    )

    styles = getSampleStyleSheet()
    style_title = ParagraphStyle(
        "TitulosViverApp",
        parent=styles["Title"],
        fontSize=20,
        textColor=COLOR_PRIMARIO,
        spaceAfter=4,
        alignment=0,  # left
    )
    style_subtitle = ParagraphStyle(
        "SubtitleViverApp",
        parent=styles["Normal"],
        fontSize=10,
        textColor=COLOR_GRIS,
        spaceAfter=12,
    )
    style_h2 = ParagraphStyle(
        "H2ViverApp",
        parent=styles["Heading2"],
        fontSize=12,
        textColor=COLOR_SECUNDARIO,
        spaceBefore=10,
        spaceAfter=4,
    )
    style_body = ParagraphStyle(
        "BodyViverApp",
        parent=styles["Normal"],
        fontSize=10,
        textColor=COLOR_SECUNDARIO,
        leading=14,
    )
    style_small = ParagraphStyle(
        "SmallViverApp",
        parent=styles["Normal"],
        fontSize=8.5,
        textColor=COLOR_GRIS,
    )

    story = []

    # ===== Cabecera =====
    story.append(Paragraph(
        f"Pedido #{getattr(pedido, 'id', '—')} · "
        f"{(getattr(pedido, 'tipo', '') or 'salida').capitalize()}",
        style_title,
    ))
    story.append(Paragraph(
        "Ayuntamiento de Santa Cruz de Tenerife · ViverApp",
        style_subtitle,
    ))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_BORDE))
    story.append(Spacer(1, 10))

    # ===== Bloque: información + cronología (compacto, 2 columnas) =====
    def _c(v):
        return str(v if (v is not None and str(v) != "") else "—")

    info_crono = [
        ["Estado", _c(getattr(pedido, "estado", "")), "Creado", _fmt_fecha(getattr(pedido, "created_at", None))],
        ["Tipo", _c(getattr(pedido, "tipo", "")).capitalize(), "Aprobado", _fmt_fecha(getattr(pedido, "aprobado_at", None))],
        ["Solicitante", _c(getattr(pedido, "solicitante_username", "") or getattr(pedido, "created_by", "")), "Servido", _fmt_fecha(getattr(pedido, "served_at", None))],
        ["Aprobado por", _c(getattr(pedido, "aprobado_por", "")), "Denegado", _fmt_fecha(getattr(pedido, "denegado_at", None))],
        ["Servido por", _c(getattr(pedido, "served_by", "")), "Caducidad", _fmt_fecha(getattr(pedido, "fecha_caducidad", None))],
    ]
    t_info = Table(info_crono, colWidths=[30 * mm, 55 * mm, 28 * mm, 62 * mm])
    t_info.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), COLOR_GRIS_FONDO),
        ("BACKGROUND", (2, 0), (2, -1), COLOR_GRIS_FONDO),
        ("TEXTCOLOR", (0, 0), (0, -1), COLOR_GRIS),
        ("TEXTCOLOR", (2, 0), (2, -1), COLOR_GRIS),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
        ("FONTNAME", (3, 0), (3, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("GRID", (0, 0), (-1, -1), 0.4, COLOR_BORDE),
    ]))
    story.append(t_info)
    story.append(Spacer(1, 12))

    # ===== Bloque: items AGRUPADOS por destino =====
    story.append(Paragraph("Detalle del pedido por destino", style_h2))
    tipo = (getattr(pedido, "tipo", "") or "salida").strip().lower()
    items = getattr(pedido, "items", []) or []
    # Para el PDF de un proveedor ocultamos las líneas denegadas o pendientes.
    role = (viewer_role or "").strip().lower()
    if role == "proveedor":
        items = [
            it for it in items
            if (str(getattr(it, "estado_item", None) or "APROBADO").strip().upper()
                in ("APROBADO", "SERVIDO"))
        ]

    def _destino_de_item(it) -> str:
        if tipo == "reposicion":
            return DIRECCION_VIVERO
        partes = [
            getattr(it, "distrito_destino", None) or getattr(pedido, "distrito_destino", None) or "",
            getattr(it, "barrio_destino", None) or getattr(pedido, "barrio_destino", None) or "",
            getattr(it, "direccion_destino", None) or getattr(pedido, "direccion_destino", None) or "",
        ]
        return " · ".join(p for p in partes if p) or "—"

    if not items:
        story.append(Paragraph("Sin líneas en el pedido.", style_body))
    else:
        # ¿Aprobación parcial? (mezcla de estados) → columna Estado + resumen.
        all_labels = set()
        n_aprobado = n_reserva = n_denegado = 0
        for it in items:
            label, _, _ = _item_estado_label(getattr(it, "estado_item", None))
            all_labels.add(label)
            if label == "Aprobado":
                n_aprobado += 1
            elif label == "Denegado":
                n_denegado += 1
            else:
                n_reserva += 1
        is_partial = len(all_labels) > 1

        if is_partial:
            resumen_parts = []
            if n_aprobado: resumen_parts.append(f"<b><font color='#065F46'>{n_aprobado} aprobado{'s' if n_aprobado != 1 else ''}</font></b>")
            if n_reserva:  resumen_parts.append(f"<b><font color='#92400E'>{n_reserva} pendiente{'s' if n_reserva != 1 else ''}</font></b>")
            if n_denegado: resumen_parts.append(f"<b><font color='#991B1B'>{n_denegado} denegado{'s' if n_denegado != 1 else ''}</font></b>")
            story.append(Paragraph(
                "Este pedido tiene aprobación parcial: " + " · ".join(resumen_parts) + ".",
                style_body,
            ))
            story.append(Spacer(1, 6))

        # Agrupar por destino (orden de aparición).
        orden_destinos = []
        grupos = {}
        for it in items:
            dst = _destino_de_item(it)
            if dst not in grupos:
                grupos[dst] = []
                orden_destinos.append(dst)
            grupos[dst].append(it)

        for gi, dst in enumerate(orden_destinos):
            grupo_items = grupos[dst]
            color = DESTINO_PALETTE[gi % len(DESTINO_PALETTE)]

            # Barra de cabecera del destino (color intenso).
            barra = Table([[f"Destino: {dst}"]], colWidths=[175 * mm])
            barra.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), color),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]))
            story.append(barra)

            if is_partial:
                data = [["#", "Producto", "Tamaño", "Cantidad", "Servida", "Estado"]]
                col_widths = [10 * mm, 56 * mm, 30 * mm, 26 * mm, 26 * mm, 27 * mm]
            else:
                data = [["#", "Producto", "Tamaño", "Cantidad", "Servida"]]
                col_widths = [10 * mm, 70 * mm, 35 * mm, 30 * mm, 30 * mm]

            per_row_styles = []
            for idx, item in enumerate(grupo_items, start=1):
                prod = getattr(item, "producto", None)
                nombre = getattr(prod, "nombre_cientifico", None) or getattr(prod, "nombre_natural", None) or f"#{getattr(item, 'producto_id', '?')}"
                categoria = getattr(prod, "categoria", None)
                tam = getattr(item, "tamano", None) or "—"
                unidad = _unidad_para_categoria(categoria, tam)
                cantidad = f"{_fmt_cantidad(item.cantidad)} {unidad}"
                servida = f"{_fmt_cantidad(item.cantidad_servida)} {unidad}"
                label, bg, fg = _item_estado_label(getattr(item, "estado_item", None))
                if is_partial:
                    data.append([str(idx), nombre, str(tam), cantidad, servida, label])
                    per_row_styles.append((idx, bg, fg, label == "Denegado"))
                else:
                    data.append([str(idx), nombre, str(tam), cantidad, servida])

            t_items = Table(data, colWidths=col_widths)
            base_style = [
                ("BACKGROUND", (0, 0), (-1, 0), COLOR_SECUNDARIO),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 9),
                ("FONTSIZE", (0, 1), (-1, -1), 9),
                ("ALIGN", (0, 0), (0, -1), "CENTER"),
                ("ALIGN", (3, 0), (4, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, COLOR_GRIS_FONDO]),
                ("GRID", (0, 0), (-1, -1), 0.4, COLOR_BORDE),
            ]
            if is_partial:
                base_style.append(("ALIGN", (5, 0), (5, -1), "CENTER"))
                base_style.append(("FONTNAME", (5, 1), (5, -1), "Helvetica-Bold"))
                for row_idx, bg, fg, is_denegado in per_row_styles:
                    base_style.append(("BACKGROUND", (5, row_idx), (5, row_idx), bg))
                    base_style.append(("TEXTCOLOR", (5, row_idx), (5, row_idx), fg))
                    if is_denegado:
                        base_style.append(("TEXTCOLOR", (0, row_idx), (4, row_idx), COLOR_GRIS))
            t_items.setStyle(TableStyle(base_style))
            story.append(t_items)
            story.append(Spacer(1, 8))

    # ===== Bloque: nota =====
    nota = getattr(pedido, "nota", None)
    if nota:
        story.append(Paragraph("Notas del solicitante", style_h2))
        story.append(Paragraph(str(nota), style_body))
        story.append(Spacer(1, 10))

    if (getattr(pedido, "motivo_denegacion", None) or "").strip():
        story.append(Paragraph("Motivo de denegación", style_h2))
        story.append(Paragraph(str(pedido.motivo_denegacion), style_body))
        story.append(Spacer(1, 10))

    # ===== Pie =====
    story.append(Spacer(1, 12))
    story.append(HRFlowable(width="100%", thickness=0.5, color=COLOR_BORDE))
    story.append(Paragraph(
        f"Documento generado por ViverApp · "
        f"{datetime.utcnow().strftime('%d/%m/%Y %H:%M')} UTC",
        style_small,
    ))

    doc.build(story)
    return buf.getvalue()
