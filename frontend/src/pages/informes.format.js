/**
 * FORMATO COMPARTIDO DE INFORMES.
 *
 * Estas funciones las usan LAS DOS caras del informe: la tabla que se pinta en
 * pantalla y la que se escribe en el PDF. Vivían duplicadas —una copia en el
 * componente y otra en el generador—, que es justo como acaban divergiendo:
 * alguien ajusta el formato de una cifra en pantalla, nadie toca el PDF, y los
 * dos documentos dejan de coincidir sin que salte nada.
 *
 * Con una sola definición, cambiar el formato cambia AMBOS a la vez, y el
 * contrato de PDF lo detecta.
 */

import { formatFechaCanaria, formatFechaHoraCanaria } from "../utils/fecha";

export const ESTADO_STOCK_LABEL = {
  "": "Todos los productos",
  con_stock: "Productos con stock",
  bajo: "Productos con stock bajo (próximo a agotarse)",
  agotado: "Productos agotados",
};

export function fmtCantInv(v) {
  const n = Number(v || 0);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}

export function fmtFecha(value) {
  return formatFechaHoraCanaria(value);
}

export function fmtFechaSolo(value) {
  return formatFechaCanaria(value);
}

export function fmtNum(value) {
  return Number(value || 0).toLocaleString("es-ES");
}

export function sanitizeFileName(name) {
  return String(name || "reporte")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

export function fmtEuro(v) {
  const n = Number(v || 0);
  return `${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

// Etiqueta de mes "YYYY-MM" → "mmm YYYY" (ej. "2025-08" → "ago 2025").
const _MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function fmtMesLabel(key) {
  const [y, m] = String(key || "").split("-");
  const idx = Number(m) - 1;
  return idx >= 0 && idx < 12 ? `${_MESES_CORTOS[idx]} ${y}` : key;
}

// Gráfica de barras verticales (coste mensual). data: [{ mes, total }].

