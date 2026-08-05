import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  getMovimientos,
  getProductos,
  getPedidos,
  createMovimiento,
} from "../api/api";
import { loadZonasFromServer } from "../components/vivero/zonesStorage";
import { formatUsername } from "../utils/format";
import {
  getProductFormatoConfig,
  getFormatoOptions,
  getUnidadMovimiento,
  tamanoDisponiblePlanta,
} from "../utils/formato";
import { formatCantidad, formatCantidadConUnidad } from "../utils/numero";
import {
  normalizeZonaCompare,
  getZonaDisplayName,
  getZonaLabel,
} from "../utils/zonas";
import VerPlanta from "../components/VerPlanta";
import { formatFechaCanaria, formatFechaHoraCanaria, datetimeLocalToUtcIso } from "../utils/fecha";

// Zonas especiales (no numéricas) — dedicadas a categorías concretas.
// El almacén general original se ha subdividido en tres almacenes
// especializados: fitosanitarios, general (ferretería) y fertilizantes.
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

const ORIGENES = [
  "Empresa Externa",
  "Otro",
  "Vivero",
  "Palmetum",
  "Empresa",
  "Organismo oficial",
  "Colegio",
];

const DESTINOS_SALIDA_VIVERO = [
  "Empresa",
  "Organismo oficial",
  "Colegio",
  "Otro",
  "Palmetum",
  "Baja Vivero",
  "Vivero",
];

// ── Opciones de subtipo según el tipo de movimiento (paso 1) ──
// Entrada: de dónde llega el material al vivero. "Otros" abre un campo para
// especificar (Palmetum u otra entidad).
const ENTRADA_ORIGENES = [
  "Producción propia",
  "Proveedores del vivero",
  "Otros",
];

// Devolución: quién devuelve material prestado al vivero.
const DEVOLUCION_ORIGENES = ["Organismo oficial", "Colegio", "Otros"];

// Salida: hacia dónde sale el material. En todas salvo "Baja Vivero" se exige
// distrito, zona y dirección (ver isExternalDestination / DESTINOS_EXTERNOS).
const SALIDA_DESTINOS = [
  "Baja Vivero",
  "UTE",
  "Palmetum",
  "Organismo oficial",
  "Colegio",
  "Otros",
];

// El valor de subtipo de entrada que activa el campo "especificar".
const ENTRADA_ORIGEN_OTROS = "Otros";

const TIPOS_MOVIMIENTO = [
  { value: "entrada", label: "Entrada" },
  { value: "salida", label: "Salida" },
  { value: "traslado_interno", label: "Traslado" },
  { value: "devolucion", label: "Devolución" },
];

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
const DESTINOS_EXTERNOS = ["Empresa", "Organismo oficial", "Colegio", "Otro", "Otros", "Palmetum", "UTE"];

const safeArray = (x) => (Array.isArray(x) ? x : []);

const fmtFechaES = (value) => formatFechaCanaria(value);

const dateInputValue = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

// "YYYY-MM-DDTHH:mm" de la fecha/hora local actual, para inputs datetime-local.
const defaultFechaLocal = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};


function normalizeTamanoForStock(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "semillero") return "Semillero";
  if (raw == "m12") return "M12";
  if (raw == "m20") return "M20";
  if (raw == "m30") return "M35";
  return String(value || "").trim();
}

function buildStockKey(productoId, zona, tamano) {
  const normalizedTamano = normalizeTamanoForStock(tamano);
  if (!productoId || !zona || !normalizedTamano) return "";
  return `${productoId}__${String(zona).toLowerCase()}__${normalizedTamano}`;
}

function getProductDisplayName(p) {
  // Muestra ambos nombres concatenados ("Latín — Común") cuando difieren,
  // para que el usuario pueda distinguir entre productos con el mismo nombre
  // genérico (p.ej. varias especies de "Acalifa"). Si solo hay uno, lo usa.
  const cient = (p?.nombre_cientifico || p?.producto_nombre_cientifico || "").trim();
  const natural = (p?.nombre_natural || "").trim();
  if (cient && natural && cient.toLowerCase() !== natural.toLowerCase()) {
    return `${cient} — ${natural}`;
  }
  return cient || natural || `Producto #${p?.id || p?.producto_id || "—"}`;
}

function isExternalDestination(value) {
  return DESTINOS_EXTERNOS.includes(String(value || "").trim());
}

function isDevolucionOrigen(value) {
  return ["Empresa", "Organismo oficial", "Colegio", "Otro", "Otros"].includes(String(value || "").trim());
}

function getMovimientoTipo(m) {
  const o = String(m?.origen_tipo || "").trim().toLowerCase();
  const d = String(m?.destino_tipo || "").trim().toLowerCase();

  if (o === "vivero" && d === "vivero") return "traslado_interno";

  if (
    d === "vivero" &&
    ["empresa", "organismo oficial", "colegio", "otro", "otros"].includes(o)
  ) {
    return "devolucion";
  }

  if (d === "vivero") return "entrada";

  return "salida";
}

function getTipoDisplayLabel(tipo) {
  const t = String(tipo || "").toLowerCase();
  if (t === "traslado_interno") return "Traslado";
  if (t === "entrada") return "Entrada";
  if (t === "salida") return "Salida";
  if (t === "devolucion") return "Devolución";
  return tipo || "—";
}

function tipoTextStyle(tipo) {
  const t = String(tipo || "").toLowerCase();

  if (t === "entrada") {
    return { fontWeight: 900, color: "#065f46" };
  }
  if (t === "salida") {
    return { fontWeight: 900, color: "#991b1b" };
  }
  if (t === "devolucion") {
    return { fontWeight: 900, color: "#92400e" };
  }
  return { fontWeight: 900, color: "#1e3a8a" };
}

function prestamoTextStyle(kind) {
  if (kind === "prestamo") return { fontWeight: 900, color: "#1e3a8a" };
  if (kind === "devolucion") return { fontWeight: 900, color: "#92400e" };
  return { fontWeight: 700, color: "#64748b" };
}

function getDestinoOptions(origenTipo) {
  if (!origenTipo) return [];
  // Desde el vivero: salida hacia destinos externos (lista nueva).
  if (origenTipo === "Vivero") return SALIDA_DESTINOS;
  // Cualquier otro origen (proveedor, producción propia, devolución…) entra al vivero.
  return ["Vivero"];
}

function thStyle() {
  return {
    textAlign: "left",
    padding: "12px 10px",
    color: "#334155",
    fontWeight: 900,
    fontSize: 13,
    borderBottom: "1px solid rgba(15,23,42,0.10)",
  };
}

function tdStyle() {
  return {
    padding: "12px 10px",
    verticalAlign: "top",
    color: "#0f172a",
    fontWeight: 700,
  };
}

function buildLabelOrigen(m) {
  if (m?.origen_tipo === "Vivero") {
    return `Vivero${m?.zona_origen ? ` · ${getZonaLabel(m.zona_origen)}` : ""}${m?.tamano_origen ? ` · ${m.tamano_origen}` : ""}`;
  }
  return m?.origen_tipo || "—";
}

function buildLabelDestino(m) {
  if (m?.destino_tipo === "Vivero") {
    return `Vivero${m?.zona_destino ? ` · ${getZonaLabel(m.zona_destino)}` : ""}${m?.tamano_destino ? ` · ${m.tamano_destino}` : ""}`;
  }

  if (isExternalDestination(m?.destino_tipo)) {
    const parts = [m?.distrito_destino, m?.barrio_destino, m?.direccion_destino].filter(Boolean);
    return parts.length ? `${m.destino_tipo} · ${parts.join(" · ")}` : m.destino_tipo;
  }

  return m?.destino_tipo || "—";
}

function buildStockByProductZoneSize(movimientos) {
  const map = new Map();

  const add = (productoId, zona, tamano, delta) => {
    if (!productoId || !zona || !tamano) return;
    const key = `${productoId}__${String(zona).toLowerCase()}__${tamano}`;
    map.set(key, (map.get(key) || 0) + delta);
  };

  for (const m of safeArray(movimientos)) {
    const productoId = m?.producto_id;
    const cantidad = Number(m?.cantidad || 0);
    const origenTipo = String(m?.origen_tipo || "").trim().toLowerCase();
    const destinoTipo = String(m?.destino_tipo || "").trim().toLowerCase();

    if (!productoId || !cantidad) continue;

    if (destinoTipo === "vivero" && m?.zona_destino && m?.tamano_destino) {
      add(productoId, m.zona_destino, m.tamano_destino, cantidad);
    }

    if (origenTipo === "vivero" && m?.zona_origen && m?.tamano_origen) {
      add(productoId, m.zona_origen, m.tamano_origen, -cantidad);
    }
  }

  return map;
}

function getFormErrors(form, formatoConfig = null) {
  const errs = [];

  if (!form.producto_id) errs.push("Debes seleccionar un producto.");
  // Cantidad: solo se exige si el formato lo muestra (no en fitosanitarios/fertilizantes).
  if (formatoConfig?.showCantidad !== false) {
    if (!form.cantidad || Number(form.cantidad) <= 0) errs.push("La cantidad debe ser mayor que 0.");
  }
  if (!form.origen_tipo) errs.push("Debes seleccionar un origen.");
  if (!form.destino_tipo) errs.push("Debes seleccionar un destino.");

  // Para fitosanitarios/fertilizantes, observaciones es obligatorio.
  if (formatoConfig?.observacionesRequired && !(form.observaciones || "").trim()) {
    errs.push("Para fitosanitarios y fertilizantes debes indicar la cantidad y el envase en observaciones.");
  }

  if (form.origen_tipo === form.destino_tipo && form.origen_tipo !== "Vivero") {
    errs.push("No se permite mover entre el mismo origen y destino salvo traslado interno en vivero.");
  }

  if (
    ["Empresa Externa", "Otro", "Palmetum", "Empresa", "Organismo oficial", "Colegio"].includes(form.origen_tipo) &&
    form.destino_tipo !== "Vivero"
  ) {
    errs.push(`${form.origen_tipo} solo puede mover hacia Vivero.`);
  }

  if (form.origen_tipo === "Vivero" && !form.zona_origen) {
    errs.push("Debes seleccionar una zona de origen del vivero.");
  }

  if (form.origen_tipo === "Vivero" && !form.tamano_origen) {
    errs.push("Debes seleccionar un tamaño de origen.");
  }

  if (form.destino_tipo === "Vivero" && !form.zona_destino) {
    errs.push("Debes seleccionar una zona de destino del vivero.");
  }

  if (form.destino_tipo === "Vivero" && !form.tamano_destino) {
    errs.push("Debes seleccionar un tamaño de destino.");
  }

  if (isExternalDestination(form.destino_tipo)) {
    if (!form.distrito_destino) errs.push("Debes seleccionar un distrito.");
    if (!form.barrio_destino) errs.push("Debes seleccionar un barrio.");
    if (!form.direccion_destino) errs.push("Debes indicar una dirección.");
  }

  if (
    form.origen_tipo === "Vivero" &&
    form.destino_tipo === "Vivero" &&
    form.zona_origen &&
    form.zona_destino &&
    form.zona_origen === form.zona_destino &&
    form.tamano_origen === form.tamano_destino
  ) {
    errs.push("El traslado interno debe cambiar de zona o de tamaño.");
  }

  if (form.fecha_disponibilidad) {
    if (form.destino_tipo !== "Vivero" || form.tamano_destino !== "M35") {
      errs.push("La fecha de disponibilidad solo aplica a movimientos a Vivero con tamaño M35.");
    } else {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const f = new Date(`${form.fecha_disponibilidad}T00:00:00`);
      if (Number.isNaN(f.getTime()) || f <= hoy) {
        errs.push("La fecha de disponibilidad debe ser futura.");
      }
    }
  }

  return errs;
}

function inputStyle() {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(15,23,42,0.10)",
    outline: "none",
    fontWeight: 700,
    color: "#0f172a",
    background: "#fff",
    boxSizing: "border-box",
  };
}

// Paleta de tonos sutiles para diferenciar las secciones del modal:
//   - "azul"  → Origen / Destino (sugiere flujo, traslado)
//   - "verde" → Producto (vivero, naturaleza)
//   - "ambar" → Detalles del producto (información complementaria)
const SECTION_PALETTE = {
  neutro: { bg: "rgba(255,255,255,0.92)", border: "rgba(15,23,42,0.10)", title: "#0f172a", divider: "rgba(15,23,42,0.06)" },
  azul:   { bg: "rgba(59,130,246,0.06)",  border: "rgba(59,130,246,0.22)", title: "#1d4ed8", divider: "rgba(59,130,246,0.16)" },
  verde:  { bg: "rgba(16,185,129,0.06)",  border: "rgba(16,185,129,0.22)", title: "#065f46", divider: "rgba(16,185,129,0.16)" },
  ambar:  { bg: "rgba(245,158,11,0.06)",  border: "rgba(245,158,11,0.25)", title: "#92400e", divider: "rgba(245,158,11,0.18)" },
};

// Contenedor visual de cada bloque del formulario (Origen/Destino, Producto,
// Detalles del producto). Agrupa visualmente los campos relacionados y
// usa un tono sutil para que cada sección sea distinguible a simple vista.
function sectionStyle(tono = "neutro") {
  const p = SECTION_PALETTE[tono] || SECTION_PALETTE.neutro;
  return {
    marginTop: 16,
    padding: 16,
    borderRadius: 18,
    background: p.bg,
    border: `1px solid ${p.border}`,
  };
}

function sectionTitleStyle(tono = "neutro") {
  const p = SECTION_PALETTE[tono] || SECTION_PALETTE.neutro;
  return {
    fontSize: 13,
    fontWeight: 900,
    color: p.title,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottom: `1px solid ${p.divider}`,
  };
}

function fieldLabelStyle() {
  return {
    fontSize: 12,
    fontWeight: 900,
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 6,
  };
}

function gridTwoCols() {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 14,
  };
}

function closeButtonStyle() {
  return {
    padding: "10px 16px",
    borderRadius: 14,
    fontWeight: 900,
    cursor: "pointer",
    transition: "all 0.18s ease",
    background: "#f59e0b",
    color: "#111827",
    border: "2px solid #000000",
    boxShadow: "0 8px 18px rgba(0,0,0,0.18)",
  };
}

function cancelButtonStyle(disabled = false) {
  return {
    padding: "10px 16px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.18)",
    background: disabled ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)",
    color: "white",
    fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.7 : 1,
  };
}

function MessageBanner({ msg, onClose, isError }) {
  if (!msg) return null;

  return (
    <div
      style={{
        marginTop: 12,
        padding: "12px 14px",
        borderRadius: 14,
        border: isError
          ? "1px solid rgba(239,68,68,0.20)"
          : "1px solid rgba(16,185,129,0.22)",
        background: isError
          ? "rgba(239,68,68,0.08)"
          : "rgba(16,185,129,0.10)",
        color: isError ? "#991b1b" : "#065f46",
        fontWeight: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <span>{msg}</span>

      <button
        onClick={onClose}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: 18,
          fontWeight: 900,
          color: isError ? "#991b1b" : "#065f46",
          lineHeight: 1,
        }}
        aria-label="Cerrar mensaje"
        title="Cerrar"
      >
        ×
      </button>
    </div>
  );
}

function PedidoSelectorModal({ open, pedidos, onClose, onSelect }) {
  const [texto, setTexto] = useState("");

  const pedidosFiltrados = useMemo(() => {
    const t = texto.trim().toLowerCase();
    const SERVICEABLE = new Set(["APROBADO", "APROBADO_PARCIAL"]);
    return safeArray(pedidos)
      .filter((p) => SERVICEABLE.has(String(p?.estado || "").toUpperCase()))
      .filter((p) => {
        if (!t) return true;
        const base = [
          p?.id, p?.solicitante_username, p?.distrito_destino,
          p?.barrio_destino, p?.direccion_destino,
          ...(safeArray(p?.items).map((it) => `${it?.producto_nombre || ""} ${it?.tamano || ""} ${it?.cantidad || ""}`)),
        ].filter(Boolean).join(" ").toLowerCase();
        return base.includes(t);
      });
  }, [pedidos, texto]);

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,0.60)", backdropFilter: "blur(4px)", zIndex: 1300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: "min(860px, 95vw)", maxHeight: "88vh", background: "#fff", borderRadius: 20, boxShadow: "0 40px 100px rgba(2,6,23,0.40)", border: "1px solid rgba(15,23,42,0.12)", display: "flex", flexDirection: "column", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: "18px 22px 14px", background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#fff" }}>Pedidos aprobados</div>
            <div style={{ marginTop: 3, color: "rgba(255,255,255,0.60)", fontWeight: 700, fontSize: 13 }}>Selecciona un pedido para cargar sus datos automáticamente.</div>
          </div>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 10, fontWeight: 900, cursor: "pointer", background: "#f59e0b", color: "#111827", border: "2px solid #000", fontSize: 13 }}>✕ Cerrar</button>
        </div>

        {/* Search */}
        <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(15,23,42,0.08)", flexShrink: 0, background: "#f8fafc" }}>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="🔍  Buscar por ID, solicitante, producto, dirección..." style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(15,23,42,0.15)", outline: "none", fontWeight: 700, color: "#0f172a", background: "#fff", boxSizing: "border-box", fontSize: 14 }} />
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
          {pedidosFiltrados.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "#64748b", fontWeight: 700, fontSize: 14 }}>
              No hay pedidos aprobados que coincidan.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {pedidosFiltrados.map((p) => (
                <div key={p.id} style={{ borderRadius: 14, border: "2px solid rgba(15,23,42,0.10)", background: "#fff", overflow: "hidden", boxShadow: "0 2px 8px rgba(2,6,23,0.06)" }}>
                  {/* Pedido header */}
                  <div style={{ padding: "12px 16px", background: "#f8fafc", borderBottom: "1px solid rgba(15,23,42,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 900, color: "#0f172a" }}>Pedido #{p.id}</div>
                      <div style={{ marginTop: 2, color: "#64748b", fontWeight: 700, fontSize: 12 }}>
                        {fmtFechaES(p.created_at)} · <span style={{ color: "#334155" }}>{p.solicitante_username || "—"}</span>
                        {" · "}<span style={{ color: p.tipo === "reposicion" ? "#92400e" : "#1e3a8a", fontWeight: 900 }}>{p.tipo === "reposicion" ? "Reposición" : "Salida"}</span>
                      </div>
                      <div style={{ marginTop: 2, color: "#64748b", fontWeight: 700, fontSize: 12 }}>
                        📍 {p.tipo === "reposicion" ? "Vivero" : ([p.distrito_destino, p.barrio_destino, p.direccion_destino].filter(Boolean).join(" · ") || "—")}
                      </div>
                    </div>
                    <button onClick={() => onSelect(p)} style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid rgba(16,185,129,0.35)", background: "linear-gradient(90deg, #10b981 0%, #06b6d4 100%)", color: "white", fontWeight: 900, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}>
                      ✓ Usar pedido
                    </button>
                  </div>
                  {/* Items */}
                  <div style={{ padding: "10px 16px", display: "grid", gap: 6 }}>
                    {safeArray(p.items).map((it, idx) => (
                      <div key={`${p.id}-${idx}`} style={{ padding: "8px 12px", borderRadius: 8, background: "#f8fafc", border: "1px solid rgba(15,23,42,0.07)", display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <div style={{ fontWeight: 800, color: "#0f172a", fontSize: 13 }}>{it.producto_nombre || `Producto #${it.producto_id}`}</div>
                        <div style={{ color: "#64748b", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}>{it.tamano || "—"} · {formatCantidad(it.cantidad) || "0"} uds</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function StepIndicator({ step, tipoMovimiento }) {
  const steps = [{ n: 1, label: "Tipo" }, { n: 2, label: "Producto y cantidad" }, { n: 3, label: "Destino" }];
  const colors = { entrada: "#10b981", salida: "#ef4444", traslado_interno: "#3b82f6", devolucion: "#f59e0b" };
  const accent = colors[tipoMovimiento] || "#06b6d4";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 24 }}>
      {steps.map((s, i) => (
        <React.Fragment key={s.n}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 14, background: step >= s.n ? accent : "rgba(255,255,255,0.10)", color: step >= s.n ? "#fff" : "rgba(255,255,255,0.40)", border: step === s.n ? `2px solid ${accent}` : "2px solid transparent", transition: "all 0.25s ease" }}>
              {step > s.n ? "✓" : s.n}
            </div>
            <div style={{ fontSize: 10, fontWeight: 800, color: step >= s.n ? "#fff" : "rgba(255,255,255,0.40)", letterSpacing: "0.05em" }}>{s.label}</div>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 2, marginBottom: 18, background: step > s.n ? accent : "rgba(255,255,255,0.12)", transition: "background 0.3s ease" }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function TipoCard({ tipo, label, desc, icon, selected, onClick, disabled = false, disabledHint }) {
  const colors = {
    entrada: { bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.35)", accent: "#10b981", text: "#065f46" },
    salida: { bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.30)", accent: "#ef4444", text: "#991b1b" },
    traslado_interno: { bg: "rgba(59,130,246,0.10)", border: "rgba(59,130,246,0.30)", accent: "#3b82f6", text: "#1e3a8a" },
    devolucion: { bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.30)", accent: "#f59e0b", text: "#92400e" },
  };
  const c = colors[tipo] || colors.traslado_interno;
  return (
    <button type="button" onClick={disabled ? undefined : onClick} disabled={disabled} title={disabled ? disabledHint : undefined} style={{ padding: "14px 12px", borderRadius: 14, border: selected ? `2px solid ${c.accent}` : "2px solid transparent", background: selected ? c.bg : "rgba(255,255,255,0.04)", cursor: disabled ? "not-allowed" : "pointer", textAlign: "left", transition: "all 0.18s ease", boxShadow: selected ? `0 0 0 3px ${c.accent}22` : "none", outline: "none", opacity: disabled ? 0.45 : 1 }}>
      <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontWeight: 900, fontSize: 14, color: selected ? c.text : "#334155" }}>{label}</div>
      <div style={{ marginTop: 3, fontSize: 11, fontWeight: 700, color: "#64748b", lineHeight: 1.4 }}>{disabled && disabledHint ? disabledHint : desc}</div>
    </button>
  );
}

function SLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>{children}</div>;
}

function MovimientoModal({
  open,
  onClose,
  productos,
  movimientos,
  pedidosAprobados,
  onSubmit,
  saving,
  zonas = DEFAULT_ZONAS,
}) {
  const ZONAS = zonas;
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    pedido_id: "", pedido_item_id: "", producto_id: "", cantidad: "",
    origen_tipo: "", destino_tipo: "", zona_origen: "", zona_destino: "",
    tamano_origen: "", tamano_destino: "", distrito_destino: "",
    barrio_destino: "", direccion_destino: "", cp_destino: "",
    observaciones: "", prestamo: false, fecha_disponibilidad: "",
    prestamo_referencia_id: null, tipo_elegido: "", origen_especificar: "",
    usar_fecha_personalizada: false, fecha_movimiento: "", prestamo_max: null,
  });
  const [errors, setErrors] = useState([]);
  const [showPedidoModal, setShowPedidoModal] = useState(false);
  const [selectedPedidoLineKey, setSelectedPedidoLineKey] = useState("");
  const [showPrestamoModal, setShowPrestamoModal] = useState(false);
  const [distribucion, setDistribucion] = useState({});
  // Zonas que el usuario ha añadido al reparto de una salida (vía desplegable).
  const [zonasSalida, setZonasSalida] = useState([]);
  // Zona elegida por cada línea de pedido (clave: line._key -> zona).
  // Asignación por línea y zona al servir: { [linea._key]: { [zonaId]: cantidad } }.
  // Permite repartir la cantidad de una línea entre varias zonas de origen.
  const [pedidoLineAlloc, setPedidoLineAlloc] = useState({});
  const setAllocQty = (key, zona, val) =>
    setPedidoLineAlloc((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), [zona]: val } }));
  const allocSum = (key) =>
    Object.values(pedidoLineAlloc[key] || {}).reduce((s, v) => s + Number(v || 0), 0);
  // Destinos colapsados (por texto) en la vista de servir el pedido.
  const [destinosColapsados, setDestinosColapsados] = useState({});
  const toggleDestinoColapsado = (dst) => setDestinosColapsados((p) => ({ ...p, [dst]: !p[dst] }));
  // Ref al bloque de zonas (salida/traslado) para auto-desplazar la vista a él
  // en cuanto se elige un producto.
  const salidaZonasRef = useRef(null);
  const [batchPayloads, setBatchPayloads] = useState([]);
  const [productoSearch, setProductoSearch] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroSubcategoria, setFiltroSubcategoria] = useState("");

  useEffect(() => {
    if (!open) {
      setStep(1);
      setForm({ pedido_id: "", pedido_item_id: "", producto_id: "", cantidad: "", origen_tipo: "", destino_tipo: "", zona_origen: "", zona_destino: "", tamano_origen: "", tamano_destino: "", distrito_destino: "", barrio_destino: "", direccion_destino: "", cp_destino: "", observaciones: "", prestamo: false, fecha_disponibilidad: "", prestamo_referencia_id: null, tipo_elegido: "", origen_especificar: "", usar_fecha_personalizada: false, fecha_movimiento: "", prestamo_max: null });
      setErrors([]);
      setSelectedPedidoLineKey("");
      setShowPedidoModal(false);
      setShowPrestamoModal(false);
      setDistribucion({});
      setZonasSalida([]);
      setPedidoLineAlloc({});
      setBatchPayloads([]);
      setProductoSearch("");
      setFiltroCategoria("");
      setFiltroSubcategoria("");
    }
  }, [open]);

  useEffect(() => {
    // En un traslado interno el destino es siempre "Vivero" (no es un destino
    // externo), así que no lo recalculamos a partir del origen.
    if (form.tipo_elegido === "traslado_interno") return;
    const allowed = getDestinoOptions(form.origen_tipo);
    if (form.origen_tipo && !allowed.includes(form.destino_tipo)) {
      // Si solo hay una opción de destino (entradas/devoluciones → "Vivero"),
      // la fijamos. Para salidas (varias opciones) dejamos vacío para que el
      // usuario elija explícitamente el destinatario.
      const fallback = allowed.length === 1 ? allowed[0] : "";
      setForm((prev) => ({ ...prev, destino_tipo: fallback, zona_destino: "", tamano_destino: "", distrito_destino: "", barrio_destino: "", direccion_destino: "", cp_destino: "", prestamo: false }));
    }
  }, [form.origen_tipo, form.destino_tipo, form.tipo_elegido]);

  const stockByProductZoneSize = useMemo(() => buildStockByProductZoneSize(movimientos), [movimientos]);
  const barriosDisponibles = useMemo(() => form.distrito_destino ? DISTRITO_BARRIOS[form.distrito_destino] || [] : [], [form.distrito_destino]);

  const movimientosPreviosPorPedido = useMemo(() => {
    const map = new Map();
    for (const mov of safeArray(movimientos)) {
      const pedidoId = mov?.pedido_id; const productoId = mov?.producto_id;
      const tamano = mov?.tamano_origen || mov?.tamano_destino || "";
      const pedidoItemId = mov?.pedido_item_id;
      if (!pedidoId || !productoId) continue;
      if (pedidoItemId) { const k = `item__${pedidoItemId}`; map.set(k, (map.get(k) || 0) + Number(mov?.cantidad || 0)); }
      const kf = `pedido__${pedidoId}__prod__${productoId}__tam__${tamano}`;
      map.set(kf, (map.get(kf) || 0) + Number(mov?.cantidad || 0));
    }
    return map;
  }, [movimientos]);

  const cantidadesEnLote = useMemo(() => {
    const m = new Map();
    for (const p of batchPayloads) {
      if (!p?.pedido_item_id) continue;
      const k = Number(p.pedido_item_id);
      m.set(k, (m.get(k) || 0) + Number(p.cantidad || 0));
    }
    return m;
  }, [batchPayloads]);

  const selectedPedido = useMemo(() => safeArray(pedidosAprobados).find((p) => String(p.id) === String(form.pedido_id)) || null, [pedidosAprobados, form.pedido_id]);

  const pedidoLineas = useMemo(() => {
    return safeArray(selectedPedido?.items).map((it, idx) => {
      // Fuente de verdad: lo servido lo dice el backend (cantidad_servida), no
      // un recuento de movimientos. Una línea se puede mover si está APROBADA,
      // queda pendiente (servida < cantidad) y no está ya en el lote.
      const cant = Number(it?.cantidad || 0);
      const servidaBackend = Number(it?.cantidad_servida || 0);
      const cantidadEnLoteLocal = it?.id ? Number(cantidadesEnLote.get(Number(it.id)) || 0) : 0;
      const estadoItemRaw = String(it?.estado_item || "APROBADO").toUpperCase();
      const itemRechazado = estadoItemRaw === "DENEGADO";
      const itemPendiente = estadoItemRaw === "RESERVA";
      const itemNoServible = itemRechazado || itemPendiente;
      const yaServidaCompleto = cant > 0 && servidaBackend >= cant;
      const yaEnLote = cantidadEnLoteLocal > 0;
      const disabled = itemNoServible || yaServidaCompleto || yaEnLote;
      const razon = itemRechazado ? "item_denegado" : itemPendiente ? "item_pendiente" : yaEnLote ? "ya_en_lote" : yaServidaCompleto ? "ya_servida" : null;
      return { ...it, _key: `${selectedPedido?.id || "pedido"}-${it?.producto_id || "prod"}-${it?.tamano || "tam"}-${idx}`, _cantidad_movida: servidaBackend, _cantidad_en_lote: cantidadEnLoteLocal, _disabled: disabled, _razon_bloqueo: razon };
    });
  }, [selectedPedido, cantidadesEnLote]);

  const selectedProducto = productos.find((p) => String(p.id) === String(form.producto_id));
  const formatoConfig = useMemo(() => getProductFormatoConfig(selectedProducto), [selectedProducto]);

  useEffect(() => {
    if (!selectedProducto) return;
    if (formatoConfig.kind === "formato_fijo") {
      setForm((prev) => ({ ...prev, tamano_origen: formatoConfig.value, tamano_destino: formatoConfig.value }));
      return;
    }
    const valid = new Set(formatoConfig.options || []);
    setForm((prev) => {
      const t_o = valid.has(prev.tamano_origen) ? prev.tamano_origen : "";
      const t_d = valid.has(prev.tamano_destino) ? prev.tamano_destino : "";
      if (t_o === prev.tamano_origen && t_d === prev.tamano_destino) return prev;
      return { ...prev, tamano_origen: t_o, tamano_destino: t_d };
    });
  }, [selectedProducto?.id, formatoConfig.kind, formatoConfig.value]);

  useEffect(() => {
    if (!filtroCategoria) { if (filtroSubcategoria !== "") setFiltroSubcategoria(""); return; }
    const valid = new Set(safeArray(productos).filter((p) => String(p?.categoria || "").trim() === filtroCategoria).map((p) => String(p?.subcategoria || "").trim()).filter(Boolean));
    if (filtroSubcategoria && !valid.has(filtroSubcategoria)) setFiltroSubcategoria("");
  }, [filtroCategoria, productos, filtroSubcategoria]);

  useEffect(() => {
    if (!form.producto_id) return;
    const prod = safeArray(productos).find((p) => String(p.id) === String(form.producto_id));
    if (!prod) return;
    const catMismatch = filtroCategoria && String(prod?.categoria || "").trim() !== filtroCategoria;
    const subMismatch = filtroSubcategoria && String(prod?.subcategoria || "").trim() !== filtroSubcategoria;
    if (!catMismatch && !subMismatch) return;
    setForm((prev) => ({ ...prev, producto_id: "", pedido_item_id: "", cantidad: "", tamano_origen: "", tamano_destino: "", zona_origen: "", zona_destino: "", fecha_disponibilidad: "" }));
    setDistribucion({});
  }, [filtroCategoria, filtroSubcategoria, form.producto_id, productos]);

  const categoriasDisponibles = useMemo(() => {
    const set = new Set();
    for (const p of safeArray(productos)) { const c = String(p?.categoria || "").trim(); if (c) set.add(c); }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [productos]);

  const subcategoriasDisponibles = useMemo(() => {
    if (!filtroCategoria) return [];
    const set = new Set();
    for (const p of safeArray(productos)) {
      if (String(p?.categoria || "").trim() !== filtroCategoria) continue;
      const s = String(p?.subcategoria || "").trim(); if (s) set.add(s);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [productos, filtroCategoria]);

  const productosConStockOrigen = useMemo(() => {
    if (form.origen_tipo !== "Vivero") return null;
    const set = new Set();
    const zonaFiltro = form.zona_origen ? String(form.zona_origen).toLowerCase() : null;
    const tamanoFiltro = form.tamano_origen ? normalizeTamanoForStock(form.tamano_origen) : null;
    for (const [key, qty] of stockByProductZoneSize.entries()) {
      if (Number(qty) <= 0) continue;
      const parts = key.split("__"); if (parts.length < 3) continue;
      const [productoIdStr, zonaLower, tamano] = parts;
      if (zonaFiltro && zonaLower !== zonaFiltro) continue;
      if (tamanoFiltro && tamano !== tamanoFiltro) continue;
      set.add(Number(productoIdStr));
    }
    return set;
  }, [form.origen_tipo, form.zona_origen, form.tamano_origen, stockByProductZoneSize]);

  const filteredProductos = useMemo(() => {
    const needle = productoSearch.trim().toLowerCase();
    return safeArray(productos).filter((p) => {
      if (String(p.id) === String(form.producto_id)) return true;
      if (productosConStockOrigen && !productosConStockOrigen.has(Number(p.id))) return false;
      if (filtroCategoria && String(p?.categoria || "").trim() !== filtroCategoria) return false;
      if (filtroSubcategoria && String(p?.subcategoria || "").trim() !== filtroSubcategoria) return false;
      if (!needle) return true;
      const display = String(getProductDisplayName(p) || "").toLowerCase();
      const natural = String(p.nombre_natural || "").toLowerCase();
      const cientifico = String(p.nombre_cientifico || "").toLowerCase();
      return display.includes(needle) || natural.includes(needle) || cientifico.includes(needle);
    });
  }, [productos, productoSearch, form.producto_id, filtroCategoria, filtroSubcategoria, productosConStockOrigen]);

  const zonasPermitidasPorCategoria = useMemo(() => getZonasPermitidasParaCategoria(selectedProducto, ZONAS), [selectedProducto, ZONAS]);

  const availableOriginZones = useMemo(() => {
    if (form.origen_tipo !== "Vivero" || !form.producto_id) return zonasPermitidasPorCategoria;
    const formatoOptions = getFormatoOptions(formatoConfig);
    return zonasPermitidasPorCategoria.filter((zona) => {
      if (form.tamano_origen) return Number(stockByProductZoneSize.get(buildStockKey(form.producto_id, zona, form.tamano_origen)) || 0) > 0;
      return formatoOptions.some((t) => Number(stockByProductZoneSize.get(buildStockKey(form.producto_id, zona, t)) || 0) > 0);
    });
  }, [form.origen_tipo, form.producto_id, form.tamano_origen, stockByProductZoneSize, formatoConfig, zonasPermitidasPorCategoria]);

  const availableOriginSizes = useMemo(() => {
    const formatoOptions = getFormatoOptions(formatoConfig);
    if (form.origen_tipo !== "Vivero" || !form.producto_id) return formatoOptions;
    return formatoOptions.filter((tamano) => {
      if (form.zona_origen) return Number(stockByProductZoneSize.get(buildStockKey(form.producto_id, form.zona_origen, tamano)) || 0) > 0;
      return zonasPermitidasPorCategoria.some((z) => Number(stockByProductZoneSize.get(buildStockKey(form.producto_id, z, tamano)) || 0) > 0);
    });
  }, [form.origen_tipo, form.producto_id, form.zona_origen, stockByProductZoneSize, formatoConfig, zonasPermitidasPorCategoria]);

  useEffect(() => {
    if (form.origen_tipo === "Vivero" && form.zona_origen && !availableOriginZones.includes(form.zona_origen)) {
      setForm((prev) => ({ ...prev, zona_origen: "", tamano_origen: "" }));
    }
  }, [form.origen_tipo, form.zona_origen, availableOriginZones]);

  useEffect(() => {
    if (!selectedProducto) return;
    if (zonasPermitidasPorCategoria.length !== 1) return;
    const zonaUnica = zonasPermitidasPorCategoria[0];
    setForm((prev) => {
      const next = { ...prev }; let changed = false;
      if (prev.origen_tipo === "Vivero" && prev.zona_origen !== zonaUnica && availableOriginZones.includes(zonaUnica)) { next.zona_origen = zonaUnica; changed = true; }
      if (prev.destino_tipo === "Vivero" && prev.zona_destino !== zonaUnica) { next.zona_destino = zonaUnica; changed = true; }
      return changed ? next : prev;
    });
  }, [selectedProducto, zonasPermitidasPorCategoria, form.origen_tipo, form.destino_tipo, availableOriginZones]);

  useEffect(() => {
    if (!form.producto_id || !productosConStockOrigen) return;
    if (productosConStockOrigen.has(Number(form.producto_id))) return;
    setForm((prev) => ({ ...prev, producto_id: "", tamano_origen: prev.origen_tipo === "Vivero" ? "" : prev.tamano_origen, zona_origen: prev.origen_tipo === "Vivero" ? "" : prev.zona_origen, tamano_destino: prev.destino_tipo === "Vivero" ? "" : prev.tamano_destino, zona_destino: prev.destino_tipo === "Vivero" ? "" : prev.zona_destino }));
  }, [form.producto_id, productosConStockOrigen]);

  useEffect(() => {
    if (form.destino_tipo === "Vivero" && form.zona_destino && selectedProducto && !zonasPermitidasPorCategoria.includes(form.zona_destino)) {
      setForm((prev) => ({ ...prev, zona_destino: "" }));
    }
  }, [form.destino_tipo, form.zona_destino, selectedProducto, zonasPermitidasPorCategoria]);

  useEffect(() => {
    if (form.origen_tipo === "Vivero" && form.tamano_origen && !availableOriginSizes.includes(form.tamano_origen)) {
      setForm((prev) => ({ ...prev, tamano_origen: "" }));
    }
  }, [form.origen_tipo, form.tamano_origen, availableOriginSizes]);

  const esDevolucion = useMemo(() => form.tipo_elegido === "devolucion", [form.tipo_elegido]);
  // Para las SALIDAS, el paso 2 muestra todas las zonas (con su tamaño) que
  // tienen stock del producto y se indica cuánto sacar de cada una.
  // ¿Elegimos el ORIGEN por zona+tamaño en el paso 2? Aplica a salidas y a
  // traslados internos (en ambos el material sale de zonas del vivero y no se
  // puede conocer el tamaño sin elegir la zona).
  const salidaPorZonas = (form.tipo_elegido === "salida" || form.tipo_elegido === "traslado_interno") && form.origen_tipo === "Vivero";

  // Clave compuesta zona+tamaño para el reparto de una salida.
  const salidaKey = (zona, tamano) => `${zona}__${tamano}`;

  // Todas las combinaciones (zona, tamaño) con stock real del producto. Se
  // recorren las entradas reales del mapa de stock (no una lista fija de
  // tamaños) para no perder ninguna combinación, sea cual sea el tamaño con el
  // que esté guardada (M12, M20, M35, etc.).
  // El mapa de stock guarda la zona en minúsculas; para enviar al backend la
  // zona con su grafía real (coincide exactamente con InventarioLote) la
  // resolvemos contra la lista de zonas reales.
  const zonaIdByLower = useMemo(() => {
    const m = new Map();
    for (const z of ZONAS) m.set(String(z).toLowerCase(), z);
    return m;
  }, [ZONAS]);

  const salidaStockRows = useMemo(() => {
    if (!salidaPorZonas || !form.producto_id) return [];
    const pid = String(form.producto_id);
    const prod = safeArray(productos).find((p) => String(p.id) === pid);
    // Solo en SALIDAS aplicamos la regla de tamaño disponible (no en traslados
    // internos, donde hay que poder mover/reubicar cualquier tamaño).
    const esSal = form.tipo_elegido === "salida";
    const rows = [];
    for (const [key, qty] of stockByProductZoneSize.entries()) {
      if (Number(qty) <= 0) continue;
      const parts = key.split("__");
      if (parts.length < 3) continue;
      const [keyPid, zonaLower, ...rest] = parts;
      if (keyPid !== pid) continue;
      const tam = rest.join("__");
      if (esSal && !tamanoDisponiblePlanta(prod, tam)) continue;
      const zona = zonaIdByLower.get(zonaLower) || zonaLower;
      rows.push({ zona, tamano: tam, disponible: Number(qty) });
    }
    rows.sort(
      (a, b) =>
        String(a.zona).localeCompare(String(b.zona), undefined, { numeric: true }) ||
        String(a.tamano).localeCompare(String(b.tamano))
    );
    return rows;
  }, [salidaPorZonas, form.producto_id, form.tipo_elegido, productos, stockByProductZoneSize, zonaIdByLower]);

  // Disponible por clave zona__tamaño, para validar sin re-derivar de claves
  // en minúsculas.
  const salidaDispByKey = useMemo(() => {
    const m = {};
    for (const r of salidaStockRows) m[`${r.zona}__${r.tamano}`] = r.disponible;
    return m;
  }, [salidaStockRows]);

  const totalSalida = useMemo(
    () => Object.values(distribucion).reduce((a, b) => a + Number(b || 0), 0),
    [distribucion]
  );

  // Stock de la salida agrupado por zona → [{ tamaño, disponible }].
  const salidaStockByZona = useMemo(() => {
    const m = new Map();
    for (const r of salidaStockRows) {
      if (!m.has(r.zona)) m.set(r.zona, []);
      m.get(r.zona).push({ tamano: r.tamano, disponible: r.disponible });
    }
    return m;
  }, [salidaStockRows]);

  const zonasConStock = useMemo(() => Array.from(salidaStockByZona.keys()), [salidaStockByZona]);

  useEffect(() => { setDistribucion({}); setZonasSalida([]); }, [form.producto_id, form.origen_tipo]);

  // Al elegir un producto en una salida/traslado, lleva la vista al bloque de
  // zonas (que aparece debajo de la lista de productos) para que el usuario no
  // tenga que bajar a buscarlo.
  useEffect(() => {
    if (!salidaPorZonas || !form.producto_id || selectedPedido) return;
    const id = requestAnimationFrame(() => {
      salidaZonasRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(id);
  }, [salidaPorZonas, form.producto_id, selectedPedido]);

  // Si solo hay una zona con stock, la añadimos automáticamente.
  useEffect(() => {
    if (salidaPorZonas && zonasConStock.length === 1 && zonasSalida.length === 0) {
      setZonasSalida([zonasConStock[0]]);
    }
  }, [salidaPorZonas, zonasConStock, zonasSalida.length]);

  // En un traslado interno el formato se elige una vez (paso 2, sobre el
  // origen) y por defecto el destino conserva el mismo tamaño. El usuario aún
  // puede cambiarlo en el paso 3 ("posible cambio de tamaño").
  useEffect(() => {
    if (form.tipo_elegido !== "traslado_interno") return;
    if (form.tamano_origen && !form.tamano_destino) {
      setForm((prev) => ({ ...prev, tamano_destino: prev.tamano_origen }));
    }
  }, [form.tipo_elegido, form.tamano_origen, form.tamano_destino]);

  // Limpia el texto "especificar" cuando la entrada deja de ser "Otros".
  useEffect(() => {
    if (!(form.tipo_elegido === "entrada" && form.origen_tipo === ENTRADA_ORIGEN_OTROS) && form.origen_especificar) {
      setForm((prev) => ({ ...prev, origen_especificar: "" }));
    }
  }, [form.tipo_elegido, form.origen_tipo, form.origen_especificar]);

  const tipoPreview = useMemo(() => form.tipo_elegido || getMovimientoTipo(form), [form]);

  const prestamosActivos = useMemo(() => {
    const arr = safeArray(movimientos);
    const devolucionesPorRef = new Map();
    for (const m of arr) {
      if (m?.es_devolucion && m?.prestamo_referencia_id) {
        const k = Number(m.prestamo_referencia_id);
        devolucionesPorRef.set(k, (devolucionesPorRef.get(k) || 0) + Number(m.cantidad || 0));
      }
    }
    return arr.filter((m) => !!m?.es_prestamo).map((m) => {
      const devuelto = Number(devolucionesPorRef.get(Number(m.id)) || 0);
      const prestado = Number(m.cantidad || 0);
      return { ...m, _prestado: prestado, _devuelto: devuelto, _pendiente: Math.max(prestado - devuelto, 0) };
    }).filter((m) => m._pendiente > 0).sort((a, b) => new Date(b.fecha_movimiento || 0) - new Date(a.fecha_movimiento || 0));
  }, [movimientos]);

  const handleSeleccionPrestamo = (prestamo) => {
    const origenSugerido = prestamo?.destino_tipo || "Empresa";
    const tamanoOriginal = prestamo?.tamano_origen || prestamo?.tamano_destino || "";
    const notaBase = `Devolución del préstamo #${prestamo.id}${[prestamo?.distrito_destino, prestamo?.barrio_destino, prestamo?.direccion_destino].filter(Boolean).length ? ` (${[prestamo?.distrito_destino, prestamo?.barrio_destino, prestamo?.direccion_destino].filter(Boolean).join(" · ")})` : ""}`;
    setForm((prev) => ({ ...prev, pedido_id: prestamo?.pedido_id ? String(prestamo.pedido_id) : "", pedido_item_id: "", producto_id: String(prestamo.producto_id), cantidad: String(prestamo._pendiente), origen_tipo: origenSugerido, destino_tipo: "Vivero", zona_origen: "", tamano_origen: "", zona_destino: "", tamano_destino: tamanoOriginal, distrito_destino: "", barrio_destino: "", direccion_destino: "", cp_destino: "", observaciones: prev.observaciones || notaBase, prestamo: false, fecha_disponibilidad: "", prestamo_referencia_id: prestamo.id, prestamo_max: Number(prestamo._pendiente) || null }));
    setErrors([]); setShowPrestamoModal(false);
  };

  const handleSeleccionPedido = (pedido) => {
    const esReposicion = (pedido?.tipo || "salida") === "reposicion";
    setForm((prev) => ({ ...prev, pedido_id: String(pedido.id), pedido_item_id: "", producto_id: "", cantidad: "", origen_tipo: esReposicion ? "Empresa Externa" : "Vivero", destino_tipo: esReposicion ? "Vivero" : (DESTINOS_EXTERNOS.includes("Empresa") ? "Empresa" : "Otro"), zona_origen: "", zona_destino: "", tamano_origen: "", tamano_destino: "", distrito_destino: esReposicion ? "" : (pedido.distrito_destino || ""), barrio_destino: esReposicion ? "" : (pedido.barrio_destino || ""), direccion_destino: esReposicion ? "" : (pedido.direccion_destino || ""), cp_destino: "", observaciones: prev.observaciones || `Movimiento asociado al pedido #${pedido.id}`, prestamo: false, tipo_elegido: esReposicion ? "entrada" : "salida" }));
    setSelectedPedidoLineKey(""); setShowPedidoModal(false); setStep(2);
  };

  const usarLineaPedido = (linea) => {
    if (linea._disabled) return;
    const esReposicion = (selectedPedido?.tipo || "salida") === "reposicion";
    if (esReposicion) {
      setSelectedPedidoLineKey(linea._key);
      setForm((prev) => ({ ...prev, pedido_item_id: String(linea.id || ""), producto_id: String(linea.producto_id), cantidad: String(linea.cantidad || ""), origen_tipo: "Empresa Externa", destino_tipo: "Vivero", tamano_origen: "", zona_origen: "", tamano_destino: linea.tamano || "", zona_destino: prev.zona_destino || "", distrito_destino: "", barrio_destino: "", direccion_destino: "", observaciones: prev.observaciones || `Movimiento asociado al pedido #${selectedPedido?.id || ""}`, prestamo: false }));
      setErrors([]); return;
    }
    const destinoSugerido = DESTINOS_EXTERNOS.includes(form.destino_tipo) ? form.destino_tipo : "Empresa";
    setSelectedPedidoLineKey(linea._key);
    setForm((prev) => ({ ...prev, pedido_item_id: String(linea.id || ""), producto_id: String(linea.producto_id), cantidad: String(linea.cantidad || ""), origen_tipo: "Vivero", destino_tipo: destinoSugerido, tamano_origen: linea.tamano || "", zona_origen: prev.zona_origen || "", zona_destino: "", tamano_destino: "", distrito_destino: selectedPedido?.distrito_destino || prev.distrito_destino || "", barrio_destino: selectedPedido?.barrio_destino || prev.barrio_destino || "", direccion_destino: selectedPedido?.direccion_destino || prev.direccion_destino || "", observaciones: prev.observaciones || `Movimiento asociado al pedido #${selectedPedido?.id || ""}`, prestamo: prev.prestamo || false }));
    setErrors([]);
  };

  const buildCurrentPayloads = () => {
    const foundErrors = getFormErrors(form, formatoConfig);
    let filtered = [...foundErrors];
    // Devolución: no se puede devolver más de lo que queda pendiente del préstamo.
    if (esDevolucionTipo && form.prestamo_max && Number(form.cantidad) > Number(form.prestamo_max)) {
      filtered.push(`No puedes devolver más de lo pendiente del préstamo (${form.prestamo_max}).`);
    }
    if (salidaPorZonas) {
      // La cantidad y la zona/tamaño se eligen por fila en el paso 2; ignoramos
      // los errores de los campos únicos zona/tamaño/cantidad.
      filtered = filtered.filter((e) => {
        const l = e.toLowerCase();
        return !l.includes("zona de origen") && !l.includes("tamaño de origen") && !l.includes("tamano de origen") && !l.includes("cantidad debe ser mayor");
      });
      const elegidas = Object.entries(distribucion).filter(([, q]) => Number(q) > 0);
      if (elegidas.length === 0) filtered.push("Indica al menos una zona con cantidad > 0.");
      for (const [k, q] of elegidas) {
        const parts = k.split("__");
        const zona = parts[0];
        const tamano = parts.slice(1).join("__");
        const disp = Number(salidaDispByKey[k] || 0);
        if (Number(q) > disp) filtered.push(`${getZonaLabel(zona)} · ${tamano}: solicitado ${q} supera el disponible (${disp}).`);
      }
    } else if (form.origen_tipo === "Vivero" && form.zona_origen && form.tamano_origen) {
      // Salida/traslado desde una sola zona: la cantidad (paso 2) no puede
      // superar el stock disponible en esa zona y tamaño.
      const disp = Number(stockByProductZoneSize.get(buildStockKey(form.producto_id, form.zona_origen, form.tamano_origen)) || 0);
      const pedido = formatoConfig.allowDecimals ? Number(form.cantidad) : Math.round(Number(form.cantidad));
      if (pedido > disp) filtered.push(`La zona ${getZonaLabel(form.zona_origen)} solo tiene ${disp} disponibles para ${form.tamano_origen}.`);
    }
    if (filtered.length > 0) return { ok: false, payloads: [], errors: filtered };
    // Para una entrada "Otros", el origen real es el texto especificado
    // (p. ej. "Palmetum"). La columna origen_tipo admite hasta 30 caracteres.
    const origenTipoFinal =
      form.tipo_elegido === "entrada" &&
      form.origen_tipo === ENTRADA_ORIGEN_OTROS &&
      (form.origen_especificar || "").trim()
        ? (form.origen_especificar || "").trim().slice(0, 30)
        : form.origen_tipo;
    const basePayload = {
      pedido_id: form.pedido_id ? Number(form.pedido_id) : null,
      pedido_item_id: form.pedido_item_id ? Number(form.pedido_item_id) : null,
      producto_id: Number(form.producto_id),
      origen_tipo: origenTipoFinal, destino_tipo: form.destino_tipo,
      tamano_origen: form.origen_tipo === "Vivero" ? form.tamano_origen || null : null,
      tamano_destino: form.destino_tipo === "Vivero" ? form.tamano_destino || null : null,
      zona_destino: form.destino_tipo === "Vivero" ? form.zona_destino || null : null,
      distrito_destino: isExternalDestination(form.destino_tipo) ? form.distrito_destino || null : null,
      barrio_destino: isExternalDestination(form.destino_tipo) ? form.barrio_destino || null : null,
      direccion_destino: isExternalDestination(form.destino_tipo) ? form.direccion_destino || null : null,
      cp_destino: isExternalDestination(form.destino_tipo) ? form.cp_destino || null : null,
      observaciones: form.observaciones || null, nota: form.observaciones || null,
      es_prestamo: form.origen_tipo === "Vivero" && isExternalDestination(form.destino_tipo) ? !!form.prestamo : false,
      es_devolucion: esDevolucion,
      prestamo_referencia_id: esDevolucion && form.prestamo_referencia_id ? Number(form.prestamo_referencia_id) : null,
      fecha_disponibilidad: form.destino_tipo === "Vivero" && form.tamano_destino === "M35" && form.fecha_disponibilidad ? form.fecha_disponibilidad : null,
      // Fecha/hora personalizada (registro a posteriori). Si no se marca, va null
      // y el backend usa el momento actual.
      fecha_movimiento: form.usar_fecha_personalizada && form.fecha_movimiento ? form.fecha_movimiento : null,
    };
    // Las cantidades de productos por unidades (plantas, ferretería en uds) son
    // enteras; kg/litros/m³/metros admiten decimales.
    const normCantidad = (n) => (formatoConfig.allowDecimals ? Number(n) : Math.round(Number(n)));
    let payloads;
    if (salidaPorZonas) {
      // Una línea por cada (zona, tamaño) con cantidad > 0.
      payloads = Object.entries(distribucion)
        .filter(([, q]) => Number(q) > 0)
        .map(([k, q]) => {
          const [zona, tamano] = k.split("__");
          return { ...basePayload, zona_origen: zona, tamano_origen: tamano, cantidad: normCantidad(q) };
        });
    } else {
      const cantidadFinal = formatoConfig.showCantidad ? normCantidad(parseFloat(form.cantidad)) : 1;
      payloads = [{ ...basePayload, zona_origen: form.origen_tipo === "Vivero" ? form.zona_origen || null : null, cantidad: cantidadFinal }];
    }
    return { ok: true, payloads, errors: [] };
  };

  const formTieneLineaActual = () => {
    if (!form.producto_id) return false;
    if (salidaPorZonas) return Object.values(distribucion).some((q) => Number(q) > 0);
    return Number(form.cantidad) > 0;
  };

  const addCurrentToBatch = () => {
    const result = buildCurrentPayloads();
    setErrors(result.errors);
    if (!result.ok) return;
    setBatchPayloads((prev) => [...prev, ...result.payloads]);
    setForm((prev) => ({ ...prev, pedido_item_id: "", producto_id: "", cantidad: "", tamano_origen: "", tamano_destino: prev.destino_tipo === "Vivero" ? "" : prev.tamano_destino, zona_origen: "", zona_destino: prev.destino_tipo === "Vivero" ? "" : prev.zona_destino, fecha_disponibilidad: "" }));
    setDistribucion({}); setSelectedPedidoLineKey(""); setProductoSearch("");
  };

  const removeBatchItem = (idx) => setBatchPayloads((prev) => prev.filter((_, i) => i !== idx));

  // Zonas seleccionables para una línea de pedido. En salidas, las que tienen
  // stock de ese producto+tamaño; en reposiciones (entrada), las permitidas por
  // categoría (zona de destino).
  const zonasParaLineaPedido = (linea) => {
    const esRepo = (selectedPedido?.tipo || "salida") === "reposicion";
    if (esRepo) {
      const prod = safeArray(productos).find((p) => String(p.id) === String(linea.producto_id));
      return getZonasPermitidasParaCategoria(prod, ZONAS).map((z) => ({ zona: z, disponible: null }));
    }
    const pid = String(linea.producto_id);
    // Mostramos TODAS las zonas con stock del producto/tamaño; la cantidad de
    // la línea puede repartirse entre varias zonas (ver la asignación por zona).
    const out = [];
    for (const [key, qty] of stockByProductZoneSize.entries()) {
      if (Number(qty) <= 0) continue;
      const parts = key.split("__");
      if (parts[0] !== pid) continue;
      const tam = parts.slice(2).join("__");
      if (linea.tamano && tam !== linea.tamano) continue;
      out.push({ zona: zonaIdByLower.get(parts[1]) || parts[1], disponible: Number(qty) });
    }
    // Zonas con más stock primero.
    out.sort((a, b) => b.disponible - a.disponible);
    return out;
  };

  const lineasPendientesPedido = pedidoLineas.filter((l) => !l._disabled).length;

  // Añade una línea del pedido al lote. La cantidad de la línea puede repartirse
  // entre varias zonas de origen: se genera un movimiento por zona con cantidad
  // > 0. Todas comparten la dirección de destino del pedido (no editable).
  const addPedidoLinea = (linea) => {
    const esRepo = (selectedPedido?.tipo || "salida") === "reposicion";
    const necesaria = Math.max(0, Number(linea.cantidad || 0) - Number(linea._cantidad_movida || 0));
    if (necesaria <= 0) { setErrors(["La línea no tiene cantidad pendiente."]); return; }

    const alloc = pedidoLineAlloc[linea._key] || {};
    // Zonas con cantidad asignada > 0.
    const entradas = Object.entries(alloc)
      .map(([zona, v]) => ({ zona, cant: Number(v || 0) }))
      .filter((e) => e.cant > 0);

    if (entradas.length === 0) { setErrors(["Indica cuántas unidades sacar de cada zona para esta línea."]); return; }

    // Validación de stock por zona (para salidas).
    if (!esRepo) {
      for (const e of entradas) {
        const disp = Number(stockByProductZoneSize.get(`${linea.producto_id}__${String(e.zona).toLowerCase()}__${linea.tamano}`) || 0);
        if (e.cant > disp) {
          setErrors([`En ${getZonaLabel(e.zona)} solo hay ${disp} de ${linea.producto_nombre || "este producto"} (${linea.tamano}).`]);
          return;
        }
      }
    }

    const suma = entradas.reduce((s, e) => s + e.cant, 0);
    if (Math.abs(suma - necesaria) > 1e-9) {
      setErrors([`La suma repartida (${suma}) debe coincidir con la cantidad de la línea (${necesaria}).`]);
      return;
    }

    const destinoTipo = esRepo ? "Vivero" : (DESTINOS_EXTERNOS.includes(form.destino_tipo) ? form.destino_tipo : "Empresa");
    const nota = `Movimiento asociado al pedido #${selectedPedido?.id || ""}`;
    const nuevos = entradas.map((e) => ({
      pedido_id: selectedPedido?.id ? Number(selectedPedido.id) : null,
      pedido_item_id: linea.id ? Number(linea.id) : null,
      producto_id: Number(linea.producto_id),
      origen_tipo: esRepo ? "Empresa Externa" : "Vivero",
      destino_tipo: destinoTipo,
      tamano_origen: esRepo ? null : (linea.tamano || null),
      tamano_destino: esRepo ? (linea.tamano || null) : null,
      zona_origen: esRepo ? null : e.zona,
      zona_destino: esRepo ? e.zona : null,
      distrito_destino: esRepo ? null : (selectedPedido?.distrito_destino || null),
      barrio_destino: esRepo ? null : (selectedPedido?.barrio_destino || null),
      direccion_destino: esRepo ? null : (selectedPedido?.direccion_destino || null),
      cp_destino: null,
      observaciones: form.observaciones || nota,
      nota: form.observaciones || nota,
      es_prestamo: false,
      es_devolucion: false,
      prestamo_referencia_id: null,
      fecha_disponibilidad: null,
      fecha_movimiento: form.usar_fecha_personalizada && form.fecha_movimiento ? form.fecha_movimiento : null,
      cantidad: e.cant,
    }));
    setBatchPayloads((prev) => [...prev, ...nuevos]);
    setPedidoLineAlloc((prev) => { const n = { ...prev }; delete n[linea._key]; return n; });
    setErrors([]);
  };

  const submit = async () => {
    const currentIsFilled = formTieneLineaActual();
    if (!currentIsFilled && batchPayloads.length === 0) { setErrors(["No hay líneas que guardar. Rellena el formulario o añade al lote."]); return; }
    let allPayloads = [...batchPayloads];
    if (currentIsFilled) {
      const result = buildCurrentPayloads();
      setErrors(result.errors);
      if (!result.ok) return;
      allPayloads = [...allPayloads, ...result.payloads];
    } else { setErrors([]); }
    // La fecha/hora personalizada, las observaciones y —en salidas directas— la
    // dirección de destino se eligen en el paso 3, pero las líneas del lote se
    // construyeron en el paso 2 (sin dirección). Aplicamos aquí esos campos
    // globales a TODAS las líneas. En pedidos NO se toca la dirección (cada
    // línea lleva la suya).
    const fechaMov = form.usar_fecha_personalizada && form.fecha_movimiento ? datetimeLocalToUtcIso(form.fecha_movimiento) : null;
    const obs = (form.observaciones || "").trim();
    const aplicarDireccion = !selectedPedido && isExternalDestination(form.destino_tipo);
    const finalPayloads = allPayloads.map((p) => ({
      ...p,
      fecha_movimiento: fechaMov,
      observaciones: obs || p.observaciones || null,
      nota: obs || p.nota || null,
      ...(aplicarDireccion
        ? {
            distrito_destino: form.distrito_destino || null,
            barrio_destino: form.barrio_destino || null,
            direccion_destino: form.direccion_destino || null,
            cp_destino: form.cp_destino || null,
          }
        : {}),
    }));
    await onSubmit(finalPayloads);
  };

  if (!open) return null;

  const iStyle = () => ({ width: "100%", padding: "9px 11px", borderRadius: 10, border: "1px solid rgba(15,23,42,0.10)", outline: "none", fontWeight: 700, color: "#0f172a", background: "#fff", boxSizing: "border-box" });
  const accentMap = { entrada: "#10b981", salida: "#ef4444", traslado_interno: "#3b82f6", devolucion: "#f59e0b" };
  const accent = accentMap[form.tipo_elegido] || "#06b6d4";

  const esSalida = form.tipo_elegido === "salida";
  const esEntrada = form.tipo_elegido === "entrada";
  const esTrasladoTipo = form.tipo_elegido === "traslado_interno";
  const esDevolucionTipo = form.tipo_elegido === "devolucion";

  // Campo de formato/tamaño relevante para este movimiento. Para salidas y
  // traslados el material sale del vivero (tamaño origen); para entradas y
  // devoluciones llega al vivero (tamaño destino). El formato se elige en el
  // paso 2 junto a la cantidad.
  const formatoField = esSalida || esTrasladoTipo ? "tamano_origen" : "tamano_destino";
  const formatoFijo = formatoConfig.kind === "formato_fijo";

  // En entrada "Otros" hay que especificar la procedencia (Palmetum u otra).
  const entradaOtrosSinEspecificar =
    esEntrada && form.origen_tipo === ENTRADA_ORIGEN_OTROS && !(form.origen_especificar || "").trim();

  const step1Valid = !!form.tipo_elegido &&
    (esSalida ? !!form.destino_tipo : true) &&
    (esEntrada ? !!form.origen_tipo && !entradaOtrosSinEspecificar : true) &&
    (esDevolucionTipo ? !!form.prestamo_referencia_id : true);

  // ¿Alguna fila de la salida supera el stock disponible de su zona/tamaño?
  const hayExcesoSalida = salidaPorZonas &&
    Object.entries(distribucion).some(([k, q]) => Number(q) > Number(salidaDispByKey[k] || 0));

  const step2Valid = !!form.producto_id && (
    salidaPorZonas
      ? totalSalida > 0 && !hayExcesoSalida
      : (formatoConfig.showCantidad ? Number(form.cantidad) > 0 : true) && (formatoFijo || !!form[formatoField])
  );

  const step3Valid = (() => {
    // En las salidas el origen (zonas + cantidades) ya se definió en el paso 2.
    if (form.origen_tipo === "Vivero" && !salidaPorZonas) {
      if (!form.zona_origen || !form.tamano_origen) return false;
    }
    if (form.destino_tipo === "Vivero") {
      if (!form.zona_destino || !form.tamano_destino) return false;
    }
    if (isExternalDestination(form.destino_tipo)) {
      if (!form.distrito_destino || !form.barrio_destino || !form.direccion_destino) return false;
    }
    return true;
  })();

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,0.55)", backdropFilter: "blur(5px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ width: "min(900px, 97vw)", maxHeight: "95vh", background: "#fff", borderRadius: 22, overflow: "hidden", boxShadow: "0 32px 80px rgba(2,6,23,0.38)", border: "1px solid rgba(15,23,42,0.08)", display: "flex", flexDirection: "column" }}>

          {/* Header */}
          <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", padding: "18px 22px 14px", color: "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900 }}>Nuevo movimiento</div>
                <div style={{ marginTop: 3, color: "rgba(255,255,255,0.60)", fontWeight: 700, fontSize: 13 }}>
                  {step === 1 ? "¿Qué tipo de movimiento?" : step === 2 ? "Producto, cantidad y formato" : "Destino y confirmación"}
                </div>
              </div>
              <button onClick={onClose} style={{ padding: "8px 14px", borderRadius: 12, fontWeight: 900, cursor: "pointer", background: "#f59e0b", color: "#111827", border: "2px solid #000", boxShadow: "0 6px 14px rgba(0,0,0,0.18)" }}>Cerrar</button>
            </div>
            <StepIndicator step={step} tipoMovimiento={form.tipo_elegido} />
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>

            {/* STEP 1 — Tipo */}
            {step === 1 && (
              <div>
                {/* Banner pedido */}
                <div style={{ padding: "12px 16px", borderRadius: 14, background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.18)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 900, color: "#1e3a8a", fontSize: 14 }}>¿Tienes un pedido aprobado?</div>
                    <div style={{ marginTop: 2, color: "#475569", fontWeight: 700, fontSize: 12 }}>Asocia un pedido y se rellenarán producto, cantidad y destino automáticamente.</div>
                  </div>
                  <button type="button" onClick={() => setShowPedidoModal(true)} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(59,130,246,0.30)", background: "rgba(59,130,246,0.10)", color: "#1d4ed8", fontWeight: 900, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}>📋 Asociar pedido</button>
                </div>

                {form.pedido_id && (
                  <div style={{ marginBottom: 16, padding: "8px 14px", borderRadius: 10, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.20)", fontWeight: 800, color: "#065f46", fontSize: 13, display: "flex", alignItems: "center", gap: 10 }}>
                    ✓ Pedido #{form.pedido_id} asociado
                    <button type="button" onClick={() => setForm((p) => ({ ...p, pedido_id: "", pedido_item_id: "" }))} style={{ background: "transparent", border: "none", color: "#991b1b", cursor: "pointer", fontWeight: 900, fontSize: 12 }}>Quitar</button>
                  </div>
                )}

                <div style={{ fontSize: 12, fontWeight: 900, color: "#475569", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>Selecciona el tipo de movimiento</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                  <TipoCard tipo="entrada" label="Entrada al vivero" desc="Material que llega al vivero desde un proveedor externo u otra entidad." icon="📦" selected={form.tipo_elegido === "entrada"} onClick={() => setForm((p) => ({ ...p, tipo_elegido: "entrada", destino_tipo: "Vivero", origen_tipo: "", zona_origen: "", tamano_origen: "" }))} />
                  <TipoCard tipo="salida" label="Salida del vivero" desc="Material que sale del vivero hacia un destino externo." icon="📤" selected={form.tipo_elegido === "salida"} onClick={() => setForm((p) => ({ ...p, tipo_elegido: "salida", origen_tipo: "Vivero", destino_tipo: "", zona_destino: "", tamano_destino: "" }))} />
                  <TipoCard tipo="traslado_interno" label="Traslado interno" desc="Movimiento entre zonas del vivero, con posible cambio de tamaño." icon="🔄" selected={form.tipo_elegido === "traslado_interno"} onClick={() => setForm((p) => ({ ...p, tipo_elegido: "traslado_interno", origen_tipo: "Vivero", destino_tipo: "Vivero" }))} />
                  <TipoCard tipo="devolucion" label="Devolución" desc="Planta prestada que regresa al vivero desde una entidad externa." icon="↩️" selected={form.tipo_elegido === "devolucion"} disabled={prestamosActivos.length === 0} disabledHint="No hay préstamos activos que devolver." onClick={() => setForm((p) => ({ ...p, tipo_elegido: "devolucion", destino_tipo: "Vivero", zona_destino: "", tamano_destino: "" }))} />
                </div>

                {/* Sub-campos según tipo */}
                {esSalida && (
                  <div style={{ marginTop: 18, padding: 16, borderRadius: 14, border: "1px solid rgba(239,68,68,0.15)", background: "rgba(239,68,68,0.03)" }}>
                    <div style={{ fontWeight: 900, fontSize: 14, color: "#991b1b", marginBottom: 12 }}>📤 ¿A dónde va el material?</div>
                    <SLabel>Tipo de destinatario</SLabel>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {SALIDA_DESTINOS.map((d) => (
                        <button key={d} type="button" onClick={() => setForm((p) => ({ ...p, destino_tipo: d, distrito_destino: "", barrio_destino: "", direccion_destino: "" }))} style={{ padding: "6px 12px", borderRadius: 8, border: form.destino_tipo === d ? "2px solid #ef4444" : "1px solid rgba(15,23,42,0.12)", background: form.destino_tipo === d ? "rgba(239,68,68,0.12)" : "#fff", color: form.destino_tipo === d ? "#991b1b" : "#334155", fontWeight: 800, cursor: "pointer", fontSize: 12 }}>{d}</button>
                      ))}
                    </div>
                    {isExternalDestination(form.destino_tipo) && (
                      <div style={{ marginTop: 10, color: "#991b1b", fontWeight: 700, fontSize: 12 }}>
                        Indicarás distrito, zona y dirección en el último paso.
                      </div>
                    )}
                  </div>
                )}

                {esEntrada && (
                  <div style={{ marginTop: 18, padding: 16, borderRadius: 14, border: "1px solid rgba(16,185,129,0.15)", background: "rgba(16,185,129,0.03)" }}>
                    <div style={{ fontWeight: 900, fontSize: 14, color: "#065f46", marginBottom: 10 }}>📦 ¿De dónde viene el material?</div>
                    <SLabel>Origen</SLabel>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {ENTRADA_ORIGENES.map((o) => (
                        <button key={o} type="button" onClick={() => setForm((p) => ({ ...p, origen_tipo: o }))} style={{ padding: "6px 12px", borderRadius: 8, border: form.origen_tipo === o ? "2px solid #10b981" : "1px solid rgba(15,23,42,0.12)", background: form.origen_tipo === o ? "rgba(16,185,129,0.12)" : "#fff", color: form.origen_tipo === o ? "#065f46" : "#334155", fontWeight: 800, cursor: "pointer", fontSize: 12 }}>{o}</button>
                      ))}
                    </div>
                    {form.origen_tipo === ENTRADA_ORIGEN_OTROS && (
                      <div style={{ marginTop: 12 }}>
                        <SLabel>Especificar procedencia</SLabel>
                        <input value={form.origen_especificar} onChange={(e) => setForm((p) => ({ ...p, origen_especificar: e.target.value }))} style={iStyle()} placeholder="Palmetum u otra entidad..." maxLength={30} />
                      </div>
                    )}
                  </div>
                )}

                {esTrasladoTipo && (
                  <div style={{ marginTop: 18, padding: 16, borderRadius: 14, border: "1px solid rgba(59,130,246,0.15)", background: "rgba(59,130,246,0.03)" }}>
                    <div style={{ fontWeight: 900, fontSize: 14, color: "#1e3a8a", marginBottom: 4 }}>🔄 Traslado entre zonas</div>
                    <div style={{ color: "#475569", fontWeight: 700, fontSize: 12 }}>Elegirás la zona origen y la zona destino del vivero en el último paso.</div>
                  </div>
                )}

                {esDevolucionTipo && (
                  <div style={{ marginTop: 18, padding: 16, borderRadius: 14, border: "1px solid rgba(245,158,11,0.18)", background: "rgba(245,158,11,0.04)" }}>
                    <div style={{ fontWeight: 900, fontSize: 14, color: "#92400e", marginBottom: 4 }}>↩️ Elige el préstamo a devolver</div>
                    <div style={{ color: "#475569", fontWeight: 700, fontSize: 12, marginBottom: 10 }}>El producto, quién lo devuelve y la cantidad pendiente salen del propio préstamo.</div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {prestamosActivos.map((m) => {
                        const prod = productos.find((p) => String(p.id) === String(m.producto_id));
                        const sel = String(form.prestamo_referencia_id || "") === String(m.id);
                        const quien = [m.destino_tipo, m.distrito_destino, m.barrio_destino, m.direccion_destino].filter(Boolean).join(" · ");
                        const tam = m.tamano_origen || m.tamano_destino;
                        return (
                          <button key={m.id} type="button" onClick={() => handleSeleccionPrestamo(m)} style={{ textAlign: "left", padding: "10px 12px", borderRadius: 10, border: sel ? "2px solid #f59e0b" : "1px solid rgba(15,23,42,0.10)", background: sel ? "rgba(245,158,11,0.12)" : "#fff", cursor: "pointer" }}>
                            <div style={{ fontWeight: 900, color: "#0f172a", fontSize: 13 }}>{getProductDisplayName(prod) || `Producto #${m.producto_id}`} · {m._pendiente} uds pendientes</div>
                            <div style={{ marginTop: 2, color: "#64748b", fontWeight: 700, fontSize: 12 }}>Préstamo #{m.id}{tam ? ` · ${tam}` : ""}{quien ? ` · ${quien}` : ""}</div>
                          </button>
                        );
                      })}
                    </div>
                    {form.prestamo_referencia_id ? (
                      <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, color: "#065f46" }}>✓ Préstamo seleccionado. La cantidad a devolver y el resto de datos se rellenan solos (podrás ajustar la cantidad en el paso 2).</div>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            {/* STEP 2 — Producto */}
            {step === 2 && (
              <div style={{ display: "grid", gap: 16 }}>
                {/* Filtros y lista de productos: solo en movimientos SIN pedido.
                    Con un pedido, el producto sale de las líneas del pedido. */}
                {!selectedPedido && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 10 }}>
                      <div>
                        <SLabel>Categoría</SLabel>
                        <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} style={iStyle()}>
                          <option value="">Todas</option>
                          {categoriasDisponibles.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <SLabel>Subcategoría</SLabel>
                        <select value={filtroSubcategoria} onChange={(e) => setFiltroSubcategoria(e.target.value)} style={iStyle()} disabled={!filtroCategoria || subcategoriasDisponibles.length === 0}>
                          <option value="">Todas</option>
                          {subcategoriasDisponibles.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <SLabel>Buscar producto</SLabel>
                        <input value={productoSearch} onChange={(e) => setProductoSearch(e.target.value)} style={iStyle()} placeholder="Escribe nombre científico o común..." />
                      </div>
                    </div>

                    <div>
                      <SLabel>Producto ({filteredProductos.length} disponibles{form.origen_tipo === "Vivero" ? " con stock" : ""})</SLabel>
                      <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid rgba(15,23,42,0.10)", borderRadius: 12, background: "#fafafa" }}>
                        {filteredProductos.length === 0 ? (
                          <div style={{ padding: 16, color: "#64748b", fontWeight: 700, fontSize: 13 }}>No hay productos{form.origen_tipo === "Vivero" ? " con stock" : ""} que coincidan.</div>
                        ) : filteredProductos.map((p) => {
                          const active = String(p.id) === String(form.producto_id);
                          return (
                            <div key={p.id} onClick={() => { setForm((prev) => ({ ...prev, producto_id: String(p.id), zona_origen: "", tamano_origen: "", zona_destino: "", tamano_destino: "" })); setDistribucion({}); }} style={{ padding: "10px 14px", borderBottom: "1px solid rgba(15,23,42,0.06)", cursor: "pointer", background: active ? `${accent}12` : "transparent", borderLeft: active ? `3px solid ${accent}` : "3px solid transparent", fontWeight: active ? 900 : 700, color: active ? "#0f172a" : "#334155", fontSize: 13, transition: "all 0.12s", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                              <div>
                                <div>{getProductDisplayName(p)}</div>
                                {p.categoria && <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>{p.categoria}{p.subcategoria ? ` · ${p.subcategoria}` : ""}</div>}
                              </div>
                              <VerPlanta nombreCientifico={p.nombre_cientifico} nombreNatural={p.nombre_natural} variant="button" stopPropagation={true} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                {/* Líneas de pedido si hay pedido */}
                {selectedPedido && (
                  <div style={{ padding: 14, borderRadius: 14, background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.15)" }}>
                    <div style={{ fontWeight: 900, color: "#1e3a8a", marginBottom: 4, fontSize: 13 }}>Líneas del pedido #{selectedPedido.id}</div>
                    {selectedPedido.nota ? (
                      <div style={{ margin: "6px 0 10px", padding: "10px 12px", borderRadius: 10, background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.28)" }}>
                        <div style={{ fontSize: 11, fontWeight: 900, color: "#92400e", textTransform: "uppercase", letterSpacing: 0.3 }}>📝 Comentarios del solicitante</div>
                        <div style={{ marginTop: 3, fontWeight: 700, color: "#0f172a", fontSize: 13, whiteSpace: "pre-wrap" }}>{selectedPedido.nota}</div>
                      </div>
                    ) : null}
                    <div style={{ color: "#475569", fontWeight: 700, fontSize: 12, marginBottom: 10 }}>
                      Elige la zona de origen de cada línea y añádela. Cada línea se sirve a su destino (se guarda un movimiento por línea).
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {(() => {
                        // Agrupamos las líneas por destino (orden de aparición)
                        // para que el técnico las vea agrupadas por dirección.
                        const order = [];
                        const gmap = new Map();
                        for (const linea of pedidoLineas) {
                          const dst = [linea.distrito_destino, linea.barrio_destino, linea.direccion_destino].filter(Boolean).join(" · ") || "Sin destino";
                          if (!gmap.has(dst)) { gmap.set(dst, []); order.push(dst); }
                          gmap.get(dst).push(linea);
                        }
                        const gruposDst = order.map((dst) => ({ destino: dst, lineas: gmap.get(dst) }));
                        return gruposDst.map((grupo, gIdx) => {
                          const col = destinoColorAt(gIdx);
                          const colapsado = !!destinosColapsados[grupo.destino];
                          return (
                          <div key={grupo.destino} style={{ display: "grid", gap: 8 }}>
                            <div
                              onClick={() => toggleDestinoColapsado(grupo.destino)}
                              style={{ padding: "9px 12px", borderRadius: 8, background: col.bg, color: col.fg, fontWeight: 900, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                            >
                              <span style={{ fontSize: 11 }}>{colapsado ? "▶" : "▼"}</span>
                              📍 {grupo.destino}
                              <span style={{ marginLeft: "auto", opacity: 0.85 }}>({grupo.lineas.length})</span>
                            </div>
                            {!colapsado && grupo.lineas.map((linea) => {
                        const disabled = !!linea._disabled;
                        const zonasLinea = disabled ? [] : zonasParaLineaPedido(linea);
                        const esUltima = lineasPendientesPedido <= 1;
                        const esRepoPedido = (selectedPedido?.tipo || "salida") === "reposicion";
                        const necesaria = Math.max(0, Number(linea.cantidad || 0) - Number(linea._cantidad_movida || 0));
                        const asignado = allocSum(linea._key);
                        const repartoOk = Math.abs(asignado - necesaria) < 1e-9;
                        return (
                          <div key={linea._key} style={{ padding: "10px 12px", borderRadius: 10, border: disabled ? "1px solid rgba(148,163,184,0.18)" : "1px solid rgba(15,23,42,0.08)", background: disabled ? "rgba(148,163,184,0.06)" : "#fff", opacity: disabled ? 0.6 : 1 }}>
                            <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                              <div>
                                <div style={{ fontWeight: 900, color: "#0f172a", fontSize: 13 }}>{linea.producto_nombre || `Producto #${linea.producto_id}`}</div>
                                <div style={{ marginTop: 2, color: "#64748b", fontWeight: 700, fontSize: 12 }}>Tamaño: {linea.tamano || "—"} · Cantidad: {linea.cantidad || 0}{disabled ? ` · ${linea._razon_bloqueo === "ya_en_lote" ? "✓ añadida al lote" : linea._razon_bloqueo === "ya_servida" ? "ya movida" : linea._razon_bloqueo === "item_denegado" ? "línea denegada" : linea._razon_bloqueo === "item_pendiente" ? "pendiente de aprobar" : "no disponible"}` : ""}</div>
                              </div>
                            </div>
                            {!disabled && (
                              <div style={{ marginTop: 8 }}>
                                <SLabel>{esRepoPedido ? "Zonas destino (reparte la cantidad)" : "Zonas de origen (reparte la cantidad)"}</SLabel>
                                {zonasLinea.length === 0 ? (
                                  <div style={{ color: "#991b1b", fontWeight: 700, fontSize: 12 }}>Este producto no tiene stock en ninguna zona.</div>
                                ) : (
                                  <div style={{ display: "grid", gap: 6 }}>
                                    {zonasLinea.map(({ zona, disponible }) => (
                                      <div key={zona} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <div style={{ flex: 1, fontSize: 12, fontWeight: 800, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {getZonaLabel(zona)}{disponible != null ? ` · ${disponible} uds` : ""}
                                        </div>
                                        <input
                                          type="number"
                                          min={0}
                                          max={Math.min(Number(disponible != null ? disponible : Infinity), necesaria)}
                                          placeholder="0"
                                          value={pedidoLineAlloc[linea._key]?.[zona] ?? ""}
                                          onChange={(e) => {
                                            // Tope: ni más de lo que hay en la zona, ni más de lo
                                            // que falta por servir de la línea (lo aprobado).
                                            const cap = Math.min(Number(disponible != null ? disponible : Infinity), necesaria);
                                            let raw = e.target.value.replace(/[^\d.]/g, "");
                                            if (raw !== "" && Number(raw) > cap) raw = String(cap);
                                            setAllocQty(linea._key, zona, raw);
                                          }}
                                          style={{ ...iStyle(), width: 90, textAlign: "right" }}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 8, flexWrap: "wrap" }}>
                                  <div style={{ fontWeight: 900, fontSize: 12, color: repartoOk ? "#065f46" : "#92400e" }}>
                                    Repartido: {asignado} / {necesaria}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => addPedidoLinea(linea)}
                                    disabled={!repartoOk || zonasLinea.length === 0}
                                    style={{ padding: "9px 14px", borderRadius: 10, border: "none", background: (repartoOk && zonasLinea.length > 0) ? "linear-gradient(90deg, #10b981 0%, #06b6d4 100%)" : "#cbd5e1", color: "#fff", fontWeight: 900, cursor: (repartoOk && zonasLinea.length > 0) ? "pointer" : "not-allowed", fontSize: 12, whiteSpace: "nowrap" }}
                                  >
                                    {esUltima ? "Añadir al lote y finalizar" : "Añadir al lote y seleccionar otra"}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                            })}
                          </div>
                        );
                        });
                      })()}
                    </div>
                    {lineasPendientesPedido === 0 && batchPayloads.length === 0 && (
                      <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.25)", color: "#92400e", fontWeight: 800, fontSize: 12 }}>
                        Este pedido no tiene líneas pendientes de mover (ya movidas, denegadas o pendientes de aprobar). Pulsa «Atrás» para quitarlo o elegir otro pedido.
                      </div>
                    )}
                  </div>
                )}

                {/* Salida: se añaden zonas con un desplegable y se indican las
                    unidades por tamaño de cada zona. */}
                {selectedProducto && salidaPorZonas && (
                  <div ref={salidaZonasRef} style={{ padding: 16, borderRadius: 14, border: "2px solid rgba(239,68,68,0.30)", background: "rgba(239,68,68,0.05)", scrollMarginTop: 8 }}>
                    <div style={{ fontWeight: 900, fontSize: 13, color: "#991b1b", marginBottom: 10 }}>📍 {esTrasladoTipo ? "¿De qué zonas se traslada y cuánto?" : "¿De qué zonas sale y cuánto?"}</div>
                    {zonasConStock.length === 0 ? (
                      <div style={{ color: "#991b1b", fontWeight: 700, fontSize: 13 }}>Este producto no tiene stock en ninguna zona.</div>
                    ) : (
                      <>
                        <div>
                          <SLabel>Añadir zona</SLabel>
                          <select
                            value=""
                            onChange={(e) => { const z = e.target.value; if (z && !zonasSalida.includes(z)) setZonasSalida((prev) => [...prev, z]); }}
                            style={iStyle()}
                            disabled={zonasConStock.every((z) => zonasSalida.includes(z))}
                          >
                            <option value="">{zonasConStock.every((z) => zonasSalida.includes(z)) ? "Todas las zonas añadidas" : "+ Selecciona una zona…"}</option>
                            {zonasConStock.filter((z) => !zonasSalida.includes(z)).map((z) => {
                              const total = (salidaStockByZona.get(z) || []).reduce((s, r) => s + r.disponible, 0);
                              return <option key={z} value={z}>{getZonaLabel(z)} ({total} uds)</option>;
                            })}
                          </select>
                        </div>

                        {zonasSalida.map((z) => {
                          const filas = salidaStockByZona.get(z) || [];
                          return (
                            <div key={z} style={{ marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid rgba(15,23,42,0.10)", background: "#fff" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                                <div style={{ fontWeight: 900, fontSize: 13, color: "#0f172a" }}>{getZonaLabel(z)}</div>
                                <button type="button" onClick={() => { setZonasSalida((prev) => prev.filter((x) => x !== z)); setDistribucion((prev) => { const next = { ...prev }; for (const r of filas) delete next[salidaKey(z, r.tamano)]; return next; }); }} style={{ background: "transparent", border: "none", color: "#991b1b", cursor: "pointer", fontWeight: 900, fontSize: 13 }}>Quitar</button>
                              </div>
                              {filas.map(({ tamano, disponible }) => {
                                const k = salidaKey(z, tamano);
                                const val = distribucion[k] || "";
                                const excede = Number(val || 0) > disponible;
                                return (
                                  <div key={k} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center", marginBottom: 6 }}>
                                    <div style={{ fontWeight: 800, fontSize: 13 }}>{tamano} <span style={{ color: "#64748b", fontWeight: 700, fontSize: 11 }}>({disponible} uds disponibles)</span></div>
                                    <input type="number" min={0} max={disponible} step={formatoConfig.allowDecimals ? "0.01" : "1"} value={val} onChange={(e) => { let raw = formatoConfig.allowDecimals ? e.target.value : e.target.value.replace(/[^\d]/g, ""); if (raw !== "" && Number(raw) > disponible) raw = String(disponible); setDistribucion((prev) => ({ ...prev, [k]: raw })); }} style={{ ...iStyle(), width: 90, ...(excede ? { borderColor: "#ef4444", background: "#fef2f2" } : {}) }} placeholder="0" />
                                    <span style={{ fontSize: 11, fontWeight: 700, color: excede ? "#991b1b" : "#64748b" }}>{excede ? `máx. ${disponible}` : ""}</span>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}

                        {totalSalida > 0 && <div style={{ marginTop: 10, fontWeight: 900, color: "#065f46", fontSize: 13 }}>Total a sacar: {totalSalida}</div>}
                      </>
                    )}
                  </div>
                )}

                {/* Cantidad + formato (en la misma pantalla) */}
                {selectedProducto && !salidaPorZonas && formatoConfig.showCantidad !== false && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <SLabel>Cantidad {formatoConfig.kind === "tamano" ? "(uds)" : formatoConfig.kind === "formato_fijo" ? `(${formatoConfig.value})` : formatoConfig.unit ? `(${formatoConfig.unit})` : "(uds)"}{esDevolucionTipo && form.prestamo_max ? ` · pendiente: ${form.prestamo_max}` : ""}</SLabel>
                      <input key={`qty-${form.producto_id}`} autoFocus type="number" min={formatoConfig.allowDecimals ? 0 : 1} max={esDevolucionTipo && form.prestamo_max ? form.prestamo_max : undefined} step={formatoConfig.allowDecimals ? "0.01" : "1"} value={form.cantidad} onChange={(e) => { let v = formatoConfig.allowDecimals ? e.target.value : e.target.value.replace(/[^\d]/g, ""); if (esDevolucionTipo && form.prestamo_max && v !== "" && Number(v) > Number(form.prestamo_max)) v = String(form.prestamo_max); setForm((p) => ({ ...p, cantidad: v })); }} style={iStyle()} placeholder="0" />
                      {esDevolucionTipo && form.prestamo_max ? <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: "#64748b" }}>Puedes devolver menos: el resto queda pendiente.</div> : null}
                    </div>
                    <div>
                      <SLabel>{formatoConfig.kind === "tamano" ? "Tamaño" : formatoConfig.label || "Formato"}</SLabel>
                      {formatoFijo ? (
                        <div style={{ ...iStyle(), background: "#f1f5f9", color: "#475569" }}>{formatoConfig.value}</div>
                      ) : (
                        <select value={form[formatoField] || ""} onChange={(e) => setForm((p) => ({ ...p, [formatoField]: e.target.value }))} style={iStyle()}>
                          <option value="">Seleccionar</option>
                          {((esSalida || esTrasladoTipo) ? availableOriginSizes : getFormatoOptions(formatoConfig)).map((t) => {
                            const showStock = form.origen_tipo === "Vivero" && form.producto_id;
                            const qty = showStock ? zonasPermitidasPorCategoria.reduce((s, z) => s + Number(stockByProductZoneSize.get(buildStockKey(form.producto_id, z, t)) || 0), 0) : null;
                            return <option key={t} value={t}>{t}{qty != null ? ` (${qty} uds)` : ""}</option>;
                          })}
                        </select>
                      )}
                    </div>
                  </div>
                )}

                {/* Lote actual */}
                {batchPayloads.length > 0 && (
                  <div style={{ padding: 12, borderRadius: 12, background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.18)" }}>
                    <div style={{ fontWeight: 900, color: "#065f46", fontSize: 12, marginBottom: 8 }}>EN EL LOTE ({batchPayloads.length} líneas)</div>
                    {batchPayloads.map((p, idx) => {
                      const prod = productos.find((x) => String(x.id) === String(p.producto_id));
                      return (
                        <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid rgba(16,185,129,0.10)", fontSize: 12, fontWeight: 700 }}>
                          <span>{getProductDisplayName(prod)} · {p.cantidad} {p.tamano_origen || p.tamano_destino || ""}</span>
                          <button type="button" onClick={() => removeBatchItem(idx)} style={{ background: "transparent", border: "none", color: "#991b1b", cursor: "pointer", fontWeight: 900, fontSize: 13 }}>✕</button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {selectedProducto && formTieneLineaActual() && selectedPedido && (
                  <button type="button" onClick={addCurrentToBatch} style={{ padding: "9px 16px", borderRadius: 10, border: "1px solid rgba(59,130,246,0.30)", background: "rgba(59,130,246,0.10)", color: "#1d4ed8", fontWeight: 900, cursor: "pointer", fontSize: 13 }}>+ Añadir al lote y seleccionar otra línea</button>
                )}
                {selectedProducto && formTieneLineaActual() && !selectedPedido && (
                  <button type="button" onClick={addCurrentToBatch} style={{ padding: "9px 16px", borderRadius: 10, border: "1px solid rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.10)", color: "#065f46", fontWeight: 900, cursor: "pointer", fontSize: 13 }}>+ Añadir este producto y elegir otro</button>
                )}
              </div>
            )}

            {/* STEP 3 — Zonas + Confirmar */}
            {step === 3 && (
              <div style={{ display: "grid", gap: 16 }}>
                {/* Origen zona: el origen se define ahora por zonas en el paso 2
                    (salidas y traslados), así que aquí no se repite. */}
                {esTrasladoTipo && !salidaPorZonas && (
                  <div style={{ padding: 16, borderRadius: 14, border: "1px solid rgba(59,130,246,0.15)", background: "rgba(59,130,246,0.03)" }}>
                    <div style={{ fontWeight: 900, fontSize: 13, color: "#1e3a8a", marginBottom: 10 }}>📍 Zona origen</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <SLabel>Zona origen</SLabel>
                        <select value={form.zona_origen} onChange={(e) => setForm((p) => ({ ...p, zona_origen: e.target.value }))} style={iStyle()} disabled={!form.producto_id || availableOriginZones.length === 0}>
                          <option value="">{!form.producto_id ? "Primero elige producto" : availableOriginZones.length === 0 ? "Sin stock para este producto" : "Seleccionar zona"}</option>
                          {availableOriginZones.map((z) => {
                            const qty = form.tamano_origen
                              ? Number(stockByProductZoneSize.get(buildStockKey(form.producto_id, z, form.tamano_origen)) || 0)
                              : getFormatoOptions(formatoConfig).reduce((s, t) => s + Number(stockByProductZoneSize.get(buildStockKey(form.producto_id, z, t)) || 0), 0);
                            return <option key={z} value={z}>Zona {z}{form.producto_id ? ` (${qty} uds)` : ""}</option>;
                          })}
                        </select>
                      </div>
                      <div>
                        <SLabel>{formatoConfig.kind === "tamano" ? "Tamaño" : "Formato"}</SLabel>
                        <div style={{ ...iStyle(), background: "#f1f5f9", color: "#475569" }}>{form.tamano_origen || "—"}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Dirección de la salida (todos los destinos salvo Baja Vivero) */}
                {esSalida && isExternalDestination(form.destino_tipo) && (
                  <div style={{ padding: 16, borderRadius: 14, border: "1px solid rgba(239,68,68,0.15)", background: "rgba(239,68,68,0.03)" }}>
                    <div style={{ fontWeight: 900, fontSize: 13, color: "#991b1b", marginBottom: 10 }}>🗺️ Dirección de destino · {form.destino_tipo}</div>
                    {selectedPedido ? (
                      <div style={{ display: "grid", gap: 6 }}>
                        <div style={{ fontWeight: 800, color: "#0f172a", fontSize: 14 }}>
                          {[form.distrito_destino, form.barrio_destino, form.direccion_destino].filter(Boolean).join(" · ") || "—"}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>Dirección del pedido #{selectedPedido.id} (igual para todas las líneas, no editable).</div>
                      </div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <SLabel>Distrito</SLabel>
                          <select value={form.distrito_destino} onChange={(e) => setForm((p) => ({ ...p, distrito_destino: e.target.value, barrio_destino: "" }))} style={iStyle()}>
                            <option value="">Seleccionar distrito</option>
                            {Object.keys(DISTRITO_BARRIOS).map((d) => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                        <div>
                          <SLabel>Zona</SLabel>
                          <select value={form.barrio_destino} onChange={(e) => setForm((p) => ({ ...p, barrio_destino: e.target.value }))} style={iStyle()} disabled={!form.distrito_destino}>
                            <option value="">{form.distrito_destino ? "Seleccionar zona" : "Primero elige el distrito"}</option>
                            {barriosDisponibles.map((b) => <option key={b} value={b}>{b}</option>)}
                          </select>
                        </div>
                        <div style={{ gridColumn: "span 2" }}>
                          <SLabel>Dirección</SLabel>
                          <input value={form.direccion_destino} onChange={(e) => setForm((p) => ({ ...p, direccion_destino: e.target.value }))} style={iStyle()} placeholder="Calle, número..." />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Destino zona (para entrada, traslado, devolución).
                    Con un pedido la zona ya se eligió por línea en el paso 2,
                    así que aquí no se repite. */}
                {!selectedPedido && (esEntrada || esTrasladoTipo || esDevolucionTipo) && (
                  <div style={{ padding: 16, borderRadius: 14, border: `1px solid ${esEntrada ? "rgba(16,185,129,0.15)" : esTrasladoTipo ? "rgba(59,130,246,0.15)" : "rgba(245,158,11,0.18)"}`, background: esEntrada ? "rgba(16,185,129,0.03)" : esTrasladoTipo ? "rgba(59,130,246,0.03)" : "rgba(245,158,11,0.04)" }}>
                    <div style={{ fontWeight: 900, fontSize: 13, color: esEntrada ? "#065f46" : esTrasladoTipo ? "#1e3a8a" : "#92400e", marginBottom: 10 }}>🎯 Zona destino</div>
                    <div style={{ display: "grid", gridTemplateColumns: (esTrasladoTipo && !formatoFijo) ? "1fr 1fr" : "1fr", gap: 10 }}>
                      <div>
                        <SLabel>Zona destino</SLabel>
                        <select value={form.zona_destino} onChange={(e) => setForm((p) => ({ ...p, zona_destino: e.target.value }))} style={iStyle()}>
                          <option value="">Seleccionar zona</option>
                          {zonasPermitidasPorCategoria.map((z) => <option key={z} value={z}>Zona {z}</option>)}
                        </select>
                      </div>
                      {/* El tamaño solo es editable en traslados (repicado a otro tamaño).
                          En entrada/devolución ya se eligió en el paso 2: no se repite aquí. */}
                      {esTrasladoTipo && !formatoFijo && (
                        <div>
                          <SLabel>{formatoConfig.kind === "tamano" ? "Tamaño destino" : "Formato destino"}</SLabel>
                          <select value={form.tamano_destino} onChange={(e) => setForm((p) => ({ ...p, tamano_destino: e.target.value }))} style={iStyle()}>
                            <option value="">Seleccionar</option>
                            {getFormatoOptions(formatoConfig).map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                      )}
                      {form.destino_tipo === "Vivero" && form.tamano_destino === "M35" && (
                        <div style={{ gridColumn: "span 2" }}>
                          <SLabel>Fecha disponibilidad (opcional, solo M35)</SLabel>
                          <input type="date" value={form.fecha_disponibilidad || ""} onChange={(e) => setForm((p) => ({ ...p, fecha_disponibilidad: e.target.value }))} style={iStyle()} />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Observaciones (movidas desde el paso 2) */}
                <div>
                  <SLabel>Observaciones (opcional)</SLabel>
                  <textarea value={form.observaciones} onChange={(e) => setForm((p) => ({ ...p, observaciones: e.target.value }))} style={{ ...iStyle(), minHeight: 64, resize: "vertical" }} placeholder="Información adicional..." />
                </div>

                {/* Fecha/hora del movimiento (registro a posteriori) */}
                <div style={{ padding: 12, borderRadius: 12, border: form.usar_fecha_personalizada ? "1px solid rgba(6,182,212,0.35)" : "1px solid rgba(15,23,42,0.10)", background: form.usar_fecha_personalizada ? "rgba(6,182,212,0.05)" : "#fff" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none", fontWeight: 800, fontSize: 13, color: "#0f172a" }}>
                    <input
                      type="checkbox"
                      checked={form.usar_fecha_personalizada}
                      onChange={(e) => setForm((p) => ({ ...p, usar_fecha_personalizada: e.target.checked, fecha_movimiento: e.target.checked && !p.fecha_movimiento ? defaultFechaLocal() : p.fecha_movimiento }))}
                      style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#06b6d4" }}
                    />
                    🕒 Registrar en otra fecha/hora (no la actual)
                  </label>
                  {form.usar_fecha_personalizada && (
                    <div style={{ marginTop: 10 }}>
                      <SLabel>Fecha y hora del movimiento</SLabel>
                      <input
                        type="datetime-local"
                        value={form.fecha_movimiento}
                        max={defaultFechaLocal()}
                        onChange={(e) => setForm((p) => ({ ...p, fecha_movimiento: e.target.value }))}
                        style={iStyle()}
                      />
                      <div className="" style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: "#64748b" }}>Se usará esta fecha para el movimiento (no puede ser futura).</div>
                    </div>
                  )}
                </div>

                {/* Resumen */}
                <div style={{ padding: 18, borderRadius: 16, background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", color: "#fff" }}>
                  <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 12, color: "rgba(255,255,255,0.60)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Resumen del movimiento</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {[
                      { label: "Tipo", value: <span style={tipoTextStyle(tipoPreview)}>{getTipoDisplayLabel(tipoPreview)}</span> },
                      { label: "Producto", value: selectedProducto ? getProductDisplayName(selectedProducto) : "—" },
                      salidaPorZonas
                        ? (totalSalida > 0 ? { label: "Cantidad", value: `${totalSalida} uds (total)` } : null)
                        : (form.cantidad ? { label: "Cantidad", value: `${form.cantidad} ${formatoConfig.kind === "tamano" ? "uds" : formatoConfig.kind === "formato_fijo" ? formatoConfig.value : formatoConfig.unit || ""}`.trim() } : null),
                      { label: "Origen", value: salidaPorZonas
                          ? `Vivero · ${Object.entries(distribucion).filter(([, q]) => Number(q) > 0).map(([k, q]) => { const [z, t] = k.split("__"); return `Zona ${z}·${t}: ${q}`; }).join(", ") || "—"}`
                          : form.origen_tipo === "Vivero" ? `Vivero · Zona ${form.zona_origen || "—"} · ${form.tamano_origen || "—"}` : form.origen_tipo || "—" },
                      { label: "Destino", value: form.destino_tipo === "Vivero" ? `Vivero · Zona ${form.zona_destino || "—"} · ${form.tamano_destino || "—"}` : isExternalDestination(form.destino_tipo) ? [form.destino_tipo, form.distrito_destino, form.barrio_destino, form.direccion_destino].filter(Boolean).join(" · ") : form.destino_tipo || "—" },
                      form.pedido_id ? { label: "Pedido", value: `#${form.pedido_id}` } : null,
                      batchPayloads.length > 0 ? { label: "En lote", value: `${batchPayloads.length} líneas adicionales` } : null,
                    ].filter(Boolean).map(({ label, value }) => (
                      <div key={label} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <div style={{ fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.50)", textTransform: "uppercase", letterSpacing: "0.06em", minWidth: 90, paddingTop: 1 }}>{label}</div>
                        <div style={{ fontWeight: 800, color: "#fff", flex: 1 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Préstamo checkbox para salida externa */}
                {esSalida && isExternalDestination(form.destino_tipo) && (
                  <label style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 14, border: form.prestamo ? "2px solid #3b82f6" : "1px solid rgba(59,130,246,0.20)", background: form.prestamo ? "rgba(59,130,246,0.08)" : "#f8fafc", cursor: "pointer", userSelect: "none" }}>
                    <input type="checkbox" checked={!!form.prestamo} onChange={(e) => setForm((p) => ({ ...p, prestamo: e.target.checked }))} style={{ width: 16, height: 16, margin: 0, flexShrink: 0, cursor: "pointer", accentColor: "#1d4ed8" }} />
                    <div>
                      <div style={{ fontWeight: 900, color: "#1e3a8a", fontSize: 14 }}>Marcar como préstamo</div>
                      <div style={{ marginTop: 2, color: "#475569", fontWeight: 700, fontSize: 12 }}>El material saldrá temporalmente y se esperará su devolución.</div>
                    </div>
                  </label>
                )}

                {esDevolucion && (
                  <div style={{ padding: "10px 16px", borderRadius: 14, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", fontWeight: 800, color: "#92400e", fontSize: 13 }}>
                    ↩️ Este movimiento se registrará como <strong>devolución</strong>.
                  </div>
                )}

              </div>
            )}
          </div>

          {/* Errores: franja fija sobre el pie, siempre visible (no hay que
              hacer scroll para verlos). */}
          {errors.length > 0 && (
            <div style={{ padding: "10px 22px", borderTop: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.10)", color: "#991b1b", fontWeight: 800, fontSize: 13, maxHeight: 130, overflowY: "auto" }}>
              {errors.map((e, i) => <div key={i}>⚠ {e}</div>)}
            </div>
          )}

          {/* Footer */}
          <div style={{ padding: "14px 22px", borderTop: "1px solid rgba(15,23,42,0.08)", background: "#f8fafc", display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
            <button onClick={() => { if (step === 1) { onClose(); } else { setStep((s) => s - 1); setErrors([]); } }} style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid rgba(15,23,42,0.14)", background: "#fff", color: "#334155", fontWeight: 900, cursor: "pointer" }}>
              {step === 1 ? "Cancelar" : "← Atrás"}
            </button>
            <div style={{ display: "flex", gap: 10 }}>
              {step < 3 && (
                <button onClick={() => {
                  if (step === 1 && !step1Valid) { setErrors([entradaOtrosSinEspecificar ? "Especifica la procedencia del material." : "Completa los campos requeridos antes de continuar."]); return; }
                  // Si ya hay líneas en el lote (p. ej. de un pedido) y nada a
                  // medio rellenar, se puede continuar sin más validaciones.
                  if (step === 2 && batchPayloads.length > 0 && !formTieneLineaActual()) { setErrors([]); setStep((s) => s + 1); return; }
                  // Con pedido pero sin líneas añadidas todavía: avisa.
                  if (step === 2 && selectedPedido && batchPayloads.length === 0 && !formTieneLineaActual()) { setErrors(["Añade al menos una línea del pedido al lote."]); return; }
                  if (step === 2 && !form.producto_id) { setErrors(["Selecciona un producto antes de continuar."]); return; }
                  if (step === 2 && salidaPorZonas && !(totalSalida > 0)) { setErrors(["Indica cuántas unidades sacar de al menos una zona."]); return; }
                  if (step === 2 && salidaPorZonas && hayExcesoSalida) { setErrors(["Hay zonas donde pides más de lo disponible. Corrige las cantidades en rojo."]); return; }
                  if (step === 2 && !salidaPorZonas && formatoConfig.showCantidad !== false && (!form.cantidad || Number(form.cantidad) <= 0)) { setErrors(["La cantidad debe ser mayor que 0."]); return; }
                  if (step === 2 && !salidaPorZonas && !formatoFijo && !form[formatoField]) { setErrors([`Selecciona el ${formatoConfig.kind === "tamano" ? "tamaño" : "formato"} antes de continuar.`]); return; }
                  setErrors([]); setStep((s) => s + 1);
                }} style={{ padding: "9px 22px", borderRadius: 10, border: "none", background: `linear-gradient(90deg, ${accent} 0%, #06b6d4 100%)`, color: "#fff", fontWeight: 900, cursor: "pointer", opacity: (step === 1 && !form.tipo_elegido) ? 0.55 : 1 }}>
                  Siguiente →
                </button>
              )}
              {step === 3 && (
                <button onClick={submit} disabled={saving} style={{ padding: "10px 26px", borderRadius: 10, border: "none", background: saving ? "#94a3b8" : `linear-gradient(90deg, #10b981 0%, #06b6d4 100%)`, color: "#fff", fontWeight: 900, cursor: saving ? "not-allowed" : "pointer", minWidth: 180 }}>
                  {saving ? "Guardando..." : "✓ Confirmar movimiento"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <PedidoSelectorModal open={showPedidoModal} pedidos={pedidosAprobados} onClose={() => setShowPedidoModal(false)} onSelect={handleSeleccionPedido} />
      {showPrestamoModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,0.45)", backdropFilter: "blur(3px)", zIndex: 1300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={() => setShowPrestamoModal(false)}>
          <div style={{ width: "min(680px, 95vw)", background: "white", borderRadius: 20, padding: 24, boxShadow: "0 30px 80px rgba(2,6,23,0.35)", maxHeight: "85vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#0f172a", marginBottom: 16 }}>Préstamos activos</div>
            {prestamosActivos.length === 0 ? (
              <div style={{ color: "#64748b", fontWeight: 700 }}>No hay préstamos activos pendientes de devolución.</div>
            ) : prestamosActivos.map((m) => (
              <div key={m.id} style={{ padding: 14, borderRadius: 14, border: "1px solid rgba(15,23,42,0.08)", marginBottom: 10, background: "#fbfdff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 900, color: "#0f172a" }}>Préstamo #{m.id} · {fmtFechaES(m.fecha_movimiento)}</div>
                    <div style={{ color: "#64748b", fontWeight: 700, fontSize: 13, marginTop: 3 }}>Prestado: {m._prestado} · Devuelto: {m._devuelto} · Pendiente: {m._pendiente}</div>
                    <div style={{ color: "#64748b", fontWeight: 700, fontSize: 12, marginTop: 2 }}>{buildLabelDestino(m)}</div>
                  </div>
                  <button onClick={() => handleSeleccionPrestamo(m)} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(245,158,11,0.30)", background: "rgba(245,158,11,0.10)", color: "#92400e", fontWeight: 900, cursor: "pointer" }}>Usar préstamo</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}


// Colores intensos y distintos por destino, para diferenciarlos bien.
const DESTINO_COLORS = [
  { bg: "#1e3a8a", fg: "#ffffff" },
  { bg: "#065f46", fg: "#ffffff" },
  { bg: "#9a3412", fg: "#ffffff" },
  { bg: "#6b21a8", fg: "#ffffff" },
  { bg: "#155e75", fg: "#ffffff" },
  { bg: "#9f1239", fg: "#ffffff" },
  { bg: "#3f6212", fg: "#ffffff" },
  { bg: "#854d0e", fg: "#ffffff" },
  { bg: "#5b21b6", fg: "#ffffff" },
  { bg: "#0f766e", fg: "#ffffff" },
];
const destinoColorAt = (i) => DESTINO_COLORS[((i % DESTINO_COLORS.length) + DESTINO_COLORS.length) % DESTINO_COLORS.length];

// Modal unificado de movimiento con carrito (estilo "Nuevo pedido"). Un
// selector de tipo arriba (Entrada / Salida / Traslado) y tres columnas:
//   · Entrada  → izq: productos · centro: cantidad por tamaño + zona destino ·
//                der: origen (compartido) + carrito. Cada línea a su zona.
//   · Salida   → izq: productos con stock · centro: cantidad por zona ·
//                der: destino + dirección (compartido) + carrito.
//   · Traslado → izq: zona origen + sus productos · centro: cuánto sale de
//                cada tamaño + zona/tamaño destino · der: carrito.
// Se pueden añadir varios productos antes de registrar.
const TIPO_META = {
  entrada: { label: "Entrada", grad: "linear-gradient(90deg,#10b981,#06b6d4)", accent: "#10b981", tint: "rgba(16,185,129,0.07)", border: "rgba(16,185,129,0.4)", cta: "✓ Registrar entradas" },
  salida: { label: "Salida", grad: "linear-gradient(90deg,#ef4444,#f59e0b)", accent: "#ef4444", tint: "rgba(239,68,68,0.06)", border: "rgba(239,68,68,0.4)", cta: "✓ Registrar salidas" },
  traslado_interno: { label: "Traslado", grad: "linear-gradient(90deg,#6366f1,#0ea5e9)", accent: "#6366f1", tint: "rgba(99,102,241,0.07)", border: "rgba(99,102,241,0.4)", cta: "✓ Registrar traslados" },
};

function MovimientoCestaModal({ open, onClose, productos, movimientos, zonas, onSubmit, saving }) {
  const stockByProductZoneSize = useMemo(() => buildStockByProductZoneSize(movimientos), [movimientos]);
  const prodById = useMemo(() => {
    const m = new Map();
    for (const p of safeArray(productos)) m.set(String(p.id), p);
    return m;
  }, [productos]);

  const [tipo, setTipo] = useState("salida"); // entrada | salida | traslado_interno
  const [search, setSearch] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroSubcategoria, setFiltroSubcategoria] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [sourceZone, setSourceZone] = useState("");       // traslado: zona origen
  const [sizeQty, setSizeQty] = useState({});              // entrada/traslado: { tamano: cantidad }
  const [zonaQty, setZonaQty] = useState({});              // salida: { `${zonaLower}__${tam}`: cantidad }
  const [lineZonaDestino, setLineZonaDestino] = useState(""); // entrada/traslado: zona destino de la línea
  const [lineTamanoDestino, setLineTamanoDestino] = useState(""); // traslado: tamaño destino ("" = mismo)
  // Compartido de entrada / salida.
  const [entradaOrigen, setEntradaOrigen] = useState("");
  const [entradaOtros, setEntradaOtros] = useState("");
  const [destinoTipo, setDestinoTipo] = useState("");
  const [distrito, setDistrito] = useState("");
  const [barrio, setBarrio] = useState("");
  const [direccion, setDireccion] = useState("");
  const [cart, setCart] = useState([]);
  const [localError, setLocalError] = useState("");

  const meta = TIPO_META[tipo] || TIPO_META.salida;
  const esEntrada = tipo === "entrada";
  const esSalida = tipo === "salida";
  const esTraslado = tipo === "traslado_interno";

  const resetSeleccion = () => { setSelectedProductId(""); setSizeQty({}); setZonaQty({}); setLineZonaDestino(""); setLineTamanoDestino(""); };

  useEffect(() => {
    if (!open) {
      setTipo("salida"); setSearch(""); setFiltroCategoria(""); setFiltroSubcategoria("");
      setSelectedProductId(""); setSourceZone(""); setSizeQty({}); setZonaQty({});
      setLineZonaDestino(""); setLineTamanoDestino("");
      setEntradaOrigen(""); setEntradaOtros(""); setDestinoTipo(""); setDistrito(""); setBarrio(""); setDireccion("");
      setCart([]); setLocalError("");
    }
  }, [open]);
  // Cambiar de tipo reinicia toda la selección y el carrito (las líneas son
  // específicas del tipo).
  useEffect(() => {
    setSearch(""); setFiltroCategoria(""); setFiltroSubcategoria("");
    resetSeleccion(); setSourceZone("");
    setEntradaOrigen(""); setEntradaOtros(""); setDestinoTipo(""); setDistrito(""); setBarrio(""); setDireccion("");
    setCart([]); setLocalError("");
  }, [tipo]);
  useEffect(() => { setFiltroSubcategoria(""); }, [filtroCategoria]);
  useEffect(() => { setBarrio(""); }, [distrito]);
  useEffect(() => { setSizeQty({}); setZonaQty({}); setLineZonaDestino(""); setLineTamanoDestino(""); }, [selectedProductId]);
  useEffect(() => { resetSeleccion(); }, [sourceZone]); // traslado: cambiar origen resetea producto

  const sInput = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(15,23,42,0.14)", outline: "none", fontWeight: 700, color: "#0f172a", background: "#fff", boxSizing: "border-box" };

  const zonaIdByLower = useMemo(() => {
    const m = new Map();
    for (const z of safeArray(zonas)) m.set(String(z).toLowerCase(), z);
    return m;
  }, [zonas]);

  const esExterno = isExternalDestination(destinoTipo);
  const esBaja = destinoTipo === "Baja Vivero";

  // Stock total por producto (solo tamaños válidos) — para salida.
  const stockPorProducto = useMemo(() => {
    const totals = new Map();
    for (const [key, qty] of stockByProductZoneSize.entries()) {
      if (Number(qty) <= 0) continue;
      const parts = key.split("__");
      const pid = parts[0];
      const tam = parts.slice(2).join("__");
      // Contamos TODO el stock físico real, sin filtrar por tamaño "estándar":
      // así los árboles/palmeras en M20 (u otros tamaños) siguen siendo movibles.
      totals.set(pid, (totals.get(pid) || 0) + Number(qty));
    }
    return totals;
  }, [stockByProductZoneSize, prodById]);

  // Stock por producto en la zona origen (solo traslado).
  const stockEnZonaOrigen = useMemo(() => {
    const totals = new Map();
    if (!sourceZone) return totals;
    const zl = String(sourceZone).toLowerCase();
    for (const [key, qty] of stockByProductZoneSize.entries()) {
      if (Number(qty) <= 0) continue;
      const parts = key.split("__");
      if (parts[1] !== zl) continue;
      const pid = parts[0];
      const tam = parts.slice(2).join("__");
      // Contamos TODO el stock físico real, sin filtrar por tamaño "estándar":
      // así los árboles/palmeras en M20 (u otros tamaños) siguen siendo movibles.
      totals.set(pid, (totals.get(pid) || 0) + Number(qty));
    }
    return totals;
  }, [sourceZone, stockByProductZoneSize, prodById]);

  // Base de productos del panel izquierdo según el tipo.
  const productosBase = useMemo(() => {
    if (esEntrada) return safeArray(productos);
    if (esTraslado) return safeArray(productos).filter((p) => (stockEnZonaOrigen.get(String(p.id)) || 0) > 0);
    return safeArray(productos).filter((p) => (stockPorProducto.get(String(p.id)) || 0) > 0);
  }, [esEntrada, esTraslado, productos, stockEnZonaOrigen, stockPorProducto]);

  const infoStock = (pid) => {
    if (esEntrada) return null;
    if (esTraslado) return stockEnZonaOrigen.get(String(pid)) || 0;
    return stockPorProducto.get(String(pid)) || 0;
  };

  const categoriasDisponibles = useMemo(() => {
    const s = new Set();
    for (const p of productosBase) { const c = String(p?.categoria || "").trim(); if (c) s.add(c); }
    return [...s].sort((a, b) => a.localeCompare(b, "es"));
  }, [productosBase]);
  const subcategoriasDisponibles = useMemo(() => {
    if (!filtroCategoria) return [];
    const s = new Set();
    for (const p of productosBase) { if (String(p?.categoria || "").trim() !== filtroCategoria) continue; const sc = String(p?.subcategoria || "").trim(); if (sc) s.add(sc); }
    return [...s].sort((a, b) => a.localeCompare(b, "es"));
  }, [productosBase, filtroCategoria]);

  const productosFiltrados = useMemo(() => {
    const t = search.trim().toLowerCase();
    return productosBase.filter((p) => {
      if (filtroCategoria && String(p.categoria || "").trim() !== filtroCategoria) return false;
      if (filtroSubcategoria && String(p.subcategoria || "").trim() !== filtroSubcategoria) return false;
      if (!t) return true;
      return getProductDisplayName(p).toLowerCase().includes(t) ||
        String(p.categoria || "").toLowerCase().includes(t) ||
        String(p.subcategoria || "").toLowerCase().includes(t);
    }).sort((a, b) => getProductDisplayName(a).localeCompare(getProductDisplayName(b), "es"));
  }, [productosBase, search, filtroCategoria, filtroSubcategoria]);

  const selectedProduct = prodById.get(String(selectedProductId)) || null;
  const formatoConfig = getProductFormatoConfig(selectedProduct);
  const allowDecimals = !!formatoConfig?.allowDecimals;

  // Zonas destino permitidas según categoría (entrada/traslado).
  const zonasDestinoPermitidas = useMemo(
    () => getZonasPermitidasParaCategoria(selectedProduct, zonas),
    [selectedProduct, zonas]
  );
  // Si solo hay una zona destino posible, la fijamos automáticamente.
  useEffect(() => {
    if ((esEntrada || esTraslado) && selectedProduct && zonasDestinoPermitidas.length === 1) {
      setLineZonaDestino(zonasDestinoPermitidas[0]);
    }
  }, [esEntrada, esTraslado, selectedProduct, zonasDestinoPermitidas]);

  // ENTRADA: tamaños posibles del producto (destino). Se ofrecen TODOS los
  // formatos/tamaños del producto (p. ej. M12/M20/M35 en plantas); la regla
  // tamanoDisponiblePlanta solo aplica a lo que la UTE puede pedir, no a los
  // movimientos físicos (una planta puede entrar o repotarse a cualquier tamaño).
  const tamanosEntrada = useMemo(() => {
    if (!esEntrada || !selectedProduct) return [];
    return getFormatoOptions(formatoConfig);
  }, [esEntrada, selectedProduct, formatoConfig]);

  // TRASLADO: tamaños con stock en la zona origen (descontando carrito).
  const tamanosTraslado = useMemo(() => {
    if (!esTraslado || !selectedProduct || !sourceZone) return [];
    const pid = String(selectedProduct.id);
    const zl = String(sourceZone).toLowerCase();
    const rows = [];
    for (const [key, qty] of stockByProductZoneSize.entries()) {
      if (Number(qty) <= 0) continue;
      const parts = key.split("__");
      if (parts[0] !== pid || parts[1] !== zl) continue;
      const tam = parts.slice(2).join("__");
      // Stock físico real: sin filtro de tamaño "estándar" (árboles en M20 movibles).
      const enCarrito = cart
        .filter((c) => String(c.producto_id) === pid && String(c.zona_origen || "").toLowerCase() === zl && c.tamano_origen === tam)
        .reduce((s, c) => s + Number(c.cantidad || 0), 0);
      const disp = Math.max(0, Number(qty) - enCarrito);
      if (disp <= 0) continue;
      rows.push({ tamano: tam, disponible: disp });
    }
    rows.sort((a, b) => String(a.tamano).localeCompare(String(b.tamano)));
    return rows;
  }, [esTraslado, selectedProduct, sourceZone, stockByProductZoneSize, cart]);

  // SALIDA: zonas (con tamaño) del producto, descontando carrito.
  const zonasSalida = useMemo(() => {
    if (!esSalida || !selectedProduct) return [];
    const pid = String(selectedProduct.id);
    const rows = [];
    for (const [key, qty] of stockByProductZoneSize.entries()) {
      if (Number(qty) <= 0) continue;
      const parts = key.split("__");
      if (parts[0] !== pid) continue;
      const zonaLower = parts[1];
      const tam = parts.slice(2).join("__");
      // Stock físico real: sin filtro de tamaño "estándar" (árboles en M20 movibles).
      const enCarrito = cart
        .filter((c) => String(c.producto_id) === pid && String(c.zona_origen || "").toLowerCase() === zonaLower && c.tamano_origen === tam)
        .reduce((s, c) => s + Number(c.cantidad || 0), 0);
      const disp = Math.max(0, Number(qty) - enCarrito);
      if (disp <= 0) continue;
      rows.push({ zonaLower, zona: zonaIdByLower.get(zonaLower) || zonaLower, tamano: tam, disponible: disp });
    }
    rows.sort((a, b) => b.disponible - a.disponible || String(a.tamano).localeCompare(String(b.tamano)));
    return rows;
  }, [esSalida, selectedProduct, stockByProductZoneSize, cart, zonaIdByLower]);

  const totalSeleccionado = useMemo(() => {
    if (esSalida) return zonasSalida.reduce((s, r) => s + Number(zonaQty[`${r.zonaLower}__${r.tamano}`] || 0), 0);
    const sizes = esEntrada ? tamanosEntrada : tamanosTraslado.map((r) => r.tamano);
    return sizes.reduce((s, t) => s + Number(sizeQty[t] || 0), 0);
  }, [esSalida, esEntrada, zonasSalida, zonaQty, tamanosEntrada, tamanosTraslado, sizeQty]);

  // Zonas seleccionables como origen del traslado (las que tienen algún stock).
  const zonasConStockGlobal = useMemo(() => {
    const s = new Set();
    for (const [key, qty] of stockByProductZoneSize.entries()) {
      if (Number(qty) <= 0) continue;
      s.add(key.split("__")[1]);
    }
    return naturalSortZonas(safeArray(zonas).filter((z) => s.has(String(z).toLowerCase())));
  }, [stockByProductZoneSize, zonas]);

  const removeCart = (key) => setCart((prev) => prev.filter((c) => c.key !== key));

  const addToCart = () => {
    setLocalError("");
    if (!selectedProduct) return;
    const nombre = getProductDisplayName(selectedProduct);
    const nuevos = [];

    if (esEntrada) {
      if (!lineZonaDestino) { setLocalError("Elige la zona destino de este producto."); return; }
      for (const tam of tamanosEntrada) {
        let q = Number(sizeQty[tam] || 0);
        if (!allowDecimals) q = Math.round(q);
        if (q <= 0) continue;
        nuevos.push({ key: `${selectedProduct.id}-${tam}-${cart.length}-${nuevos.length}`, tipo: "entrada", producto_id: selectedProduct.id, nombre, tamano_destino: tam, zona_destino: lineZonaDestino, cantidad: q });
      }
      if (nuevos.length === 0) { setLocalError("Indica cuántas unidades entran de al menos un tamaño."); return; }
    } else if (esTraslado) {
      if (!lineZonaDestino) { setLocalError("Elige la zona destino del traslado."); return; }
      for (const r of tamanosTraslado) {
        let q = Number(sizeQty[r.tamano] || 0);
        if (!allowDecimals) q = Math.round(q);
        if (q <= 0) continue;
        if (q > r.disponible) { setLocalError(`En ${getZonaLabel(sourceZone)} · ${r.tamano} solo hay ${r.disponible} disponibles.`); return; }
        nuevos.push({ key: `${selectedProduct.id}-${r.tamano}-${cart.length}-${nuevos.length}`, tipo: "traslado_interno", producto_id: selectedProduct.id, nombre, zona_origen: sourceZone, tamano_origen: r.tamano, zona_destino: lineZonaDestino, tamano_destino: lineTamanoDestino || r.tamano, cantidad: q });
      }
      if (nuevos.length === 0) { setLocalError("Indica cuántas unidades trasladar de al menos un tamaño."); return; }
    } else {
      for (const r of zonasSalida) {
        const rk = `${r.zonaLower}__${r.tamano}`;
        let q = Number(zonaQty[rk] || 0);
        if (!allowDecimals) q = Math.round(q);
        if (q <= 0) continue;
        if (q > r.disponible) { setLocalError(`En ${getZonaLabel(r.zona)} · ${r.tamano} solo hay ${r.disponible} disponibles.`); return; }
        nuevos.push({ key: `${selectedProduct.id}-${rk}-${cart.length}-${nuevos.length}`, tipo: "salida", producto_id: selectedProduct.id, nombre, zona_origen: r.zona, tamano_origen: r.tamano, cantidad: q });
      }
      if (nuevos.length === 0) { setLocalError("Indica cuántas unidades sacar de al menos una zona."); return; }
    }
    setCart((prev) => [...prev, ...nuevos]);
    resetSeleccion();
  };

  // Validez del panel derecho compartido.
  const compartidoValido = esEntrada
    ? (!!entradaOrigen && (entradaOrigen !== ENTRADA_ORIGEN_OTROS || !!entradaOtros.trim()))
    : esSalida
      ? (!!destinoTipo && (esBaja || (!!distrito && !!barrio && !!String(direccion).trim())))
      : true; // traslado no tiene compartido
  const canSubmit = !saving && cart.length > 0 && compartidoValido;

  const submit = async () => {
    setLocalError("");
    if (cart.length === 0) { setLocalError("Añade al menos un producto al carrito."); return; }
    if (esEntrada && !entradaOrigen) { setLocalError("Elige el origen de la entrada."); return; }
    if (esEntrada && entradaOrigen === ENTRADA_ORIGEN_OTROS && !entradaOtros.trim()) { setLocalError("Especifica el origen de la entrada."); return; }
    if (esSalida && !destinoTipo) { setLocalError("Elige el destino de la salida."); return; }
    if (esSalida && esExterno && (!distrito || !barrio || !String(direccion).trim())) { setLocalError("Indica distrito, barrio y dirección de destino."); return; }

    const origenEntradaFinal = entradaOrigen === ENTRADA_ORIGEN_OTROS && entradaOtros.trim()
      ? entradaOtros.trim().slice(0, 30)
      : entradaOrigen;

    const base = () => ({
      pedido_id: null, pedido_item_id: null,
      cp_destino: null, observaciones: null, nota: null,
      es_prestamo: false, es_devolucion: false, prestamo_referencia_id: null,
      fecha_disponibilidad: null, fecha_movimiento: null,
    });

    const payloads = cart.map((c) => {
      if (c.tipo === "entrada") {
        return { ...base(), producto_id: Number(c.producto_id), origen_tipo: origenEntradaFinal, destino_tipo: "Vivero", tamano_origen: null, tamano_destino: c.tamano_destino || null, zona_origen: null, zona_destino: c.zona_destino, distrito_destino: null, barrio_destino: null, direccion_destino: null, cantidad: c.cantidad };
      }
      if (c.tipo === "traslado_interno") {
        return { ...base(), producto_id: Number(c.producto_id), origen_tipo: "Vivero", destino_tipo: "Vivero", tamano_origen: c.tamano_origen || null, tamano_destino: c.tamano_destino || c.tamano_origen || null, zona_origen: c.zona_origen, zona_destino: c.zona_destino, distrito_destino: null, barrio_destino: null, direccion_destino: null, cantidad: c.cantidad };
      }
      return { ...base(), producto_id: Number(c.producto_id), origen_tipo: "Vivero", destino_tipo: destinoTipo, tamano_origen: c.tamano_origen || null, tamano_destino: null, zona_origen: c.zona_origen, zona_destino: null, distrito_destino: esExterno ? (distrito || null) : null, barrio_destino: esExterno ? (barrio || null) : null, direccion_destino: esExterno ? (String(direccion).trim() || null) : null, cantidad: c.cantidad };
    });
    await onSubmit(payloads);
  };

  if (!open) return null;

  const totalUds = cart.reduce((s, c) => s + Number(c.cantidad || 0), 0);
  const barriosDisp = distrito ? (DISTRITO_BARRIOS[distrito] || []) : [];
  const DISTRITOS = Object.keys(DISTRITO_BARRIOS);
  // Tamaños destino ofrecidos en traslado: TODOS los del producto (permite
  // repotar M12→M20, etc.). La regla tamanoDisponiblePlanta solo limita lo que
  // la UTE puede pedir, no los movimientos internos.
  const tamanosDestinoTraslado = getFormatoOptions(formatoConfig);

  const tipoBtn = (val) => {
    const m = TIPO_META[val];
    const active = tipo === val;
    return (
      <button key={val} type="button" onClick={() => setTipo(val)}
        style={{ padding: "9px 20px", borderRadius: 999, border: active ? "none" : "1px solid rgba(15,23,42,0.14)", background: active ? m.grad : "#fff", color: active ? "#fff" : "#334155", fontWeight: 900, cursor: "pointer", fontSize: 14 }}>
        {m.label}
      </button>
    );
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,0.62)", backdropFilter: "blur(6px)", zIndex: 1400, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: "min(1500px, 97vw)", height: "min(880px, 94vh)", background: "#fff", borderRadius: 22, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 40px 100px rgba(2,6,23,0.4)" }}
        onClick={(e) => e.stopPropagation()}>

        {/* CABECERA: selector de tipo */}
        <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(15,23,42,0.08)", display: "flex", alignItems: "center", gap: 12, background: meta.tint }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a" }}>Nuevo movimiento</div>
          <div style={{ display: "flex", gap: 8 }}>
            {["entrada", "salida", "traslado_interno"].map(tipoBtn)}
          </div>
          <button onClick={onClose} style={{ marginLeft: "auto", border: "none", background: "transparent", color: "#64748b", fontWeight: 900, cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>

        {/* CUERPO: 3 columnas */}
        <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "0.95fr 1.05fr 0.9fr" }}>

          {/* IZQUIERDA: (traslado: zona origen) + productos + filtros */}
          <div style={{ padding: 20, borderRight: "1px solid rgba(15,23,42,0.08)", overflowY: "auto", minHeight: 0 }}>
            {esTraslado && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#64748b", textTransform: "uppercase", marginBottom: 6 }}>Zona de origen</div>
                <select value={sourceZone} onChange={(e) => setSourceZone(e.target.value)} style={sInput}>
                  <option value="">Selecciona la zona de origen</option>
                  {zonasConStockGlobal.map((z) => <option key={z} value={z}>{getZonaLabel(z)}</option>)}
                </select>
              </div>
            )}
            <div style={{ fontSize: 20, fontWeight: 900, color: "#0f172a" }}>{esEntrada ? "Productos" : esTraslado ? (sourceZone ? "Productos en la zona" : "Elige zona origen") : "Productos disponibles"}</div>
            {(esTraslado && !sourceZone) ? (
              <div style={{ marginTop: 12, color: "#64748b", fontWeight: 700 }}>Selecciona primero la zona de origen para ver sus productos.</div>
            ) : (
              <>
                <input placeholder="Buscar por nombre, categoría o subcategoría…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...sInput, marginTop: 12 }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                  <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} style={sInput}>
                    <option value="">Todas las categorías</option>
                    {categoriasDisponibles.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={filtroSubcategoria} onChange={(e) => setFiltroSubcategoria(e.target.value)} disabled={!filtroCategoria || subcategoriasDisponibles.length === 0} style={{ ...sInput, opacity: filtroCategoria ? 1 : 0.55 }}>
                    <option value="">Todas las subcategorías</option>
                    {subcategoriasDisponibles.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: "#64748b", fontWeight: 700 }}>{productosFiltrados.length} {esEntrada ? "productos" : "con stock"}</div>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  {productosFiltrados.length === 0 ? (
                    <div style={{ color: "#64748b", fontWeight: 700 }}>No hay productos para esa búsqueda.</div>
                  ) : productosFiltrados.map((p) => {
                    const active = String(selectedProductId) === String(p.id);
                    const info = infoStock(p.id);
                    return (
                      <button key={p.id} onClick={() => setSelectedProductId(String(p.id))} style={{ textAlign: "left", padding: 12, borderRadius: 12, cursor: "pointer", border: active ? `1px solid ${meta.border}` : "1px solid rgba(148,163,184,0.18)", background: active ? meta.tint : "#fff" }}>
                        <div style={{ fontWeight: 900, color: "#0f172a", fontSize: 14 }}>{getProductDisplayName(p)}</div>
                        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>{(p.categoria || "—") + (p.subcategoria ? ` · ${p.subcategoria}` : "")}</div>
                        {info != null && <div style={{ marginTop: 6, fontSize: 12, fontWeight: 900, color: "#065f46" }}>Disponible: {formatCantidad(info)}</div>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* CENTRO: cantidades del producto seleccionado */}
          <div style={{ padding: 20, borderRight: "1px solid rgba(15,23,42,0.08)", overflowY: "auto", minHeight: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#0f172a" }}>{selectedProduct ? getProductDisplayName(selectedProduct) : "Selecciona un producto"}</div>
            {!selectedProduct ? (
              <div style={{ marginTop: 16, color: "#64748b", fontWeight: 700 }}>Elige un producto de la izquierda para indicar cantidades{esEntrada ? " por tamaño y su zona destino" : esTraslado ? ", la zona y el tamaño destino" : " por zona"}.</div>
            ) : esSalida ? (
              zonasSalida.length === 0 ? (
                <div style={{ marginTop: 16, color: "#991b1b", fontWeight: 700 }}>Este producto ya no tiene stock disponible (o ya lo has añadido todo al carrito).</div>
              ) : (
                <>
                  <div style={{ marginTop: 6, color: "#64748b", fontWeight: 700, fontSize: 13 }}>Indica cuántas unidades sacar de cada zona.</div>
                  <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                    {zonasSalida.map((r) => {
                      const rk = `${r.zonaLower}__${r.tamano}`;
                      return (
                        <div key={rk} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(248,250,252,0.9)", border: "1px solid rgba(15,23,42,0.06)" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 900, color: "#0f172a", fontSize: 13 }}>{getZonaLabel(r.zona)}</div>
                            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>Tamaño: {r.tamano} · Disponible: {formatCantidad(r.disponible)}</div>
                          </div>
                          <input type="number" min={0} max={r.disponible} step={allowDecimals ? "0.01" : "1"} placeholder="0"
                            value={zonaQty[rk] ?? ""}
                            onChange={(e) => { let raw = allowDecimals ? e.target.value : e.target.value.replace(/[^\d]/g, ""); if (raw !== "" && Number(raw) > r.disponible) raw = String(r.disponible); setZonaQty((prev) => ({ ...prev, [rk]: raw })); }}
                            style={{ ...sInput, width: 92, textAlign: "right" }} />
                        </div>
                      );
                    })}
                  </div>
                </>
              )
            ) : esEntrada ? (
              tamanosEntrada.length === 0 ? (
                <div style={{ marginTop: 16, color: "#991b1b", fontWeight: 700 }}>Este producto no admite tamaños de entrada.</div>
              ) : (
                <>
                  <div style={{ marginTop: 6, color: "#64748b", fontWeight: 700, fontSize: 13 }}>Indica cuántas unidades entran de cada tamaño.</div>
                  <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                    {tamanosEntrada.map((tam) => (
                      <div key={tam} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(248,250,252,0.9)", border: "1px solid rgba(15,23,42,0.06)" }}>
                        <div style={{ flex: 1, minWidth: 0, fontWeight: 900, color: "#0f172a", fontSize: 13 }}>{tam}</div>
                        <input type="number" min={0} step={allowDecimals ? "0.01" : "1"} placeholder="0"
                          value={sizeQty[tam] ?? ""}
                          onChange={(e) => { const raw = allowDecimals ? e.target.value : e.target.value.replace(/[^\d]/g, ""); setSizeQty((prev) => ({ ...prev, [tam]: raw })); }}
                          style={{ ...sInput, width: 92, textAlign: "right" }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#64748b", textTransform: "uppercase", marginBottom: 6 }}>Zona destino de este producto</div>
                    <select value={lineZonaDestino} onChange={(e) => setLineZonaDestino(e.target.value)} style={sInput}>
                      <option value="">Selecciona la zona destino</option>
                      {zonasDestinoPermitidas.map((z) => <option key={z} value={z}>{getZonaLabel(z)}</option>)}
                    </select>
                  </div>
                </>
              )
            ) : ( // traslado
              tamanosTraslado.length === 0 ? (
                <div style={{ marginTop: 16, color: "#991b1b", fontWeight: 700 }}>Este producto ya no tiene stock disponible en la zona origen (o ya lo añadiste al carrito).</div>
              ) : (
                <>
                  <div style={{ marginTop: 6, color: "#64748b", fontWeight: 700, fontSize: 13 }}>Indica cuántas unidades salen de cada tamaño de {getZonaLabel(sourceZone)}.</div>
                  <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                    {tamanosTraslado.map((r) => (
                      <div key={r.tamano} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(248,250,252,0.9)", border: "1px solid rgba(15,23,42,0.06)" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 900, color: "#0f172a", fontSize: 13 }}>{r.tamano}</div>
                          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>Disponible: {formatCantidad(r.disponible)}</div>
                        </div>
                        <input type="number" min={0} max={r.disponible} step={allowDecimals ? "0.01" : "1"} placeholder="0"
                          value={sizeQty[r.tamano] ?? ""}
                          onChange={(e) => { let raw = allowDecimals ? e.target.value : e.target.value.replace(/[^\d]/g, ""); if (raw !== "" && Number(raw) > r.disponible) raw = String(r.disponible); setSizeQty((prev) => ({ ...prev, [r.tamano]: raw })); }}
                          style={{ ...sInput, width: 92, textAlign: "right" }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "#64748b", textTransform: "uppercase", marginBottom: 6 }}>Zona destino</div>
                      <select value={lineZonaDestino} onChange={(e) => setLineZonaDestino(e.target.value)} style={sInput}>
                        <option value="">Selecciona la zona destino</option>
                        {zonasDestinoPermitidas.map((z) => <option key={z} value={z}>{getZonaLabel(z)}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "#64748b", textTransform: "uppercase", marginBottom: 6 }}>Tamaño destino (opcional)</div>
                      <select value={lineTamanoDestino} onChange={(e) => setLineTamanoDestino(e.target.value)} style={sInput}>
                        <option value="">Mismo tamaño que el origen</option>
                        {tamanosDestinoTraslado.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                </>
              )
            )}

            {selectedProduct && (
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontWeight: 900, fontSize: 13, color: totalSeleccionado > 0 ? "#065f46" : "#64748b" }}>Seleccionado: {formatCantidad(totalSeleccionado)}</div>
                <button type="button" onClick={addToCart} disabled={totalSeleccionado <= 0}
                  style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: totalSeleccionado > 0 ? meta.grad : "#cbd5e1", color: "#fff", fontWeight: 900, cursor: totalSeleccionado > 0 ? "pointer" : "not-allowed", fontSize: 13 }}>
                  + Añadir al carrito
                </button>
              </div>
            )}
          </div>

          {/* DERECHA: (entrada: origen / salida: destino) + carrito */}
          <div style={{ padding: 20, overflowY: "auto", minHeight: 0, background: "linear-gradient(180deg,#fff,rgba(240,249,255,0.6))", display: "flex", flexDirection: "column" }}>
            {esEntrada && (
              <>
                <div style={{ fontSize: 20, fontWeight: 900, color: "#0f172a" }}>Origen de la entrada</div>
                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  <select value={entradaOrigen} onChange={(e) => setEntradaOrigen(e.target.value)} style={sInput}>
                    <option value="">Seleccionar origen</option>
                    {ENTRADA_ORIGENES.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  {entradaOrigen === ENTRADA_ORIGEN_OTROS && (
                    <input value={entradaOtros} onChange={(e) => setEntradaOtros(e.target.value)} placeholder="Especifica el origen (ej. Palmetum)" maxLength={30} style={sInput} />
                  )}
                </div>
              </>
            )}
            {esSalida && (
              <>
                <div style={{ fontSize: 20, fontWeight: 900, color: "#0f172a" }}>Destino de la salida</div>
                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#64748b", textTransform: "uppercase", marginBottom: 6 }}>Tipo de destino</div>
                    <select value={destinoTipo} onChange={(e) => setDestinoTipo(e.target.value)} style={sInput}>
                      <option value="">Seleccionar destino</option>
                      {SALIDA_DESTINOS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  {esExterno && (
                    <>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 900, color: "#64748b", textTransform: "uppercase", marginBottom: 6 }}>Distrito</div>
                        <select value={distrito} onChange={(e) => setDistrito(e.target.value)} style={sInput}>
                          <option value="">Seleccionar distrito</option>
                          {DISTRITOS.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 900, color: "#64748b", textTransform: "uppercase", marginBottom: 6 }}>Barrio</div>
                        <select value={barrio} onChange={(e) => setBarrio(e.target.value)} disabled={!distrito} style={{ ...sInput, opacity: distrito ? 1 : 0.6 }}>
                          <option value="">{distrito ? "Seleccionar barrio" : "Primero el distrito"}</option>
                          {barriosDisp.map((b) => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 900, color: "#64748b", textTransform: "uppercase", marginBottom: 6 }}>Dirección</div>
                        <input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Escribe la dirección de destino" style={sInput} />
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
            {esTraslado && (
              <div style={{ fontSize: 20, fontWeight: 900, color: "#0f172a" }}>Traslado entre zonas</div>
            )}

            <div style={{ marginTop: 16, fontWeight: 900, color: "#0f172a", fontSize: 15 }}>Carrito ({cart.length} · {formatCantidad(totalUds)} uds)</div>
            <div style={{ marginTop: 8, display: "grid", gap: 8, flex: 1 }}>
              {cart.length === 0 ? (
                <div style={{ color: "#64748b", fontWeight: 700, fontSize: 13 }}>Añade productos desde el panel central.</div>
              ) : cart.map((c) => (
                <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, background: "#fff", border: "1px solid rgba(15,23,42,0.08)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 900, color: "#0f172a", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombre}</div>
                    <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>
                      {c.tipo === "entrada" && `→ ${getZonaLabel(c.zona_destino)} · ${c.tamano_destino} · ${formatCantidad(c.cantidad)} uds`}
                      {c.tipo === "salida" && `${getZonaLabel(c.zona_origen)} · ${c.tamano_origen} · ${formatCantidad(c.cantidad)} uds`}
                      {c.tipo === "traslado_interno" && `${getZonaLabel(c.zona_origen)} (${c.tamano_origen}) → ${getZonaLabel(c.zona_destino)} (${c.tamano_destino}) · ${formatCantidad(c.cantidad)} uds`}
                    </div>
                  </div>
                  <button type="button" onClick={() => removeCart(c.key)} style={{ border: "none", background: "transparent", color: "#991b1b", fontWeight: 900, cursor: "pointer", fontSize: 14 }}>✕</button>
                </div>
              ))}
            </div>

            {localError ? (
              <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#991b1b", fontWeight: 800, fontSize: 13 }}>{localError}</div>
            ) : null}

            <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
              <button onClick={onClose} disabled={saving} style={{ padding: "11px 18px", borderRadius: 10, border: "2px solid #94a3b8", background: "#e2e8f0", color: "#334155", fontWeight: 900, cursor: "pointer" }}>Cerrar</button>
              <button onClick={submit} disabled={!canSubmit} style={{ marginLeft: "auto", padding: "11px 22px", borderRadius: 10, border: "none", background: canSubmit ? meta.grad : "#cbd5e1", color: "#fff", fontWeight: 900, cursor: canSubmit ? "pointer" : "not-allowed", minWidth: 180 }}>
                {saving ? "Guardando…" : meta.cta}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Movimientos() {
  const [movimientos, setMovimientos] = useState([]);
  const [productos, setProductos] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showSalidaModal, setShowSalidaModal] = useState(false);
  const [detalleMovimiento, setDetalleMovimiento] = useState(null);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("success");

  // Lista de zonas reales del vivero, cargada dinámicamente desde el servidor
  // (donde el editor del mapa las persiste). Si la carga falla, se usa el
  // fallback estático DEFAULT_ZONAS. Siempre ordenadas de forma natural
  // (1, 2, 3a, 3b, ..., 10a, 10b, 11, 12) independientemente del orden con
  // que vengan del servidor.
  const [zonasDisponibles, setZonasDisponibles] = useState(() =>
    ensureZonasEspeciales(DEFAULT_ZONAS)
  );

  useEffect(() => {
    let cancelled = false;
    loadZonasFromServer()
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data) && data.length > 0) {
          const ids = data
            .map((z) => z.apiId || z.id)
            .filter(Boolean)
            // Acepta "zona-3a", "zona3a", "ZONA-3A", "3a" y los normaliza a "3a".
            .map((id) => String(id).trim().toLowerCase().replace(/^zona[-_]?/i, ""));
          const seen = new Set();
          const unique = ids.filter((id) => {
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          });
          if (unique.length > 0) {
            // ensureZonasEspeciales añade Almacén y Zona Compostaje si no
            // vienen del servidor, garantizando que estén siempre disponibles.
            setZonasDisponibles(ensureZonasEspeciales(unique));
          }
        }
      })
      .catch(() => {
        // Mantén el fallback estático (ya ordenado, con zonas especiales).
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const msgTimerRef = useRef(null);

  const [filtroProducto, setFiltroProducto] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroZona, setFiltroZona] = useState("");
  const [filtroUuid, setFiltroUuid] = useState("");
  const [filtroOrigen, setFiltroOrigen] = useState("");
  const [filtroDestino, setFiltroDestino] = useState("");
  const [filtroFecha, setFiltroFecha] = useState("");
  const [copiedUuid, setCopiedUuid] = useState("");

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

  const clearFilters = () => {
    setFiltroProducto("");
    setFiltroTipo("");
    setFiltroZona("");
    setFiltroUuid("");
    setFiltroOrigen("");
    setFiltroDestino("");
    setFiltroFecha("");
  };

  useEffect(() => {
    load();

    return () => {
      clearMsgTimer();
    };
  }, []);

  const load = async () => {
    setLoading(true);
    clearMsgTimer();
    setMsg("");

    try {
      const [movs, prods, peds] = await Promise.all([
        getMovimientos(),
        getProductos(),
        getPedidos(),
      ]);

      setMovimientos(safeArray(movs));
      setProductos(safeArray(prods));
      setPedidos(safeArray(peds));
    } catch (e) {
      showTimedMessage(
        e?.response?.data?.detail || e?.message || "Error cargando movimientos",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const pedidosAprobados = useMemo(() => {
    // Pedidos with at least one approved item that the proveedor can act on.
    // APROBADO_PARCIAL belongs here too — its approved items are serviceable.
    const SERVICEABLE = new Set(["APROBADO", "APROBADO_PARCIAL"]);
    return safeArray(pedidos).filter((p) => SERVICEABLE.has(String(p?.estado || "").toUpperCase()));
  }, [pedidos]);

  const movimientosFiltrados = useMemo(() => {
    return movimientos.filter((m) => {
      const productoTxt = filtroProducto.trim().toLowerCase();
      const uuidTxt = filtroUuid.trim().toLowerCase();
      const tipoReal = String(m?.tipo_movimiento || getMovimientoTipo(m) || "").toLowerCase();
      const origenReal = String(m?.origen_tipo || "").toLowerCase();
      const destinoReal = String(m?.destino_tipo || "").toLowerCase();
      const zonasMovimiento = [m?.zona_origen, m?.zona_destino].filter(Boolean).map((z) => String(z).toLowerCase());

      const productoMatch =
        !productoTxt ||
        `${m?.producto_nombre_cientifico || ""} ${m?.producto_nombre_natural || ""} ${m?.producto_id || ""}`
          .toLowerCase()
          .includes(productoTxt);

      const tipoMatch = !filtroTipo || tipoReal === String(filtroTipo).toLowerCase();
      const zonaMatch = !filtroZona || zonasMovimiento.includes(String(filtroZona).toLowerCase());
      const uuidMatch = !uuidTxt || String(m?.uuid_lote || "").toLowerCase().includes(uuidTxt);
      const origenMatch = !filtroOrigen || origenReal === String(filtroOrigen).toLowerCase();
      const destinoMatch = !filtroDestino || destinoReal === String(filtroDestino).toLowerCase();
      const fechaMatch = !filtroFecha || dateInputValue(m?.fecha_movimiento) === filtroFecha;

      return productoMatch && tipoMatch && zonaMatch && uuidMatch && origenMatch && destinoMatch && fechaMatch;
    });
  }, [movimientos, filtroProducto, filtroTipo, filtroZona, filtroUuid, filtroOrigen, filtroDestino, filtroFecha]);

  const handleCreateMovimiento = async (payloadOrList) => {
    const payloads = Array.isArray(payloadOrList) ? payloadOrList : [payloadOrList];
    if (!payloads.length) return;

    setSaving(true);
    let creados = 0;
    let errorMsg = "";
    try {
      for (const p of payloads) {
        try {
          await createMovimiento(p);
          creados += 1;
        } catch (e) {
          errorMsg = e?.response?.data?.detail || e?.message || "Error guardando movimiento";
          break; // detenemos en el primer fallo
        }
      }
      if (errorMsg) {
        await load();
        showTimedMessage(
          `Guardados ${creados}/${payloads.length}. ${errorMsg}`,
          "error"
        );
      } else {
        setShowModal(false);
        setShowSalidaModal(false);
        await load();
        showTimedMessage(
          payloads.length > 1
            ? `${payloads.length} movimientos guardados correctamente.`
            : "Movimiento guardado correctamente.",
          "success"
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const copyUuid = async (uuid) => {
    const value = String(uuid || "").trim();
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopiedUuid(value);
      showTimedMessage(`UUID copiado: ${value}`, "success");

      window.setTimeout(() => {
        setCopiedUuid((prev) => (prev === value ? "" : prev));
      }, 1800);
    } catch (e) {
      showTimedMessage("No se pudo copiar el UUID.", "error");
    }
  };

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 44, margin: 0, fontWeight: 900, color: "#0f172a" }}>Movimientos</h1>
          <div style={{ marginTop: 8, color: "#64748b", fontWeight: 700 }}>
            Registra y consulta entradas, salidas, préstamos, devoluciones y traslados del vivero.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => setShowSalidaModal(true)}
            style={{
              padding: "12px 18px",
              borderRadius: 16,
              border: "1px solid rgba(16,185,129,0.28)",
              background: "linear-gradient(90deg, #10b981 0%, #06b6d4 100%)",
              color: "white",
              fontWeight: 900,
              cursor: "pointer",
              boxShadow: "0 16px 36px rgba(6,182,212,0.18)",
            }}
          >
            Nuevo movimiento
          </button>
          <button
            onClick={() => setShowModal(true)}
            style={{
              padding: "12px 18px",
              borderRadius: 16,
              border: "1px solid rgba(148,163,184,0.35)",
              background: "#fff",
              color: "#334155",
              fontWeight: 900,
              cursor: "pointer",
              boxShadow: "0 10px 26px rgba(15,23,42,0.08)",
            }}
          >
            Servir pedido / Devolución
          </button>
        </div>
      </div>

      <MessageBanner
        msg={msg}
        onClose={() => {
          clearMsgTimer();
          setMsg("");
        }}
        isError={msgType === "error"}
      />

      <div
        style={{
          marginTop: 16,
          background: "white",
          border: "1px solid rgba(15,23,42,0.06)",
          borderRadius: 18,
          boxShadow: "0 10px 30px rgba(2,6,23,0.06)",
          padding: 16,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(0, 1fr)) auto",
            gap: 12,
            alignItems: "end",
          }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, color: "#64748b", marginBottom: 6 }}>Producto</div>
            <input
              value={filtroProducto}
              onChange={(e) => setFiltroProducto(e.target.value)}
              placeholder="Buscar nombre científico"
              style={inputStyle()}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 900, color: "#64748b", marginBottom: 6 }}>Tipo</div>
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              style={inputStyle()}
            >
              <option value="">Todos</option>
              {TIPOS_MOVIMIENTO.map((tipo) => (
                <option key={tipo.value} value={tipo.value}>
                  {tipo.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 900, color: "#64748b", marginBottom: 6 }}>Zona</div>
            <select
              value={filtroZona}
              onChange={(e) => setFiltroZona(e.target.value)}
              style={inputStyle()}
            >
              <option value="">Todas</option>
              {zonasDisponibles.map((zona) => (
                <option key={zona} value={zona}>
                  {getZonaDisplayName(zona)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 900, color: "#64748b", marginBottom: 6 }}>UUID</div>
            <input
              value={filtroUuid}
              onChange={(e) => setFiltroUuid(e.target.value)}
              placeholder="Buscar UUID"
              style={inputStyle()}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 900, color: "#64748b", marginBottom: 6 }}>Origen</div>
            <select
              value={filtroOrigen}
              onChange={(e) => setFiltroOrigen(e.target.value)}
              style={inputStyle()}
            >
              <option value="">Todos</option>
              {ORIGENES.map((origen) => (
                <option key={origen} value={origen}>
                  {origen}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 900, color: "#64748b", marginBottom: 6 }}>Destino</div>
            <select
              value={filtroDestino}
              onChange={(e) => setFiltroDestino(e.target.value)}
              style={inputStyle()}
            >
              <option value="">Todos</option>
              {[...new Set(["Vivero", ...DESTINOS_SALIDA_VIVERO])].map((destino) => (
                <option key={destino} value={destino}>
                  {destino}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 900, color: "#64748b", marginBottom: 6 }}>Fecha</div>
            <input
              type="date"
              value={filtroFecha}
              onChange={(e) => setFiltroFecha(e.target.value)}
              style={inputStyle()}
            />
          </div>

          <button
            onClick={clearFilters}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(15,23,42,0.10)",
              background: "white",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Limpiar
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          background: "white",
          border: "1px solid rgba(15,23,42,0.06)",
          borderRadius: 18,
          boxShadow: "0 10px 30px rgba(2,6,23,0.06)",
          padding: 16,
        }}
      >
        {loading ? (
          <div style={{ color: "#64748b", fontWeight: 800 }}>Cargando movimientos…</div>
        ) : movimientosFiltrados.length === 0 ? (
          <div style={{ color: "#64748b", fontWeight: 800 }}>No hay movimientos para los filtros actuales.</div>
        ) : (
          <div>
            <table
              style={{
                width: "100%",
                borderCollapse: "separate",
                borderSpacing: "0 10px",
                tableLayout: "fixed",
              }}
            >
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ ...thStyle(), width: "95px" }}>Fecha</th>
                  <th style={{ ...thStyle(), width: "90px" }}>Tipo</th>
                  <th style={{ ...thStyle(), width: "145px" }}>Nombre científico</th>
                  <th style={{ ...thStyle(), width: "70px" }}>Cant.</th>
                  <th style={{ ...thStyle(), width: "135px" }}>Origen</th>
                  <th style={{ ...thStyle(), width: "145px" }}>Destino</th>
                  <th style={{ ...thStyle(), width: "95px" }}>Préstamo</th>
                  <th style={{ ...thStyle(), width: "110px" }}>Usuario</th>
                  <th style={{ ...thStyle(), width: "110px" }}>UUID lote</th>
                  <th style={{ ...thStyle(), width: "75px" }}>Pedido</th>
                  <th style={{ ...thStyle(), width: "80px" }}>Detalles</th>
                </tr>
              </thead>
              <tbody>
                {movimientosFiltrados.map((m) => {
                  const tipo = m.tipo_movimiento || getMovimientoTipo(m);
                  const esPrestamo = !!m.es_prestamo;
                  const esDevolucionMov = !!m.es_devolucion || getMovimientoTipo(m) === "devolucion";

                  return (
                    <tr
                      key={m.id}
                      style={{
                        background: "white",
                        boxShadow: "0 6px 18px rgba(2,6,23,0.05)",
                      }}
                    >
                      <td
                        style={{
                          ...tdStyle(),
                          borderTop: "1px solid rgba(15,23,42,0.10)",
                          borderBottom: "1px solid rgba(15,23,42,0.10)",
                          borderLeft: "1px solid rgba(15,23,42,0.10)",
                          borderTopLeftRadius: 14,
                          borderBottomLeftRadius: 14,
                        }}
                      >
                        {fmtFechaES(m.fecha_movimiento)}
                      </td>

                      <td
                        style={{
                          ...tdStyle(),
                          borderTop: "1px solid rgba(15,23,42,0.10)",
                          borderBottom: "1px solid rgba(15,23,42,0.10)",
                        }}
                      >
                        <span style={tipoTextStyle(tipo)}>{getTipoDisplayLabel(tipo)}</span>
                      </td>

                      <td
                        style={{
                          ...tdStyle(),
                          borderTop: "1px solid rgba(15,23,42,0.10)",
                          borderBottom: "1px solid rgba(15,23,42,0.10)",
                          maxWidth: 145,
                        }}
                      >
                        <div
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={m.producto_nombre_cientifico || m.nombre_cientifico || `Producto #${m.producto_id}`}
                        >
                          {m.producto_nombre_cientifico || m.nombre_cientifico || `Producto #${m.producto_id}`}
                        </div>
                      </td>

                      <td
                        style={{
                          ...tdStyle(),
                          borderTop: "1px solid rgba(15,23,42,0.10)",
                          borderBottom: "1px solid rgba(15,23,42,0.10)",
                        }}
                      >
                        {formatCantidadConUnidad(m.cantidad, getUnidadMovimiento(m))}
                      </td>

                      <td
                        style={{
                          ...tdStyle(),
                          borderTop: "1px solid rgba(15,23,42,0.10)",
                          borderBottom: "1px solid rgba(15,23,42,0.10)",
                          maxWidth: 135,
                        }}
                      >
                        <div
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={buildLabelOrigen(m)}
                        >
                          {buildLabelOrigen(m)}
                        </div>
                      </td>

                      <td
                        style={{
                          ...tdStyle(),
                          borderTop: "1px solid rgba(15,23,42,0.10)",
                          borderBottom: "1px solid rgba(15,23,42,0.10)",
                          maxWidth: 145,
                        }}
                      >
                        <div
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={buildLabelDestino(m)}
                        >
                          {buildLabelDestino(m)}
                        </div>
                      </td>

                      <td
                        style={{
                          ...tdStyle(),
                          borderTop: "1px solid rgba(15,23,42,0.10)",
                          borderBottom: "1px solid rgba(15,23,42,0.10)",
                        }}
                      >
                        <span style={prestamoTextStyle(esPrestamo ? "prestamo" : esDevolucionMov ? "devolucion" : "none")}>
                          {esPrestamo ? "Préstamo" : esDevolucionMov ? "Devolución" : "—"}
                        </span>
                      </td>

                      <td
                        style={{
                          ...tdStyle(),
                          borderTop: "1px solid rgba(15,23,42,0.10)",
                          borderBottom: "1px solid rgba(15,23,42,0.10)",
                          minWidth: 110,
                          maxWidth: 110,
                          width: 110,
                        }}
                      >
                        <div
                          title={formatUsername(m.created_by) || "—"}
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: "#1e3a8a",
                            fontWeight: 800,
                          }}
                        >
                          {formatUsername(m.created_by) || "—"}
                        </div>
                      </td>

                      <td
                        style={{
                          ...tdStyle(),
                          borderTop: "1px solid rgba(15,23,42,0.10)",
                          borderBottom: "1px solid rgba(15,23,42,0.10)",
                          maxWidth: 110,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            minWidth: 0,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => copyUuid(m.uuid_lote)}
                            title={m.uuid_lote ? `Copiar UUID: ${m.uuid_lote}` : "Sin UUID"}
                            disabled={!m.uuid_lote}
                            style={{
                              border: "1px solid rgba(15,23,42,0.10)",
                              background: copiedUuid === m.uuid_lote ? "rgba(16,185,129,0.10)" : "white",
                              color: copiedUuid === m.uuid_lote ? "#065f46" : "#334155",
                              borderRadius: 10,
                              padding: "6px 8px",
                              fontSize: 12,
                              fontWeight: 900,
                              cursor: m.uuid_lote ? "pointer" : "not-allowed",
                              flexShrink: 0,
                              opacity: m.uuid_lote ? 1 : 0.5,
                            }}
                          >
                            {copiedUuid === m.uuid_lote ? "Copiado" : "Copiar"}
                          </button>

                          <div
                            onClick={() => copyUuid(m.uuid_lote)}
                            title={m.uuid_lote ? `Click para copiar: ${m.uuid_lote}` : "—"}
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              fontFamily:
                                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace",
                              fontSize: 12,
                              cursor: m.uuid_lote ? "pointer" : "default",
                              color: m.uuid_lote ? "#0f172a" : "#94a3b8",
                              fontWeight: copiedUuid === m.uuid_lote ? 900 : 700,
                              minWidth: 0,
                            }}
                          >
                            {m.uuid_lote || "—"}
                          </div>
                        </div>
                      </td>

                      <td
                        style={{
                          ...tdStyle(),
                          borderTop: "1px solid rgba(15,23,42,0.10)",
                          borderBottom: "1px solid rgba(15,23,42,0.10)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span style={{ fontWeight: 900, color: "#1e3a8a" }}>
                          {m.pedido_id ? `#${m.pedido_id}` : "—"}
                        </span>
                      </td>

                      <td
                        style={{
                          ...tdStyle(),
                          borderTop: "1px solid rgba(15,23,42,0.10)",
                          borderBottom: "1px solid rgba(15,23,42,0.10)",
                          borderRight: "1px solid rgba(15,23,42,0.10)",
                          borderTopRightRadius: 14,
                          borderBottomRightRadius: 14,
                          whiteSpace: "nowrap",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setDetalleMovimiento(m)}
                          title="Ver todos los detalles del movimiento"
                          style={{
                            border: "1px solid rgba(15,23,42,0.10)",
                            background: "#0f5132",
                            color: "#ffffff",
                            borderRadius: 10,
                            padding: "6px 10px",
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          Ver
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <MovimientoModal
        open={showModal}
        onClose={() => setShowModal(false)}
        productos={productos}
        movimientos={movimientos}
        pedidosAprobados={pedidosAprobados}
        onSubmit={handleCreateMovimiento}
        saving={saving}
        zonas={zonasDisponibles}
      />

      <MovimientoCestaModal
        open={showSalidaModal}
        onClose={() => setShowSalidaModal(false)}
        productos={productos}
        movimientos={movimientos}
        zonas={zonasDisponibles}
        onSubmit={handleCreateMovimiento}
        saving={saving}
      />

      <MovimientoDetalleModal
        movimiento={detalleMovimiento}
        onClose={() => setDetalleMovimiento(null)}
      />
    </div>
  );
}

// =========================================================================
// MOVIMIENTO DETALLE MODAL
// =========================================================================
function MovimientoDetalleModal({ movimiento, onClose }) {
  if (!movimiento) return null;

  const m = movimiento;
  const tipo = m.tipo_movimiento || "—";
  const fmt = (d) => formatFechaHoraCanaria(d);
  const fmtDate = (d) => formatFechaCanaria(d);

  const Row = ({ label, value, mono = false }) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "180px 1fr",
        gap: 12,
        padding: "10px 0",
        borderBottom: "1px solid rgba(15,23,42,0.06)",
      }}
    >
      <div style={{ color: "#64748b", fontWeight: 700, fontSize: 13 }}>{label}</div>
      <div
        style={{
          color: "#0f172a",
          fontWeight: 700,
          fontSize: 14,
          fontFamily: mono
            ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
            : "inherit",
          wordBreak: "break-word",
        }}
      >
        {value || "—"}
      </div>
    </div>
  );

  const direccion = [m.direccion_destino, m.barrio_destino, m.distrito_destino, m.cp_destino]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,6,23,0.55)",
        zIndex: 2500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(680px, 96vw)",
          maxHeight: "90vh",
          overflow: "auto",
          background: "white",
          borderRadius: 20,
          padding: 24,
          boxShadow: "0 30px 80px rgba(2,6,23,0.35)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#0f172a" }}>
              Detalle del movimiento #{m.id}
            </div>
            <div style={{ color: "#64748b", fontWeight: 700, marginTop: 4 }}>
              Registrado por <strong style={{ color: "#1e3a8a" }}>{formatUsername(m.created_by) || "—"}</strong>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 0,
              background: "#0f5132",
              color: "#fff",
              padding: "8px 16px",
              borderRadius: 10,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Cerrar
          </button>
        </div>

        <div>
          <Row label="Fecha movimiento" value={fmt(m.fecha_movimiento)} />
          <Row label="Tipo" value={tipo} />
          <Row label="Producto" value={m.producto_nombre_cientifico || m.nombre_cientifico || `Producto #${m.producto_id}`} />
          <Row label="Cantidad" value={formatCantidadConUnidad(m.cantidad, getUnidadMovimiento(m))} />

          <Row label="Origen" value={`${m.origen_tipo || "—"}${m.zona_origen ? " · Zona " + m.zona_origen : ""}${m.tamano_origen ? " · " + m.tamano_origen : ""}`} />
          <Row label="Destino" value={`${m.destino_tipo || "—"}${m.zona_destino ? " · Zona " + m.zona_destino : ""}${m.tamano_destino ? " · " + m.tamano_destino : ""}`} />

          {direccion && <Row label="Dirección destino" value={direccion} />}

          <Row label="Préstamo" value={m.es_prestamo ? "Sí" : m.es_devolucion ? "Devolución" : "No"} />

          <Row label="UUID lote" value={m.uuid_lote} mono />
          <Row label="Pedido asociado" value={m.pedido_id ? `#${m.pedido_id}` : "—"} />

          <Row label="Fecha caducidad" value={fmtDate(m.fecha_caducidad)} />
          <Row label="Días caducidad aplicados" value={m.dias_caducidad_aplicados ?? "—"} />
          {m.fecha_disponibilidad && (
            <Row label="Fecha disponibilidad" value={fmtDate(m.fecha_disponibilidad)} />
          )}

          <Row label="Observaciones" value={m.observaciones || m.nota || "—"} />
        </div>
      </div>
    </div>
  );
}
