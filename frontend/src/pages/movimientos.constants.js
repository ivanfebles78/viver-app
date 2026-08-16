/**
 * CONSTANTES Y ZONAS DE MOVIMIENTOS.
 *
 * Extraído de `Movimientos.jsx` SIN cambiar un solo valor. El callejero de
 * distritos y barrios, las zonas del vivero y sus reglas por categoría son
 * datos de dominio, no presentación: no tenían por qué vivir dentro de un
 * componente de 3 613 líneas.
 *
 * Las funciones de aquí se prueban en `movimientos.equivalence.test.js`
 * contra una copia literal de main.
 */

import { normalizeZonaCompare } from "../utils/zonas";
import { safeArray } from "./movimientos.logic";

const ZONA_ALMACEN_FITO = "almacen-fito";
const ZONA_ALMACEN_GENERAL = "almacen-general";
const ZONA_ALMACEN_FERT = "almacen-fert";
const ZONA_COMPOSTAJE = "Zona Compostaje";
const ZONAS_ESPECIALES = [
  ZONA_ALMACEN_FITO,
  ZONA_ALMACEN_GENERAL,
  ZONA_ALMACEN_FERT,
  ZONA_COMPOSTAJE,
];

// Fallback hardcoded por si la API de configuración de zonas falla.
// La lista real se carga dinámicamente desde el servidor en el componente
// principal y se pasa como prop a los hijos. Las zonas especiales siempre
// están disponibles aunque el servidor no las devuelva.
const DEFAULT_ZONAS = [
  "1", "2", "3a", "3b", "4a", "4b",
  "5", "6", "7", "8", "9a", "9b", "9c", "10a", "10b", "11", "12",
  ZONA_ALMACEN_FITO,
  ZONA_ALMACEN_GENERAL,
  ZONA_ALMACEN_FERT,
  ZONA_COMPOSTAJE,
];

// Orden natural: primero las zonas numéricas (por número, luego letra),
// y al final las zonas especiales (Almacén, Zona Compostaje).
// Ej: "1", "2", "3a", "3b", ..., "12", "Almacén", "Zona Compostaje".
function naturalSortZonas(zonas) {
  const parse = (id) => {
    const s = String(id).trim();
    const m = s.match(/^(\d+)([a-z]*)$/i);
    if (m) return [0, parseInt(m[1], 10), (m[2] || "").toLowerCase()];
    // Zonas no numéricas (Almacén, Zona Compostaje) van al final, alfabéticas.
    return [1, 0, s.toLowerCase()];
  };
  return [...zonas].sort((a, b) => {
    const [ga, na, la] = parse(a);
    const [gb, nb, lb] = parse(b);
    if (ga !== gb) return ga - gb;
    if (na !== nb) return na - nb;
    return la.localeCompare(lb);
  });
}

// Garantiza que las zonas especiales (Almacén, Zona Compostaje) aparezcan
// siempre, aunque el servidor devuelva solo zonas numéricas. La comparación
// se hace normalizada para evitar duplicados si el servidor ya tiene la
// zona pero con otro casing/tilde (p. ej. "almacen" vs "Almacén").
function ensureZonasEspeciales(zonas) {
  const seen = new Set(safeArray(zonas).map(normalizeZonaCompare));
  const out = [...safeArray(zonas)];
  for (const z of ZONAS_ESPECIALES) {
    if (!seen.has(normalizeZonaCompare(z))) out.push(z);
  }
  return naturalSortZonas(out);
}

const TAMANOS = ["Semillero", "M12", "M20", "M35"];

// Devuelve las zonas en las que un producto puede entrar/salir según su
// categoría. Reglas:
//   - Áridos / Material Vegetal → solo "Zona Compostaje".
//   - Fitosanitario              → solo "Almacén Fitosanitarios".
//   - Fertilizante               → solo "Almacén Fertilizantes".
//   - Ferretería                 → solo "Almacén General".
//   - Plantas (y cualquier otra) → solo zonas numéricas.
function getZonasPermitidasParaCategoria(producto, todasLasZonas) {
  if (!producto) return safeArray(todasLasZonas);

  // Usamos la normalización canónica de zonas (sin tildes, sin separadores,
  // sin prefijo "zona") para tolerar variantes de casing/escritura.
  const cat = (producto.categoria || "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

  const zonas = safeArray(todasLasZonas);

  if (cat === "arido" || cat === "aridos" || cat === "material vegetal" || cat === "materiales vegetales") {
    return zonas.filter((z) => normalizeZonaCompare(z) === normalizeZonaCompare(ZONA_COMPOSTAJE));
  }
  if (cat === "fitosanitario" || cat === "fitosanitarios") {
    return zonas.filter((z) => normalizeZonaCompare(z) === normalizeZonaCompare(ZONA_ALMACEN_FITO));
  }
  if (cat === "fertilizante" || cat === "fertilizantes") {
    return zonas.filter((z) => normalizeZonaCompare(z) === normalizeZonaCompare(ZONA_ALMACEN_FERT));
  }
  if (cat === "ferreteria") {
    return zonas.filter((z) => normalizeZonaCompare(z) === normalizeZonaCompare(ZONA_ALMACEN_GENERAL));
  }
  // Plantas y demás: zonas numéricas (excluir las especiales).
  return zonas.filter(
    (z) => !ZONAS_ESPECIALES.some((esp) => normalizeZonaCompare(esp) === normalizeZonaCompare(z))
  );
}

const DISTRITO_BARRIOS = {
  Anaga: [
    "Almáciga",
    "Afur",
    "Casas de La Cumbre",
    "Chamorga",
    "Cueva Bermeja",
    "El Bailadero",
    "El Suculum",
    "Igueste San Andrés",
    "La Alegría",
    "Lomo de las Bodegas-La Cumbrilla",
    "Los Campitos",
    "María Jiménez",
    "Roque Negro",
    "San Andrés",
    "Taborno",
    "Taganana",
    "Valle Tahodio",
    "Valleseco",
    "Benijo",
    "El Draguillo",
    "Catalanes",
  ],
  "Centro-Ifara": [
    "Barrio Nuevo",
    "Duggi",
    "Ifara",
    "Las Acacias",
    "Las Mimosas",
    "Los Hoteles",
    "Los Lavaderos",
    "Salamanca",
    "Toscal",
    "Urbanización Anaga",
    "Uruguay",
    "Zona Centro",
    "Zona Rambla",
  ],
  "La Salud-La Salle": [
    "Buenavista",
    "Chapatal",
    "Cruz del Señor",
    "Cuatro Torres",
    "Cuesta de Piedra",
    "El Cabo",
    "El Perú",
    "La Salle",
    "La Salud",
    "La Victoria",
    "Los Gladiolos",
    "Los Llanos",
    "San Sebastián",
    "Villa Ascensión",
  ],
  "Ofra-Costa Sur": [
    "Chimisay",
    "Ballester",
    "Buenos Aires",
    "Camino del Hierro",
    "César Casariego",
    "Chamberí",
    "Finca La Multa",
    "García Escámez",
    "Juan XXIII",
    "Las Cabritas",
    "Las Delicias",
    "Las Retamas",
    "Mayorazgo",
    "Miramar",
    "Moraditas",
    "Nuevo Obrero",
    "San Antonio",
    "San Pío X",
    "Santa Clara",
    "Somosierra",
    "Tío Pino",
    "Vista Bella",
  ],
  Suroeste: [
    "Acorán",
    "Añaza",
    "Barranco Grande",
    "Cuevas Blancas",
    "El Chorrillo",
    "El Sobradillo",
    "Llano del Moro",
    "Machado",
    "Radazul",
    "Santa María del Mar",
    "Tíncer",
  ],
};

// Destinos que exigen distrito/zona/dirección. Incluye los valores históricos
// ("Empresa", "Otro") y los nuevos ("UTE", "Otros"). "Baja Vivero" queda fuera
// a propósito: dar de baja no requiere dirección.

export {
  ZONA_ALMACEN_FITO,
  ZONA_ALMACEN_GENERAL,
  ZONA_ALMACEN_FERT,
  ZONA_COMPOSTAJE,
  ZONAS_ESPECIALES,
  DEFAULT_ZONAS,
  TAMANOS,
  DISTRITO_BARRIOS,
  naturalSortZonas,
  ensureZonasEspeciales,
  getZonasPermitidasParaCategoria,
};

/* Reexportadas para que las pantallas importen de un solo sitio. */
export {
  ORIGENES,
  DESTINOS_SALIDA_VIVERO,
  SALIDA_DESTINOS,
  ENTRADA_ORIGENES,
  DEVOLUCION_ORIGENES,
  ENTRADA_ORIGEN_OTROS,
  DESTINOS_EXTERNOS,
  TIPOS_MOVIMIENTO,
} from "./movimientos.logic";
