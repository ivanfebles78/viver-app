/**
 * LÓGICA DEL MAPA DEL VIVERO.
 *
 * Extraída de `ZoneEditor.jsx` y `ZonaMapDialog.jsx@27523fb` **sin cambiar una
 * regla**. Aquí vive la validación de identificadores de zona, la resolución
 * del identificador contra el backend y la geometría de los polígonos.
 *
 * `zonas.logic.test.js` la compara con una copia literal de main.
 */

import zonasDefault, { PALETA_ZONAS } from "./zonasConfig";

export { PALETA_ZONAS };

/* ── Geometría ─────────────────────────────────────────────────────────── */

/** Mínimo de vértices de un polígono: por debajo deja de ser un área. */
export const MIN_VERTICES = 3;

/** Lienzo del plano, en unidades del `viewBox`. */
export const MAP_WIDTH = 2048;
export const MAP_HEIGHT = 1365;

/** Cuadrado por defecto de una zona nueva, en el centro del plano. */
export const defaultNewZonaPoints = () => [
  [950, 600],
  [1100, 600],
  [1100, 750],
  [950, 750],
];

/**
 * Quita un vértice, respetando el mínimo.
 *
 * Devuelve la MISMA lista si quitarlo dejaría el polígono por debajo de tres
 * puntos: es lo que hace main, y es lo correcto — un «polígono» de dos puntos
 * no se puede pintar ni clicar.
 */
export function quitarVertice(points, idx) {
  if (!Array.isArray(points) || points.length <= MIN_VERTICES) return points;
  return points.filter((_, i) => i !== idx);
}

/** Inserta el punto medio de la arista que empieza en `edgeIdx`. */
export function insertarVertice(points, edgeIdx) {
  const next = (edgeIdx + 1) % points.length;
  const [x1, y1] = points[edgeIdx];
  const [x2, y2] = points[next];
  const mid = [(x1 + x2) / 2, (y1 + y2) / 2];
  return [...points.slice(0, edgeIdx + 1), mid, ...points.slice(edgeIdx + 1)];
}

/** Mueve un vértice a una posición absoluta. */
export function moverVertice(points, idx, x, y) {
  return points.map((p, i) => (i === idx ? [x, y] : p));
}

/** Desplaza el polígono entero. */
export function desplazarPoligono(points, dx, dy) {
  return points.map(([px, py]) => [px + dx, py + dy]);
}

/* ── Identificador de zona nueva ───────────────────────────────────────── */

export const ERRORES_ID = {
  VACIO: "Identificador vacío. Operación cancelada.",
  INVALIDO: "Identificador inválido. Operación cancelada.",
  DUPLICADO: (fullId) => `Ya existe una zona con id "${fullId}".`,
  CARACTERES: "El identificador solo puede contener letras (a-z), números y guiones.",
};

/**
 * Valida el identificador tecleado para una zona nueva.
 *
 * EL ORDEN DE LAS RAMAS ES EL CONTRATO. En particular, el duplicado se
 * comprueba ANTES que el juego de caracteres: un identificador que sea a la vez
 * duplicado e inválido avisa de que ya existe, no de que sea inválido.
 * Invertirlas cambia el mensaje que ve el usuario.
 *
 * La normalización del prefijo existe por un defecto real ya corregido: sin
 * ella, teclear «zona9b» creaba «zona-zona9b», con el prefijo duplicado.
 *
 * @returns {{ok: true, apiId, fullId} | {ok: false, error: string}}
 */
export function validarNuevoId(raw, zonasExistentes = []) {
  const cleaned = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!cleaned) return { ok: false, error: ERRORES_ID.VACIO };

  const apiId = cleaned.replace(/^zona[-_]?/i, "");
  if (!apiId) return { ok: false, error: ERRORES_ID.INVALIDO };

  const fullId = `zona-${apiId}`;

  if (zonasExistentes.some((z) => z.id === fullId)) {
    return { ok: false, error: ERRORES_ID.DUPLICADO(fullId) };
  }
  if (!/^[a-z0-9-]+$/.test(apiId)) {
    return { ok: false, error: ERRORES_ID.CARACTERES };
  }

  return { ok: true, apiId, fullId };
}

/** Zona nueva ya validada. El color lo inyecta quien llama, para poder fijarlo. */
export function construirZonaNueva(apiId, fullId, color) {
  return {
    id: fullId,
    apiId,
    nombre: `Zona ${apiId}`,
    color,
    _points: defaultNewZonaPoints(),
  };
}


/* ── Resolución del identificador contra el backend ────────────────────── */

/** Normalización base: minúsculas, sin diacríticos, sin separadores. */
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

/** Igual que `_normalize_zona_id` del backend: quita el prefijo «zona». */
const normZona = (s) => {
  let r = norm(s);
  if (r.startsWith("zonazona")) r = r.slice(8);
  if (r.startsWith("zona")) r = r.slice(4);
  return r;
};

const normPuntos = (s) => String(s || "").replace(/\s+/g, " ").trim();

/**
 * Identificador con el que consultar el inventario de una zona.
 *
 * La config guardada en el servidor puede traer ids corruptos —una celda «3b»
 * guardada como `zona-3`—, así que se resuelve contra la config canónica por
 * cuatro vías, DE MÁS FIABLE A MENOS:
 *
 *   1. Por GEOMETRÍA. Los puntos del polígono son los canónicos aunque el id y
 *      el nombre estén corruptos: es la vía que no miente.
 *   2. Por nombre canónico.
 *   3. Por id o apiId canónico, tolerante al prefijo.
 *   4. Fallback: quitar el prefijo del apiId o del id.
 *
 * EL ORDEN ES EL CONTRATO: adelantar la vía 3 a la 1 haría que una celda con el
 * id corrupto consultara el inventario de OTRA zona.
 */
export function resolveZoneApiId(zone, canonicas = zonasDefault) {
  if (zone?.puntos) {
    const porPuntos = canonicas.find((c) => normPuntos(c.puntos) === normPuntos(zone.puntos));
    if (porPuntos?.apiId) return porPuntos.apiId;
  }
  const porNombre = canonicas.find((c) => normZona(c.nombre) === normZona(zone?.nombre));
  if (porNombre?.apiId) return porNombre.apiId;

  const porId = canonicas.find(
    (c) =>
      normZona(c.id) === normZona(zone?.id) ||
      (zone?.apiId && normZona(c.apiId) === normZona(zone?.apiId)) ||
      normZona(c.apiId) === normZona(zone?.id)
  );
  if (porId?.apiId) return porId.apiId;

  return String(zone?.apiId || zone?.id || "").replace(/^zona[-_]?/i, "");
}

/* ── Inventario de la zona ─────────────────────────────────────────────── */

/**
 * Productos DIFERENTES de una zona.
 *
 * Una misma especie en varios tamaños cuenta como un solo producto: es lo que
 * el personal del vivero entiende por «cuántos productos hay aquí».
 */
export function contarProductosDistintos(items) {
  return new Set(
    (Array.isArray(items) ? items : [])
      .map((i) => String(i.nombre_cientifico || i.cientifico || i.producto || "").trim().toLowerCase())
      .filter(Boolean)
  ).size;
}

/** Nombre visible de un producto del inventario de zona. */
export const nombreItem = (item) =>
  item?.nombre_cientifico || item?.cientifico || item?.producto || "Producto";
