// Utilidades de zonas del vivero.
//
// El servidor puede guardar el identificador de una zona con cualquier
// variante de casing/tildes/separadores (p. ej. "almacen", "Almacen",
// "Almacén", "zona-almacen"). Estas funciones centralizan la normalización
// para comparaciones y la transformación a un nombre legible para la UI.

// Normaliza un id/nombre de zona para comparaciones tolerantes:
// lowercase, sin tildes, sin guiones/espacios y sin el prefijo "zona".
// Equivalente al `_normalize_zona_id` del backend.
export function normalizeZonaCompare(s) {
  return (s || "")
    .toString()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_\-\s]/g, "")
    .replace(/^zona/i, "")
    .trim();
}

// Mapa interno: id canónico (normalizado) → display name legible.
// Cubre las zonas especiales y sus variantes razonables. Para zonas
// desconocidas devolvemos el id tal cual.
const ZONA_DISPLAY_MAP = [
  // Almacenes especializados (tres tras el split del almacén único).
  { match: ["almacenfito", "almacenfitosanitario", "almacenfitosanitarios"], name: "Almacén Fitosanitarios" },
  { match: ["almacengeneral", "almacenferreteria"], name: "Almacén General" },
  { match: ["almacenfert", "almacenfertilizante", "almacenfertilizantes"], name: "Almacén Fertilizantes" },
  // Compatibilidad temporal con la zona "almacen" antigua (pre-split).
  { match: ["almacen"], name: "Almacén" },
  // Zona compostaje.
  { match: ["compostaje"], name: "Zona Compostaje" },
];

function lookupZonaDisplay(zonaId) {
  const n = normalizeZonaCompare(zonaId);
  for (const entry of ZONA_DISPLAY_MAP) {
    if (entry.match.includes(n)) return entry.name;
  }
  return null;
}

// Nombre corto para usar dentro de selects/dropdowns.
//   "almacen-fito"  / "almacenfito"  → "Almacén Fitosanitarios"
//   "almacen-general" / "almacenferreteria" → "Almacén General"
//   "almacen-fert" / "almacenfertilizantes" → "Almacén Fertilizantes"
//   "compostaje" / "zonacompostaje" → "Zona Compostaje"
//   "1" / "3a" / "10b" → tal cual (el dropdown ya tiene el contexto "Zona").
export function getZonaDisplayName(zonaId) {
  if (zonaId === null || zonaId === undefined || zonaId === "") return "";
  return lookupZonaDisplay(zonaId) || String(zonaId);
}

// Etiqueta completa para usar en frases largas tipo "Vivero · Zona X · …".
// Las zonas numéricas reciben el prefijo "Zona"; las especiales devuelven
// su nombre completo tal cual (porque ya tienen un nombre propio).
export function getZonaLabel(zonaId) {
  if (zonaId === null || zonaId === undefined || zonaId === "") return "";
  const special = lookupZonaDisplay(zonaId);
  if (special) return special;
  return `Zona ${zonaId}`;
}
