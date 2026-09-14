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
 * Carga las zonas del mapa DEL AYUNTAMIENTO ACTIVO desde el servidor.
 *
 * MULTI-TENANT: NO se cae al fichero estático `zonasConfig.js` cuando el
 * servidor devuelve una lista vacía. Ese fichero contiene las zonas concretas
 * de Santa Cruz; usarlo como fallback hacía que un ayuntamiento nuevo (sin
 * zonas propias) viera —y, si editaba, guardara— las zonas de Santa Cruz. Un
 * ayuntamiento sin zonas debe empezar VACÍO para dibujar las suyas.
 *
 * Las zonas de Santa Cruz viven en su propia BD (se importan con el resto de
 * sus datos), así que no se pierden.
 *
 * @returns {Promise<Array>} array de zonas {id, apiId, nombre, color, puntos}
 */
export const loadZonasFromServer = async () => {
  try {
    const data = await getZonasConfig();
    if (Array.isArray(data)) {
      return data;
    }
  } catch (err) {
    console.warn("[zonesStorage] No se pudo cargar zonas del servidor", err);
  }
  return [];
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
