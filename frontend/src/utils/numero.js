// Formateadores numéricos comunes para la visualización en la UI.
//
// El backend ahora persiste cantidades como NUMERIC(12, 3) — vienen con hasta 3
// decimales. Para la pantalla queremos:
//   - máximo 2 decimales (redondeo)
//   - sin ceros sobrantes a la derecha
//
// Ejemplos:
//   2     → "2"
//   2.5   → "2.5"
//   2.50  → "2.5"
//   2.75  → "2.75"
//   2.755 → "2.76"   (redondeo a 2 decimales)
//   0.5   → "0.5"
//   25    → "25"
//   25.00 → "25"

export function formatCantidad(value) {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";

  // toFixed(2) para limitar y redondear. Luego strip de ceros sobrantes
  // y del punto decimal si todo lo de la derecha son ceros.
  return n.toFixed(2).replace(/\.?0+$/, "");
}

// Variante con sufijo de unidad ("5.5 L", "25 Kg", "3 unidades", etc.)
export function formatCantidadConUnidad(value, unidad) {
  const f = formatCantidad(value);
  if (!f) return "";
  if (!unidad) return f;
  return `${f} ${unidad}`;
}
