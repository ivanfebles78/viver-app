import React, { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  Button,
  Card,
  DataTable,
  EmptyState as EmptyStateUI,
  Field,
  Input,
  PageHeader,
  StatusBadge,
  cn,
} from "../ui";
import { Alert } from "../components/ui/feedback";
import { FilterBar } from "../components/ui/layout";
import SearchField from "../components/ui/SearchField";
import SelectField from "../components/ui/SelectField";
import { estadoCaducidad, estadoPedido, estadoStock } from "../app/estado";

import { ChevronDown } from "lucide-react";

import { exportReportToPdf } from "./informes.pdf";
import { fmtCantInv, fmtEuro, fmtFecha, fmtFechaSolo, fmtMesLabel, fmtNum } from "./informes.format";
import { formatFechaCanaria } from "../utils/fecha";
import { getZonaLabel } from "../utils/zonas";
import { rolEfectivo } from "../utils/roles";
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

/*
 * CLASES DEL SISTEMA que sustituyen a los antiguos ayudantes de estilo en
 * línea. `thStyle()` y `tdStyle()` se usaban 62 veces cada uno, y cada llamada
 * creaba un objeto nuevo en cada render.
 *
 * Los tres son deliberadamente escuetos: la densidad de esta pantalla importa
 * —son informes que se imprimen— así que se conserva el interlineado compacto
 * y la alineación a la izquierda del original.
 */
/*
 * Misma superficie que `Card` del sistema. Se aplica como clase sobre los
 * `div` existentes en vez de cambiar 39 etiquetas de apertura y cierre: el
 * resultado visual y el marcado son los mismos, y la sustitución es mecánica y
 * verificable.
 */
const CARD_CLS = "rounded-[var(--radius-lg)] border border-border bg-card p-[var(--card-padding)]";

const TH = "border-b border-border px-2.5 py-2 text-left text-caption font-[var(--font-weight-medium)] text-muted-foreground";
const TD = "border-b border-border px-2.5 py-2 align-top text-body-sm";
const INPUT_CLS =
  "h-[var(--input-height)] w-full rounded-[var(--radius-md)] border border-input bg-background px-3 text-body-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

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
function BarrasVerticales({ data, color = "var(--chart-1)", valueFmt = (v) => v }) {
  if (!data || data.length === 0) return <EmptyState text="Sin datos para el rango seleccionado." />;
  const W = Math.max(320, data.length * 74);
  const H = 240;
  const padB = 46, padT = 24, padL = 8, padR = 8;
  const max = Math.max(...data.map((d) => Number(d.total) || 0), 1);
  const bw = (W - padL - padR) / data.length;
  const chartH = H - padB - padT;
  return (
    <div className="overflow-x-auto">
      <svg width={W} height={H} role="img" style={{ display: "block" }}>
        {data.map((d, i) => {
          const v = Number(d.total) || 0;
          const h = max > 0 ? (v / max) * chartH : 0;
          const x = padL + i * bw;
          const y = padT + (chartH - h);
          return (
            <g key={d.mes}>
              <rect x={x + bw * 0.16} y={y} width={bw * 0.68} height={h} rx={5} fill={color} />
              <text x={x + bw / 2} y={y - 6} textAnchor="middle" fontSize="10.5" fontWeight="var(--font-weight-semibold)" fill="var(--foreground)">{valueFmt(v)}</text>
              <text x={x + bw / 2} y={H - padB + 18} textAnchor="middle" fontSize="11" fontWeight="var(--font-weight-medium)" fill="var(--muted-foreground)">{fmtMesLabel(d.mes)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Gráfica de barras horizontales (top productos). data: [{ nombre, cantidad }].
function BarrasHorizontales({ data, color = "var(--chart-2)", valueFmt = (v) => v }) {
  if (!data || data.length === 0) return <EmptyState text="Sin datos para el rango seleccionado." />;
  const rowH = 30;
  const H = data.length * rowH + 12;
  const labelW = 220;
  const max = Math.max(...data.map((d) => Number(d.cantidad) || 0), 1);
  return (
    <div className="overflow-x-auto">
      <svg width="100%" height={H} viewBox={`0 0 720 ${H}`} preserveAspectRatio="xMinYMin meet" style={{ display: "block", minWidth: 480 }}>
        {data.map((d, i) => {
          const v = Number(d.cantidad) || 0;
          const barMax = 720 - labelW - 60;
          const w = max > 0 ? (v / max) * barMax : 0;
          const y = i * rowH + 6;
          const nombre = String(d.nombre || "").length > 34 ? String(d.nombre).slice(0, 33) + "…" : d.nombre;
          return (
            <g key={i}>
              <text x={0} y={y + rowH / 2} dominantBaseline="middle" fontSize="11.5" fontWeight="var(--font-weight-medium)" fill="var(--foreground)">{nombre}</text>
              <rect x={labelW} y={y} width={Math.max(w, 2)} height={rowH - 12} rx={5} fill={color} />
              <text x={labelW + Math.max(w, 2) + 6} y={y + (rowH - 12) / 2} dominantBaseline="middle" fontSize="11" fontWeight="var(--font-weight-semibold)" fill="var(--foreground)">{valueFmt(v)}</text>
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

/*
 * Los cuatro «badges» de esta pantalla —existencias, caducidad, abastecimiento
 * y préstamos— eran cuatro copias del mismo `span` con `fontWeight: "var(--font-weight-semibold)"`, un
 * `borderRadius: "var(--radius-full)"` y una paleta escrita a mano por estado, cada una con sus
 * propios tonos. Ahora los cuatro salen del vocabulario compartido de
 * `app/estado.js`, que ya resuelve tono Y etiqueta, y se pintan con el
 * `StatusBadge` del sistema.
 *
 * Ganancia real, no solo estética: un estado desconocido ya no se queda sin
 * tono ni inventa uno, cae en el neutro conservando su texto.
 */
function StockBadge({ estado }) {
  const { status, label } = estadoStock(estado);
  return <StatusBadge status={status} label={label} />;
}

function CaducidadBadge({ estado }) {
  const { status, label } = estadoCaducidad(estado);
  return <StatusBadge status={status} label={label} />;
}

function AbastecimientoBadge({ estado }) {
  const { status, label } = estadoPedido(estado);
  return <StatusBadge status={status} label={label} />;
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

/*
 * Préstamos tiene su propio par de estados —«Devuelto» y «Activo»— que no
 * pertenece a ningún vocabulario existente: no es un pedido ni una caducidad.
 * Se mapean aquí, junto a su uso, en lugar de añadir un vocabulario de dos
 * entradas al módulo compartido.
 */
function PrestamoBadge({ estado }) {
  const devuelto = estado === "Devuelto";
  return (
    <StatusBadge status={devuelto ? "completed" : "in_progress"} label={estado || "—"} />
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

/*
 * El banner era un `div` con degradado y colores a mano por tono. `Alert` ya
 * resuelve el rol ARIA correcto según el tono —`alert` para error, `status`
 * para el resto—, que es lo que faltaba: un aviso solo pintado no llega a
 * quien usa lector de pantalla.
 */
function MessageBanner({ msg, msgType, onClose }) {
  if (!msg) return null;
  return (
    <Alert tone={msgType === "error" ? "error" : "success"} onDismiss={onClose}>
      {msg}
    </Alert>
  );
}

/** Envuelve el `EmptyState` del sistema para conservar la firma existente. */
function EmptyState({ text = "No hay datos para mostrar." }) {
  return (
    <div className={CARD_CLS}>
      <EmptyStateUI title={text} />
    </div>
  );
}

export default function Informes() {
  const { me } = useOutletContext();

  const role = rolEfectivo(me);  // superadmin/admin_vivero cuentan como admin
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
      <div className="w-full">
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
          <h1 style={{ fontSize: 44, margin: 0, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Informes</h1>
        </div>

        <Alert tone="error" title="Sin permisos">
          No tienes permisos para acceder a esta página.
        </Alert>
      </div>
    );
  }

  return (
    <div className="w-full">
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
          <h1 style={{ fontSize: 44, margin: 0, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Informes</h1>
          <div style={{ marginTop: 8, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-medium)" }}>
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

      <div className={CARD_CLS}>
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
                    borderRadius: "var(--radius-lg)",
                    border: active
                      ? "1px solid var(--border)"
                      : "1px solid var(--border)",
                    background: active
                      ? "var(--primary)"
                      : "white",
                    color: active ? "var(--primary-foreground)" : "var(--foreground)",
                    fontWeight: "var(--font-weight-semibold)",
                    cursor: "pointer",
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>

          <div style={{ position: "relative" }}>
            {/*
              `aria-expanded` y `aria-haspopup` no estaban: el botón abría un
              menú y nada lo anunciaba. Y el «▾» pasa a icono decorativo — un
              lector de pantalla leía «Exportar triángulo hacia abajo pequeño».
            */}
            <Button
              type="button"
              variant="secondary"
              onClick={() => setExportMenuOpen((o) => !o)}
              disabled={!canExportCurrentReport || exporting}
              loading={exporting}
              aria-haspopup="menu"
              aria-expanded={exportMenuOpen}
              title={canExportCurrentReport ? "Exportar informe" : "Genera primero un informe"}
            >
              {exporting ? "Exportando…" : "Exportar"}
              <ChevronDown aria-hidden="true" className="size-4" />
            </Button>
            {exportMenuOpen && canExportCurrentReport && (
              <>
                <div onClick={() => setExportMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)", zIndex: 50, minWidth: 190, overflow: "hidden" }}>
                  <button
                    onClick={() => { setExportMenuOpen(false); handleExportPdf(); }}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 14px", border: "none", borderBottom: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", fontSize: 14 }}
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
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 14px", border: "none", background: "var(--card)", cursor: "pointer", fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", fontSize: 14 }}
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
            <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: "var(--radius-md)", background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)", fontWeight: 600, fontSize: 13.5, display: "flex", gap: 10, alignItems: "flex-start" }}>
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
                display: "flex",
                flexWrap: "wrap",
                gap: 18,
                alignItems: "flex-end",
              }}
            >
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <label htmlFor="inf-uuid-del-lote" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>UUID del lote</label>
                <input id="inf-uuid-del-lote"
                  value={uuid}
                  onChange={(e) => setUuid(e.target.value)}
                  placeholder="Introduce el UUID"
                  className={INPUT_CLS}
                />
              </div>

              <Button type="button" variant="primary" onClick={onBuscarTrazabilidad} loading={loading}>
                {loading ? "Generando..." : "Generar informe"}
              </Button>
            </div>

            {trazabilidadData ? (
              <>
                <div className={CARD_CLS}>
                  <div style={{ fontSize: 18, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", marginBottom: 10 }}>
                    Resumen del lote
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>UUID</div>
                      <div className="font-[var(--font-weight-medium)]">{trazabilidadData.uuid_lote || "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Producto</div>
                      <div className="font-[var(--font-weight-medium)]">
                        {trazabilidadData.producto_nombre || `Producto #${trazabilidadData.producto_id || "—"}`}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Cantidad inicial</div>
                      <div className="font-[var(--font-weight-medium)]">{fmtNum(trazabilidadData.cantidad_inicial)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Fecha de entrada</div>
                      <div className="font-[var(--font-weight-medium)]">{fmtFecha(trazabilidadData.fecha_entrada)}</div>
                    </div>
                  </div>
                </div>

                <div className={CARD_CLS}>
                  <div style={{ fontSize: 18, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", marginBottom: 10 }}>
                    Línea temporal
                  </div>

                  {!trazabilidadResumen.length ? (
                    <div style={{ color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>No hay movimientos asociados a este UUID.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 12 }}>
                      {trazabilidadResumen.map((m, idx) => (
                        <div
                          key={`${m.movimiento_id || idx}-${idx}`}
                          style={{
                            padding: 14,
                            borderRadius: "var(--radius-lg)",
                            border: "1px solid var(--border)",
                            background: "var(--muted)",
                          }}
                        >
                          <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>
                            {fmtFecha(m.fecha_movimiento)}
                          </div>
                          <div style={{ marginTop: 6, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>
                            {m.descripcion || "Movimiento registrado"}
                          </div>
                          <div style={{ marginTop: 6, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-medium)" }}>
                            Cantidad: {fmtNum(m.cantidad)} · Origen: {m.origen_tipo || "—"} · Destino: {m.destino_tipo || "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className={CARD_CLS}>
                  <div style={{ fontSize: 18, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", marginBottom: 10 }}>
                    Inventario actual del lote
                  </div>

                  {!trazabilidadData.inventario_actual?.length ? (
                    <div style={{ color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>
                      El lote no tiene inventario disponible actualmente.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr>
                            <th className={TH}>Zona</th>
                            <th className={TH}>Tamaño</th>
                            <th className={TH}>Cantidad disponible</th>
                          </tr>
                        </thead>
                        <tbody>
                          {trazabilidadData.inventario_actual.map((inv, idx) => (
                            <tr key={idx}>
                              <td className={TD}>{inv.zona || "—"}</td>
                              <td className={TD}>{inv.tamano || "—"}</td>
                              <td className={TD}>{fmtNum(inv.cantidad_disponible)}</td>
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
              <div ref={productoSearchRef} className="relative min-w-0">
                <label htmlFor="inf-buscar-producto" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Buscar producto</label>
                <input id="inf-buscar-producto"
                  value={productoSearch}
                  onChange={(e) => {
                    setProductoSearch(e.target.value);
                    setSelectedProducto(null);
                    setShowProductoDropdown(true);
                  }}
                  onFocus={() => setShowProductoDropdown(true)}
                  placeholder="Escribe nombre natural, científico, categoría o subcategoría"
                  className={INPUT_CLS}
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
                      border: "1px solid var(--input)",
                      borderRadius: "var(--radius-lg)",
                      boxShadow: "var(--shadow-md)",
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
                            borderBottom: "1px solid var(--border)",
                            background: "white",
                            cursor: "pointer",
                          }}
                        >
                          <div className="font-[var(--font-weight-medium)]">{label}</div>
                          <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 3 }}>
                            {p.nombre_cientifico || "—"} · {p.categoria || "—"} · {p.subcategoria || "—"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <Button type="button" variant="primary" onClick={onBuscarDistribucion} loading={loading}>
                {loading ? "Generando..." : "Generar informe"}
              </Button>

              <Button type="button" variant="secondary" size="sm" onClick={onNuevaBusquedaDistribucion}>
                Nueva búsqueda
              </Button>
            </div>

            {distribucionData ? (
              <>
                <div className={CARD_CLS}>
                  <div style={{ fontSize: 18, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", marginBottom: 10 }}>Resumen</div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Producto</div>
                      <div className="font-[var(--font-weight-medium)]">
                        {distribucionData.producto_nombre || `Producto #${distribucionData.producto_id || "—"}`}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Stock total</div>
                      <div className="font-[var(--font-weight-medium)]">{fmtNum(distribucionData.stock_total)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Ubicaciones activas</div>
                      <div className="font-[var(--font-weight-medium)]">{fmtNum(distribucionData.distribucion?.length || 0)}</div>
                    </div>
                  </div>
                </div>

                <div className={CARD_CLS}>
                  <div style={{ fontSize: 18, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", marginBottom: 10 }}>
                    Distribución dentro del vivero
                  </div>

                  {!distribucionData.distribucion?.length ? (
                    <div style={{ color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>No hay inventario disponible para ese producto.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr>
                            <th className={TH}>Zona</th>
                            <th className={TH}>Tamaño</th>
                            <th className={TH}>Cantidad</th>
                          </tr>
                        </thead>
                        <tbody>
                          {distribucionData.distribucion.map((row, idx) => (
                            <tr key={idx}>
                              <td className={TD}>{row.zona || "—"}</td>
                              <td className={TD}>{row.tamano || "—"}</td>
                              <td className={TD}>{fmtNum(row.cantidad)}</td>
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
              <div style={{ color: "var(--muted-foreground)", fontWeight: "var(--font-weight-medium)" }}>
                Inventario del vivero por zona. Pulsa cada zona para plegar/desplegar.
              </div>
              {inventarioFiltrado.length > 0 && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setZonasInvColapsadas({})}
                    style={{ padding: "8px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--card)", color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)", cursor: "pointer", fontSize: 13 }}
                  >
                    Expandir todo
                  </button>
                  <button
                    type="button"
                    onClick={() => setZonasInvColapsadas(Object.fromEntries(inventarioFiltrado.map((z) => [z.zona, true])))}
                    style={{ padding: "8px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--card)", color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)", cursor: "pointer", fontSize: 13 }}
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
                  <label htmlFor="inf-buscar-producto-2" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Buscar producto</label>
                  <input id="inf-buscar-producto-2"
                    value={invSearch}
                    onChange={(e) => setInvSearch(e.target.value)}
                    placeholder="Nombre científico o común"
                    className={INPUT_CLS}
                  />
                </div>
                <div>
                  <label htmlFor="inf-categoria" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Categoría</label>
                  <select id="inf-categoria"
                    value={invCategoria}
                    onChange={(e) => { setInvCategoria(e.target.value); setInvSubcategoria(""); }}
                    className={INPUT_CLS}
                  >
                    <option value="">Todas</option>
                    {invCategoriasDisponibles.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="inf-subcategoria" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Subcategoría</label>
                  <select id="inf-subcategoria"
                    value={invSubcategoria}
                    onChange={(e) => setInvSubcategoria(e.target.value)}
                    disabled={invSubcategoriasDisponibles.length === 0}
                    className={cn(INPUT_CLS, invSubcategoriasDisponibles.length === 0 && "opacity-55")}
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
                  <div key={zona.zona} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
                    <div
                      onClick={() => toggleZonaInv(zona.zona)}
                      style={{ padding: "10px 14px", background: "var(--foreground)", color: "var(--card)", fontWeight: "var(--font-weight-semibold)", fontSize: 15, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, cursor: "pointer" }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12 }}>{colapsada ? "▶" : "▼"}</span>
                        📍 {zona.label}
                      </span>
                      <span style={{ opacity: 0.85, fontWeight: "var(--font-weight-medium)", fontSize: 13 }}>
                        {zona.productos.length} {zona.productos.length === 1 ? "producto" : "productos"}
                      </span>
                    </div>
                    {!colapsada && (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[480px] border-collapse">
                        <thead>
                          <tr className="bg-muted">
                            <th style={{ padding: 10, textAlign: "left", fontWeight: "var(--font-weight-semibold)", fontSize: 12, color: "var(--foreground)", borderBottom: "1px solid var(--border)" }}>Producto</th>
                            {zona.tamanos.map((t) => (
                              <th key={t} style={{ padding: 10, textAlign: "center", fontWeight: "var(--font-weight-semibold)", fontSize: 12, color: "var(--foreground)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{t}</th>
                            ))}
                            <th style={{ padding: 10, textAlign: "center", fontWeight: "var(--font-weight-semibold)", fontSize: 12, color: "var(--foreground)", borderBottom: "1px solid var(--border)" }}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {zona.productos.map((p) => (
                            <tr key={p.producto_id} style={{ borderTop: "1px solid var(--border)" }}>
                              <td style={{ padding: 10, textAlign: "left" }}>
                                <div style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", fontSize: 13, fontStyle: "italic" }}>{p.nombre}</div>
                                {p.nombreComun && (
                                  <div style={{ fontSize: 12, color: "var(--foreground)", fontWeight: "var(--font-weight-medium)" }}>{p.nombreComun}</div>
                                )}
                                {(p.categoria || p.subcategoria) && (
                                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", fontWeight: 600 }}>
                                    {[p.categoria, p.subcategoria].filter(Boolean).join(" · ")}
                                  </div>
                                )}
                              </td>
                              {zona.tamanos.map((t) => (
                                <td key={t} style={{ padding: 10, textAlign: "center", fontWeight: "var(--font-weight-semibold)", color: p.tamanos[t] ? "var(--foreground)" : "var(--muted-foreground)" }}>
                                  {p.tamanos[t] ? fmtCantInv(p.tamanos[t]) : "—"}
                                </td>
                              ))}
                              <td style={{ padding: 10, textAlign: "center", fontWeight: "var(--font-weight-semibold)", color: "var(--success-subtle-foreground)" }}>{fmtCantInv(p.total)}</td>
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
                <label htmlFor="inf-buscar" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Buscar</label>
                <input id="inf-buscar"
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  placeholder="Producto, categoría o subcategoría"
                  className={INPUT_CLS}
                />
              </div>

              <div>
                <label htmlFor="inf-categoria-2" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Categoría</label>
                <select id="inf-categoria-2"
                  value={stockCategoriaFilter}
                  onChange={(e) => {
                    setStockCategoriaFilter(e.target.value);
                    setStockSubcategoriaFilter("");
                  }}
                  className={INPUT_CLS}
                >
                  <option value="">Todas</option>
                  {stockCategoriasDisponibles.map((categoria) => (
                    <option key={categoria} value={categoria}>{categoria}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="inf-subcategoria-2" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Subcategoría</label>
                <select id="inf-subcategoria-2"
                  value={stockSubcategoriaFilter}
                  onChange={(e) => setStockSubcategoriaFilter(e.target.value)}
                  className={INPUT_CLS}
                >
                  <option value="">Todas</option>
                  {stockSubcategoriasDisponibles.map((subcategoria) => (
                    <option key={subcategoria} value={subcategoria}>{subcategoria}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="inf-estado-de-existencias" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Estado de existencias</label>
                <select id="inf-estado-de-existencias"
                  value={stockEstadoFilter}
                  onChange={(e) => setStockEstadoFilter(e.target.value)}
                  className={INPUT_CLS}
                >
                  {ESTADO_STOCK_OPTIONS.map((o) => (
                    <option key={o.value || "todos"} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Button type="button" variant="primary" onClick={onBuscarStock} loading={loading}>
                  {loading ? "Actualizando..." : "Actualizar"}
                </Button>

                <Button type="button" variant="secondary" size="sm" onClick={onLimpiarFiltrosStock}>
                  Limpiar filtros
                </Button>
              </div>
            </div>

            <div
              style={{
                marginTop: 20,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))",
                gap: 16,
              }}
            >
              <div className={CARD_CLS}>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Categorías visibles</div>
                <div style={{ fontSize: 28, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", marginTop: 6 }}>
                  {fmtNum(stockSummary.totalCategorias)}
                </div>
              </div>
              <div className={CARD_CLS}>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Productos visibles</div>
                <div style={{ fontSize: 28, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", marginTop: 6 }}>
                  {fmtNum(stockSummary.totalProductos)}
                </div>
              </div>
              <div className={CARD_CLS}>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Stock total visible</div>
                <div style={{ fontSize: 28, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", marginTop: 6 }}>
                  {fmtNum(stockSummary.totalStock)}
                </div>
              </div>
              <div className={CARD_CLS}>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Bajo stock</div>
                <div style={{ fontSize: 28, fontWeight: "var(--font-weight-semibold)", color: "var(--danger-subtle-foreground)", marginTop: 6 }}>
                  {fmtNum(stockSummary.totalBajoStock)}
                </div>
              </div>
            </div>

            {stockGroupedByCategory.length === 0 ? (
              <EmptyState text="No hay productos que coincidan con los filtros seleccionados." />
            ) : (
              <div style={{ display: "grid", gap: 18, marginTop: 20 }}>
                {stockGroupedByCategory.map((group) => (
                  <div key={group.categoria} className={CARD_CLS}>
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
                        <div style={{ fontSize: 20, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>{group.categoria}</div>
                        <div style={{ marginTop: 6, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-medium)" }}>
                          {fmtNum(group.totalProductos)} productos · Stock total: {fmtNum(group.stockTotal)} · Bajo stock: {fmtNum(group.bajoStock)}
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr>
                            <th className={TH}>Producto</th>
                            <th className={TH}>Subcategoría</th>
                            <th className={TH}>Stock actual</th>
                            <th className={TH}>Stock mínimo</th>
                            <th className={TH}>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map((item) => (
                            <tr key={item.id}>
                              <td className={TD}>{item.nombreDisplay}</td>
                              <td className={TD}>{item.subcategoria}</td>
                              <td className={TD}>{fmtNum(item.stockActual)}</td>
                              <td className={TD}>{fmtNum(item.stockMinimo)}</td>
                              <td className={TD}><StockBadge estado={item.estado} /></td>
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
              <Button type="button" variant="primary" onClick={onBuscarCaducidad} loading={loading}>
                {loading ? "Actualizando..." : "Actualizar"}
              </Button>
            </div>

            <div
              style={{
                marginTop: 20,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
                gap: 16,
              }}
            >
              <div className={CARD_CLS}>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Total registros</div>
                <div style={{ fontSize: 28, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", marginTop: 6 }}>
                  {fmtNum(caducidadSummary.totalItems)}
                </div>
              </div>
              <div className={CARD_CLS}>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Caducados</div>
                <div style={{ fontSize: 28, fontWeight: "var(--font-weight-semibold)", color: "var(--danger-subtle-foreground)", marginTop: 6 }}>
                  {fmtNum(caducidadSummary.totalCaducados)}
                </div>
              </div>
              <div className={CARD_CLS}>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Próximos a caducar</div>
                <div style={{ fontSize: 28, fontWeight: "var(--font-weight-semibold)", color: "var(--warning-subtle-foreground)", marginTop: 6 }}>
                  {fmtNum(caducidadSummary.totalProximos)}
                </div>
              </div>
              <div className={CARD_CLS}>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Vigentes</div>
                <div style={{ fontSize: 28, fontWeight: "var(--font-weight-semibold)", color: "var(--success-subtle-foreground)", marginTop: 6 }}>
                  {fmtNum(caducidadSummary.totalVigentes)}
                </div>
              </div>
            </div>

            {caducidadItems.length === 0 ? (
              <EmptyState text="No hay productos con fecha de caducidad para mostrar." />
            ) : (
              <div className={CARD_CLS}>
                <div style={{ fontSize: 18, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", marginBottom: 10 }}>
Productos con fecha de caducidad
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className={TH}>Producto</th>
                        <th className={TH}>Categoría</th>
                        <th className={TH}>Subcategoría</th>
                        <th className={TH}>Zona</th>
                        <th className={TH}>Tamaño</th>
                        <th className={TH}>Cantidad</th>
                        <th className={TH}>Fecha caducidad</th>
                        <th className={TH}>Días</th>
                        <th className={TH}>Estado</th>
                        <th className={TH}>UUID lote</th>
                      </tr>
                    </thead>
                    <tbody>
                      {caducidadItems.map((item) => (
                        <tr key={item.id}>
                          <td className={TD}>{item.nombre}</td>
                          <td className={TD}>{item.categoria}</td>
                          <td className={TD}>{item.subcategoria}</td>
                          <td className={TD}>{item.zona}</td>
                          <td className={TD}>{item.tamano}</td>
                          <td className={TD}>{fmtNum(item.cantidad)}</td>
                          <td className={TD}>{fmtFechaSolo(item.fechaCaducidad)}</td>
                          <td className={TD}>{item.diasRestantes}</td>
                          <td className={TD}><CaducidadBadge estado={item.estado} /></td>
                          <td className={TD}>{item.loteUuid}</td>
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
                <label htmlFor="inf-producto" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Producto</label>
                <input id="inf-producto"
                  value={prestamoProductoFilter}
                  onChange={(e) => setPrestamoProductoFilter(e.target.value)}
                  placeholder="Buscar por producto"
                  className={INPUT_CLS}
                />
              </div>

              <div>
                <label htmlFor="inf-solicitante-destino" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Solicitante / destino</label>
                <input id="inf-solicitante-destino"
                  value={prestamoSolicitanteFilter}
                  onChange={(e) => setPrestamoSolicitanteFilter(e.target.value)}
                  placeholder="Solicitante o destinatario"
                  className={INPUT_CLS}
                />
              </div>

              <div>
                <label htmlFor="inf-estado" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Estado</label>
                <select id="inf-estado"
                  value={prestamoEstadoFilter}
                  onChange={(e) => setPrestamoEstadoFilter(e.target.value)}
                  className={INPUT_CLS}
                >
                  <option value="">Todos</option>
                  <option value="Activo">Activo</option>
                  <option value="Devuelto">Devuelto</option>
                </select>
              </div>

              <div>
                <label htmlFor="inf-fecha-desde" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Fecha desde</label>
                <input id="inf-fecha-desde"
                  type="date"
                  value={prestamoFechaDesde}
                  onChange={(e) => setPrestamoFechaDesde(e.target.value)}
                  className={INPUT_CLS}
                />
              </div>

              <div>
                <label htmlFor="inf-fecha-hasta" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Fecha hasta</label>
                <input id="inf-fecha-hasta"
                  type="date"
                  value={prestamoFechaHasta}
                  onChange={(e) => setPrestamoFechaHasta(e.target.value)}
                  className={INPUT_CLS}
                />
              </div>

              <Button type="button" variant="primary" onClick={onActualizarPrestamos} loading={loading}>
                {loading ? "Actualizando..." : "Actualizar"}
              </Button>

              <Button type="button" variant="secondary" size="sm" onClick={onLimpiarPrestamos}>
                Limpiar filtros
              </Button>
            </div>

            <div
              style={{
                marginTop: 20,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
                gap: 16,
              }}
            >
              <div className={CARD_CLS}>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Préstamos visibles</div>
                <div style={{ fontSize: 28, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", marginTop: 6 }}>
                  {fmtNum(prestamosSummary.totalPrestamos)}
                </div>
              </div>
              <div className={CARD_CLS}>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Activos</div>
                <div style={{ fontSize: 28, fontWeight: "var(--font-weight-semibold)", color: "var(--info-subtle-foreground)", marginTop: 6 }}>
                  {fmtNum(prestamosSummary.totalActivos)}
                </div>
              </div>
              <div className={CARD_CLS}>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Devueltos</div>
                <div style={{ fontSize: 28, fontWeight: "var(--font-weight-semibold)", color: "var(--success-subtle-foreground)", marginTop: 6 }}>
                  {fmtNum(prestamosSummary.totalDevueltos)}
                </div>
              </div>
            </div>

            {prestamosItems.length === 0 ? (
              <EmptyState text="No hay préstamos que coincidan con los filtros seleccionados." />
            ) : (
              <div className={CARD_CLS}>
                <div style={{ fontSize: 18, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", marginBottom: 10 }}>
                  Préstamos
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className={TH}>Pedido</th>
                        <th className={TH}>Fecha</th>
                        <th className={TH}>Solicitante</th>
                        <th className={TH}>Destino</th>
                        <th className={TH}>Elementos</th>
                        <th className={TH}>Prestado</th>
                        <th className={TH}>Devuelto</th>
                        <th className={TH}>Pendiente</th>
                        <th className={TH}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prestamosItems.map((item) => (
                        <tr key={item.id}>
                          <td className={TD}>{item.pedidoId ? `#${item.pedidoId}` : <span style={{ color: "var(--muted-foreground)", fontWeight: "var(--font-weight-medium)" }}>Sin pedido</span>}</td>
                          <td className={TD}>{fmtFecha(item.fechaPrestamo)}</td>
                          <td className={TD}>{item.solicitante}</td>
                          <td className={TD}>{item.destinatario}</td>
                          <td className={TD}>
                            <div style={{ display: "grid", gap: 8 }}>
                              {item.lineas.map((linea) => (
                                <div key={linea.key}>
                                  <div className="font-[var(--font-weight-medium)]">
                                    {linea.producto}
                                  </div>
                                  <div style={{ color: "var(--muted-foreground)", fontWeight: "var(--font-weight-medium)", marginTop: 2 }}>
                                    Tamaño: {linea.tamano} · Pedido: {fmtNum(linea.cantidadPedida)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className={TD}>{fmtNum(item.totalPrestado)}</td>
                          <td className={TD}>{fmtNum(item.totalDevuelto)}</td>
                          <td className={TD}>{fmtNum(item.totalPendiente)}</td>
                          <td className={TD}><PrestamoBadge estado={item.estado} /></td>
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
                <label htmlFor="inf-producto-2" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Producto</label>
                <input id="inf-producto-2"
                  value={bajaProductoFilter}
                  onChange={(e) => setBajaProductoFilter(e.target.value)}
                  placeholder="Nombre científico o UUID"
                  className={INPUT_CLS}
                />
              </div>

              <div>
                <label htmlFor="inf-categoria-3" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Categoría</label>
                <select id="inf-categoria-3"
                  value={bajaCategoriaFilter}
                  onChange={(e) => {
                    setBajaCategoriaFilter(e.target.value);
                    setBajaSubcategoriaFilter("");
                  }}
                  className={INPUT_CLS}
                >
                  <option value="">Todas</option>
                  {bajasCategoriasDisponibles.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="inf-subcategoria-3" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Subcategoría</label>
                <select id="inf-subcategoria-3"
                  value={bajaSubcategoriaFilter}
                  onChange={(e) => setBajaSubcategoriaFilter(e.target.value)}
                  className={INPUT_CLS}
                >
                  <option value="">Todas</option>
                  {bajasSubcategoriasDisponibles.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="inf-fecha-desde-2" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Fecha desde</label>
                <input id="inf-fecha-desde-2"
                  type="date"
                  value={bajaFechaDesde}
                  onChange={(e) => setBajaFechaDesde(e.target.value)}
                  className={INPUT_CLS}
                />
              </div>

              <div>
                <label htmlFor="inf-fecha-hasta-2" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Fecha hasta</label>
                <input id="inf-fecha-hasta-2"
                  type="date"
                  value={bajaFechaHasta}
                  onChange={(e) => setBajaFechaHasta(e.target.value)}
                  className={INPUT_CLS}
                />
              </div>

              <Button type="button" variant="secondary" size="sm" onClick={onLimpiarBajas}>
                Limpiar filtros
              </Button>
            </div>

            <div
              style={{
                marginTop: 20,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
                gap: 16,
              }}
            >
              <div className={CARD_CLS}>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Bajas visibles</div>
                <div style={{ fontSize: 28, fontWeight: "var(--font-weight-semibold)", color: "var(--danger-subtle-foreground)", marginTop: 6 }}>
                  {fmtNum(bajasSummary.totalMovimientos)}
                </div>
              </div>
              <div className={CARD_CLS}>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Productos distintos</div>
                <div style={{ fontSize: 28, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", marginTop: 6 }}>
                  {fmtNum(bajasSummary.productosUnicos)}
                </div>
              </div>
              <div className={CARD_CLS}>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Unidades totales dadas de baja</div>
                <div style={{ fontSize: 28, fontWeight: "var(--font-weight-semibold)", color: "var(--danger-subtle-foreground)", marginTop: 6 }}>
                  {fmtNum(bajasSummary.totalUnidades)}
                </div>
              </div>
            </div>

            {bajasItems.length === 0 ? (
              <EmptyState text="No hay bajas registradas con los filtros seleccionados." />
            ) : (
              <div className={CARD_CLS}>
                <div style={{ fontSize: 18, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", marginBottom: 10 }}>
                  Productos dados de baja
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className={TH}>Fecha</th>
                        <th className={TH}>Producto</th>
                        <th className={TH}>Categoría</th>
                        <th className={TH}>Subcategoría</th>
                        <th className={TH}>Zona origen</th>
                        <th className={TH}>Tamaño</th>
                        <th className={TH}>Unidades</th>
                        <th className={TH}>UUID lote</th>
                        <th className={TH}>Registrado por</th>
                        <th className={TH}>Observaciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bajasItems.map((item) => (
                        <tr key={item.id}>
                          <td className={TD}>{fmtFecha(item.fecha)}</td>
                          <td className={TD}>{item.producto}</td>
                          <td className={TD}>{item.categoria}</td>
                          <td className={TD}>{item.subcategoria}</td>
                          <td className={TD}>{item.zonaOrigen}</td>
                          <td className={TD}>{item.tamano}</td>
                          <td className={TD}>
                            <span style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--danger-subtle-foreground)" }}>{fmtNum(item.cantidad)}</span>
                          </td>
                          <td className={cn(TD, "mono text-caption")}>
                            {item.uuidLote}
                          </td>
                          <td className={TD}>{item.createdBy}</td>
                          <td className={TD}>{item.observaciones || "—"}</td>
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
                <label htmlFor="inf-producto-3" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Producto</label>
                <input id="inf-producto-3"
                  value={abastProductoFilter}
                  onChange={(e) => setAbastProductoFilter(e.target.value)}
                  placeholder="Buscar por producto"
                  className={INPUT_CLS}
                />
              </div>

              <div>
                <label htmlFor="inf-solicitante" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Solicitante</label>
                <input id="inf-solicitante"
                  value={abastSolicitanteFilter}
                  onChange={(e) => setAbastSolicitanteFilter(e.target.value)}
                  placeholder="Solicitante"
                  className={INPUT_CLS}
                />
              </div>

              <div>
                <label htmlFor="inf-estado-2" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Estado</label>
                <select id="inf-estado-2"
                  value={abastEstadoFilter}
                  onChange={(e) => setAbastEstadoFilter(e.target.value)}
                  className={INPUT_CLS}
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
                <label htmlFor="inf-fecha-desde-3" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Fecha desde</label>
                <input id="inf-fecha-desde-3" type="date" value={abastFechaDesde} onChange={(e) => setAbastFechaDesde(e.target.value)} className={INPUT_CLS} />
              </div>

              <div>
                <label htmlFor="inf-fecha-hasta-3" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Fecha hasta</label>
                <input id="inf-fecha-hasta-3" type="date" value={abastFechaHasta} onChange={(e) => setAbastFechaHasta(e.target.value)} className={INPUT_CLS} />
              </div>

              <Button type="button" variant="secondary" size="sm" onClick={onLimpiarAbastecimiento}>
                Limpiar filtros
              </Button>
            </div>

            <div
              style={{
                marginTop: 20,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))",
                gap: 16,
              }}
            >
              <div className={CARD_CLS}>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Pedidos visibles</div>
                <div style={{ fontSize: 26, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", marginTop: 6 }}>{fmtNum(abastecimientoSummary.total)}</div>
              </div>
              <div className={CARD_CLS}>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Reserva</div>
                <div style={{ fontSize: 26, fontWeight: "var(--font-weight-semibold)", color: "var(--warning-subtle-foreground)", marginTop: 6 }}>{fmtNum(abastecimientoSummary.reserva)}</div>
              </div>
              <div className={CARD_CLS}>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Aprobados</div>
                <div style={{ fontSize: 26, fontWeight: "var(--font-weight-semibold)", color: "var(--success-subtle-foreground)", marginTop: 6 }}>{fmtNum(abastecimientoSummary.aprobados)}</div>
              </div>
              <div className={CARD_CLS}>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Servidos</div>
                <div style={{ fontSize: 26, fontWeight: "var(--font-weight-semibold)", color: "var(--info-subtle-foreground)", marginTop: 6 }}>{fmtNum(abastecimientoSummary.servidos)}</div>
              </div>
              <div className={CARD_CLS}>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Total pedido</div>
                <div style={{ fontSize: 26, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", marginTop: 6 }}>{fmtNum(abastecimientoSummary.totalPedido)}</div>
              </div>
              <div className={CARD_CLS}>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Pendiente</div>
                <div style={{ fontSize: 26, fontWeight: "var(--font-weight-semibold)", color: "var(--danger-subtle-foreground)", marginTop: 6 }}>{fmtNum(abastecimientoSummary.totalPendiente)}</div>
              </div>
            </div>

            {abastecimientoItems.length === 0 ? (
              <EmptyState text="No hay pedidos de abastecimiento que coincidan con los filtros." />
            ) : (
              <div className={CARD_CLS}>
                <div style={{ fontSize: 18, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", marginBottom: 10 }}>
                  Pedidos de abastecimiento
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className={TH}>Pedido</th>
                        <th className={TH}>Fecha</th>
                        <th className={TH}>Solicitante</th>
                        <th className={TH}>Estado</th>
                        <th className={TH}>Líneas</th>
                        <th className={TH}>Pedido</th>
                        <th className={TH}>Servido</th>
                        <th className={TH}>Pendiente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {abastecimientoItems.map((item) => (
                        <tr key={item.id}>
                          <td className={TD}>#{item.id}</td>
                          <td className={TD}>{fmtFecha(item.fecha)}</td>
                          <td className={TD}>{item.solicitante}</td>
                          <td className={TD}><AbastecimientoBadge estado={item.estado} /></td>
                          <td className={TD}>
                            <div style={{ display: "grid", gap: 6 }}>
                              {item.lineas.map((l) => (
                                <div key={l.key}>
                                  <div className="font-[var(--font-weight-medium)]">{l.producto}</div>
                                  <div style={{ color: "var(--muted-foreground)", fontWeight: "var(--font-weight-medium)", marginTop: 2, fontSize: 12 }}>
                                    Tamaño: {l.tamano} · Pedido: {fmtNum(l.cantidadPedida)} · Servido: {fmtNum(l.cantidadServida)} · Pendiente: {fmtNum(l.pendiente)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className={TD}>{fmtNum(item.totalPedido)}</td>
                          <td className={TD}>{fmtNum(item.totalServido)}</td>
                          <td className={TD}>{fmtNum(item.totalPendiente)}</td>
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
                gridTemplateColumns: "repeat(auto-fit, minmax(min(170px, 100%), 1fr))",
                gap: 22,
                rowGap: 20,
                alignItems: "end",
              }}
            >
              <div>
                <label htmlFor="inf-fecha-desde-4" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Fecha desde</label>
                <input id="inf-fecha-desde-4" type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className={INPUT_CLS} />
              </div>

              <div>
                <label htmlFor="inf-fecha-hasta-4" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Fecha hasta</label>
                <input id="inf-fecha-hasta-4" type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className={INPUT_CLS} />
              </div>

              <div>
                <label htmlFor="inf-distrito" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Distrito</label>
                <select id="inf-distrito"
                  value={distrito}
                  onChange={(e) => {
                    setDistrito(e.target.value);
                    setBarrio("");
                  }}
                  className={INPUT_CLS}
                >
                  <option value="">Todos</option>
                  {DISTRICTS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="inf-barrio" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Barrio</label>
                <select id="inf-barrio"
                  value={barrio}
                  onChange={(e) => setBarrio(e.target.value)}
                  className={INPUT_CLS}
                  disabled={!distrito}
                >
                  <option value="">{distrito ? "Todos" : "Selecciona distrito"}</option>
                  {barriosDisponibles.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="inf-direccion" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Dirección</label>
                <input id="inf-direccion"
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  placeholder="Déjalo en blanco o escribe dirección"
                  className={INPUT_CLS}
                />
              </div>

              <div>
                <label htmlFor="inf-categoria-4" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Categoría</label>
                <select id="inf-categoria-4"
                  value={externosCategoria}
                  onChange={(e) => { setExternosCategoria(e.target.value); setExternosSubcategoria(""); }}
                  className={INPUT_CLS}
                >
                  <option value="">Todas</option>
                  {externosCategorias.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label htmlFor="inf-subcategoria-4" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Subcategoría</label>
                <select id="inf-subcategoria-4"
                  value={externosSubcategoria}
                  onChange={(e) => setExternosSubcategoria(e.target.value)}
                  className={INPUT_CLS}
                  disabled={!externosCategoria || externosSubcategorias.length === 0}
                >
                  <option value="">{externosCategoria ? "Todas" : "Elige categoría"}</option>
                  {externosSubcategorias.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="flex items-end">
                <Button type="button" variant="primary" onClick={onBuscarExternos} loading={loading}>
                  {loading ? "Generando..." : "Buscar"}
                </Button>
              </div>
              <div className="flex items-end">
                <Button type="button" variant="secondary" size="sm" onClick={onNuevaBusquedaExternos}>
                  Nueva búsqueda
                </Button>
              </div>
            </div>

            {externosSearched && externosData.length === 0 ? (
              <EmptyState text="No se encontraron coincidencias." />
            ) : !externosSearched ? (
              <EmptyState text="Define los filtros y genera el informe de movimientos externos." />
            ) : (
              <div className={CARD_CLS}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 10 }}>
                  <div style={{ fontSize: 18, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>
                    Movimientos externos
                    <span style={{ marginLeft: 12, fontSize: 14, fontWeight: "var(--font-weight-semibold)", color: "var(--success-subtle-foreground)" }}>
                      Total elementos: {fmtNum(externosTotal)} · {externosData.length} {externosData.length === 1 ? "movimiento" : "movimientos"}
                    </span>
                  </div>
                  <Button type="button" variant="secondary" size="sm" onClick={exportarExternosExcel}>
                    ⬇ Exportar a Excel
                  </Button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className={TH}>Fecha</th>
                        <th className={TH}>Producto</th>
                        <th className={TH}>Categoría</th>
                        <th className={TH}>Subcategoría</th>
                        <th className={TH}>Cantidad</th>
                        <th className={TH}>Origen</th>
                        <th className={TH}>Destino</th>
                        <th className={TH}>Ubicación destino</th>
                        <th className={TH}>Registrado por</th>
                      </tr>
                    </thead>
                    <tbody>
                      {externosData.map((row, idx) => (
                        <tr key={idx}>
                          <td className={TD}>{fmtFecha(row.fecha_movimiento)}</td>
                          <td className={TD}>{row.producto_nombre}</td>
                          <td className={TD}>{row.producto_categoria || "—"}</td>
                          <td className={TD}>{row.producto_subcategoria || "—"}</td>
                          <td className={TD}>{fmtNum(row.cantidad)}</td>
                          <td className={TD}>
                            {row.origen_tipo || "—"} {row.zona_origen ? `· ${row.zona_origen}` : ""} {row.tamano_origen ? `· ${row.tamano_origen}` : ""}
                          </td>
                          <td className={TD}>
                            {row.destino_tipo || "—"} {row.zona_destino ? `· ${row.zona_destino}` : ""} {row.tamano_destino ? `· ${row.tamano_destino}` : ""}
                          </td>
                          <td className={TD}>
                            {[row.distrito_destino, row.barrio_destino, row.direccion_destino].filter(Boolean).join(" · ") || "—"}
                          </td>
                          <td className={TD}>{row.created_by || "—"}</td>
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
            <label style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: "var(--radius-md)", cursor: "pointer", background: estadSimular ? "var(--muted)" : "var(--muted)", border: estadSimular ? "1px solid var(--border)" : "1px solid var(--border)" }}>
              <input type="checkbox" checked={estadSimular} onChange={(e) => setEstadSimular(e.target.checked)} style={{ width: 18, height: 18 }} />
              <div>
                <div className="font-[var(--font-weight-medium)]">Simular resultados</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--muted-foreground)" }}>
                  Genera datos de ejemplo (precios y reposiciones de los últimos 3 meses) solo para previsualizar el informe. No se guarda nada en la base de datos.
                </div>
              </div>
            </label>
            {estadSimular && (
              <div style={{ marginTop: 12, padding: "8px 14px", borderRadius: "var(--radius-md)", background: "var(--muted)", border: "1px solid var(--border)", color: "var(--info-subtle-foreground)", fontWeight: "var(--font-weight-semibold)", fontSize: 13 }}>
                🧪 Mostrando datos SIMULADOS (no reales).
              </div>
            )}

            {/* Filtros */}
            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(170px, 100%), 1fr))", gap: 14, alignItems: "end" }}>
              <div>
                <label htmlFor="inf-desde" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Desde</label>
                <input id="inf-desde" type="date" value={estadDesde} onChange={(e) => setEstadDesde(e.target.value)} className={INPUT_CLS} />
              </div>
              <div>
                <label htmlFor="inf-hasta" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Hasta</label>
                <input id="inf-hasta" type="date" value={estadHasta} onChange={(e) => setEstadHasta(e.target.value)} className={INPUT_CLS} />
              </div>
              <div>
                <label htmlFor="inf-producto-4" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Producto</label>
                <input id="inf-producto-4" value={estadProducto} onChange={(e) => setEstadProducto(e.target.value)} placeholder="Científico o común" className={INPUT_CLS} />
              </div>
              <div>
                <label htmlFor="inf-categoria-5" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Categoría</label>
                <select id="inf-categoria-5" value={estadCategoria} onChange={(e) => setEstadCategoria(e.target.value)} className={INPUT_CLS}>
                  <option value="">Todas</option>
                  {estadCategorias.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="inf-subcategoria-5" style={{ marginBottom: 8, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Subcategoría</label>
                <select id="inf-subcategoria-5" value={estadSubcategoria} onChange={(e) => setEstadSubcategoria(e.target.value)} disabled={!estadCategoria} className={cn(INPUT_CLS, !estadCategoria && "opacity-55")}>
                  <option value="">Todas</option>
                  {estadSubcategorias.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Resumen (el export a PDF/Excel está en el botón «Exportar ▾» de arriba) */}
            <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
              {[
                { l: "Coste total reposición", v: fmtEuro(estadTotalCoste), c: "var(--chart-1)" },
                { l: "Unidades recibidas", v: fmtNum(estadTotalUds), c: "var(--chart-2)" },
                { l: "Movimientos", v: fmtNum(estadFiltrado.length), c: "var(--muted-foreground)" },
              ].map((s) => (
                <div key={s.l} className={cn(CARD_CLS, "min-w-40")}>
                  <div className="text-caption uppercase text-muted-foreground">{s.l}</div>
                  <div className="tabular text-h4 font-[var(--font-weight-semibold)]">{s.v}</div>
                </div>
              ))}
            </div>

            {estadSinPrecio && (
              <Alert tone="warning">
                Algunos productos no tienen precio unitario definido; su coste no se
                contabiliza. Añade el precio en «Gestionar productos».
              </Alert>
            )}

            {/* Gráficas */}
            <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", gap: 18 }}>
              <div className={CARD_CLS}>
                <div style={{ fontSize: 15, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", marginBottom: 10 }}>Coste mensual de reposición</div>
                <BarrasVerticales data={estadCostesMensuales} color="var(--chart-1)" valueFmt={(v) => fmtEuro(v)} />
              </div>
              <div className={CARD_CLS}>
                <div style={{ fontSize: 15, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", marginBottom: 10 }}>Productos más solicitados (uds)</div>
                <BarrasHorizontales data={estadTopProductos} color="var(--chart-2)" valueFmt={(v) => fmtNum(v)} />
              </div>
            </div>

            {/* Tabla */}
            {estadFiltrado.length === 0 ? (
              <EmptyState text="No hay entradas de reposición en el rango de fechas / filtros seleccionados." />
            ) : (
              <div className={cn(CARD_CLS, "overflow-hidden p-0")}>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className={TH}>Fecha</th>
                        <th className={TH}>Producto</th>
                        <th className={TH}>Categoría</th>
                        <th className={TH}>Subcategoría</th>
                        <th className={TH}>Tamaño</th>
                        <th className={cn(TH, "text-right")}>Cantidad</th>
                        <th className={cn(TH, "text-right")}>Precio unit.</th>
                        <th className={cn(TH, "text-right")}>Coste</th>
                      </tr>
                    </thead>
                    <tbody>
                      {estadFiltrado.map((r) => (
                        <tr key={r.id}>
                          <td className={TD}>{r.fecha ? formatFechaCanaria(r.fecha) : "—"}</td>
                          <td className={TD}>{r.nombreDisplay}</td>
                          <td className={TD}>{r.categoria || "—"}</td>
                          <td className={TD}>{r.subcategoria || "—"}</td>
                          <td className={TD}>{r.tamano}</td>
                          <td className={cn(TD, "tabular text-right font-[var(--font-weight-medium)]")}>{fmtNum(r.cantidad)}</td>
                          <td className={cn(TD, "tabular text-right")}>{r.precio == null ? "—" : fmtEuro(r.precio)}</td>
                          <td className={cn(TD, "tabular text-right font-[var(--font-weight-medium)]")}>{r.coste == null ? "—" : fmtEuro(r.coste)}</td>
                        </tr>
                      ))}
                      <tr className="bg-muted">
                        <td className={cn(TD, "font-[var(--font-weight-medium)]")} colSpan={5}>TOTAL</td>
                        <td className={cn(TD, "tabular text-right font-[var(--font-weight-medium)]")}>{fmtNum(estadTotalUds)}</td>
                        <td className={TD}></td>
                        <td className={cn(TD, "tabular text-right font-[var(--font-weight-medium)]")}>{fmtEuro(estadTotalCoste)}</td>
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
