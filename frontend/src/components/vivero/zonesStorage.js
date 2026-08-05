import zonasDefault from "./zonasConfig";
import { getZonasConfig, updateZonasConfig } from "../../api/api";

// Las zonas se persisten ahora en el servidor (tabla zona_polygons).
// El fichero zonasConfig.js queda como fallback "factory defaults" si la
// API no responde o devuelve la lista vacía (primer arranque).

export const parsePoints = (puntosStr) => {
  if (!puntosStr) return [];
  return puntosStr
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      return [x, y];
    })
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
};

export const pointsToString = (pointsArr) =>
  pointsArr.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(" ");

/**
 * Carga la configuración de zonas desde el servidor.
 * Si el servidor no responde o devuelve una lista vacía, cae al fichero
 * estático zonasConfig.js.
 *
 * @returns {Promise<Array>} array de zonas {id, apiId, nombre, color, puntos}
 */
export const loadZonasFromServer = async () => {
  try {
    const data = await getZonasConfig();
    if (Array.isArray(data) && data.length > 0) {
      return data;
    }
  } catch (err) {
    console.warn("[zonesStorage] No se pudo cargar zonas del servidor, usando fallback estático", err);
  }
  return zonasDefault;
};

/**
 * Persiste la configuración de zonas en el servidor. Solo admin.
 *
 * @param {Array} zonas - lista de zonas a guardar
 * @returns {Promise<Array>} lista de zonas tras el guardado (normalizada por el server)
 */
export const saveZonasToServer = async (zonas) => {
  const payload = zonas.map((z) => ({
    id: z.id,
    apiId: z.apiId || z.api_id || z.id,
    nombre: z.nombre,
    color: z.color || "#cccccc",
    puntos: z.puntos,
  }));
  return await updateZonasConfig(payload);
};

/**
 * Defaults estáticos (para inicializar el estado antes de la primera carga
 * asíncrona, y como fallback si la API falla).
 */
export const getDefaultZonas = () => zonasDefault;
