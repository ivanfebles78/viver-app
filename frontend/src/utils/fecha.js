// Formateo de fechas/horas SIEMPRE en horario de Canarias (Atlantic/Canary).
//
// Los datetime que llegan del backend son UTC "naive" (sin marca de zona). Si
// un valor no trae zona horaria, lo interpretamos como UTC antes de convertir a
// hora canaria; si ya trae zona (Z u offset), se respeta.

const CANARY = "Atlantic/Canary";

function toDate(value) {
  if (value === null || value === undefined || value === "") return null;
  let s = String(value);
  const tieneZona = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);
  const esIsoSinZona = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s);
  if (esIsoSinZona && !tieneZona) {
    s = s.replace(" ", "T") + "Z"; // naive → UTC
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// "25/06/2026, 14:30"
export function formatFechaHoraCanaria(value, fallback = "—") {
  const d = toDate(value);
  if (!d) return fallback;
  return d.toLocaleString("es-ES", {
    timeZone: CANARY,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// "25/06/2026"
export function formatFechaCanaria(value, fallback = "—") {
  const d = toDate(value);
  if (!d) return fallback;
  return d.toLocaleDateString("es-ES", {
    timeZone: CANARY,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Convierte el valor de un <input type="datetime-local"> (hora local del
// navegador) a ISO UTC para enviarlo al backend de forma consistente.
export function datetimeLocalToUtcIso(value) {
  if (!value) return null;
  const d = new Date(value); // el navegador lo interpreta como hora local
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
