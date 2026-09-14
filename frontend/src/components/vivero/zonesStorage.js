import { getZonasConfig, updateZonasConfig } from "../../api/api";

// Las zonas se persisten en el servidor (tabla zona_polygons), aisladas por
// ayuntamiento (cliente_id). Ya NO hay fallback al fichero estático
// zonasConfig.js: un ayuntamiento nuevo, sin zonas propias, empieza vacío.

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
 * IMPORTANTE: distingue "sin zonas" de "error". Una respuesta vacía del
 * servidor devuelve `[]` (ayuntamiento nuevo, caso legítimo); un fallo de red o
 * del backend se PROPAGA (throw) para que quien llama pueda avisar al usuario,
 * en vez de mostrar un mapa vacío indistinguible de "aún no configurado".
 *
 * @returns {Promise<Array>} array de zonas {id, apiId, nombre, color, puntos}
 * @throws si la petición falla (red o backend).
 */
export const loadZonasFromServer = async () => {
  const data = await getZonasConfig();
  return Array.isArray(data) ? data : [];
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
