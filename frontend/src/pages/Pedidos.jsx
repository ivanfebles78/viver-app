import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { formatUsername } from "../utils/format";
import { formatFechaCanaria } from "../utils/fecha";
import { rolEfectivo } from "../utils/roles";
import { getProductFormatoConfig, getFormatoOptions } from "../utils/formato";
import { formatCantidad } from "../utils/numero";
import {
  Button,
  Card,
  DataTable,
  EmptyState as EmptyStateUI,
  Field,
  Input,
  PageHeader,
  StatusBadge,
  cn,
} from "../ui";
import { Dialog, DialogContent } from "../ui";
import { Alert } from "../components/ui/feedback";
import { FilterBar } from "../components/ui/layout";
import SearchField from "../components/ui/SearchField";
import SelectField from "../components/ui/SelectField";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { estadoPedido } from "../app/estado";
import { guardarPedidosPdf, imprimirPedidosEnNavegador } from "./pedidos.pdf";
import {
  ESTADO_FILTERS,
  ESTADOS_CERRADOS,
  clampNumber,
  construirEdicion,
  construirItemsEdicion,
  estadoLabel,
  estadoNormalizado,
  filtrarPedidos,
  lineKey,
  parseLineKey,
  puedeEditarCancelar as puedeEditarCancelarLogica,
  safeArray,
  solicitanteFromPedido as solicitanteFromPedidoLogica,
  solicitantesDisponibles as solicitantesDisponiblesLogica,
} from "./pedidos.logic";
import {
  getPedidos,
  getProductos,
  getMovimientos,
  createPedido,
  updatePedido,
  cancelarPedido,
  descargarPedidoPdf,
} from "../api/api";
import { CARD_CLS, INPUT_CLS, TD, TH } from "../components/ui/tableStyles";

/** Fecha corta en formato canario, tal y como la mostraba main. */
const fmtFechaES = (value) => formatFechaCanaria(value);

const TAMANOS = ["Semillero", "M12", "M20", "M35"];

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
  "Salud-La Salle": [
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
    "Tristán",
    "Villa Benítez",
    "Vistabella",
  ],
  Suroeste: [
    "Acorán",
    "Alisios",
    "Añaza",
    "Barranco Grande",
    "El Chorrillo",
    "El Sobradillo",
    "El Tablero",
    "La Gallega",
    "Llano del Moro",
    "Santa María del Mar",
    "Tíncer",
  ],
};

const DISTRITOS = Object.keys(DISTRITO_BARRIOS);


// Devuelve la fecha de caducidad del pedido.
// 1) Si el pedido tiene fecha_caducidad a nivel pedido (ej. empresa_externa = 15 días), usa esa.
// 2) Si no, calcula la más próxima entre los movimientos_servicio de sus items.
const getPedidoFechaCaducidad = (pedido) => {
  let fecha = null;
  if (pedido?.fecha_caducidad) {
    const d = new Date(pedido.fecha_caducidad);
    if (!Number.isNaN(d.getTime())) fecha = d;
  }
  if (!fecha) {
    const items = Array.isArray(pedido?.items) ? pedido.items : [];
    let min = null;
    for (const it of items) {
      const movs = Array.isArray(it?.movimientos_servicio) ? it.movimientos_servicio : [];
      for (const m of movs) {
        if (!m?.fecha_caducidad) continue;
        const d = new Date(m.fecha_caducidad);
        if (Number.isNaN(d.getTime())) continue;
        if (!min || d < min) min = d;
      }
    }
    fecha = min;
  }
  // La caducidad de un pedido es, como máximo, 15 días desde su creación
  // (cubre también pedidos antiguos cuya fecha venía de la planta).
  if (pedido?.created_at) {
    const creado = new Date(pedido.created_at);
    if (!Number.isNaN(creado.getTime())) {
      const tope = new Date(creado.getTime() + 15 * 24 * 60 * 60 * 1000);
      if (!fecha || fecha > tope) fecha = tope;
    }
  }
  return fecha;
};

/*
 * CLASES DEL SISTEMA que sustituyen a los ayudantes de estilo en línea.
 *
 * La densidad se conserva a propósito: son datos operativos que se consultan a
 * diario y se imprimen. Una tabla con más aire se lee peor, no mejor.
 */
/*
 * El banner era un `div` con colores propios. `Alert` ya resuelve el rol ARIA
 * según el tono —`alert` para error, `status` para el resto—, que es lo que
 * faltaba: un fallo de carga solo PINTADO no llega a quien usa lector de
 * pantalla.
 */
function MessageBanner({ msg, msgType, onClose }) {
  if (!msg) return null;
  return (
    <Alert tone={msgType === "error" ? "error" : "success"} onDismiss={onClose}>
      {msg}
    </Alert>
  );
}

function DestinoResumen({ distrito, barrio, direccion }) {
  const parts = [distrito, barrio, direccion].filter(Boolean);
  if (!parts.length) return "—";
  return parts.join(" · ");
}

function getScientificProductDisplayName(p) {
  return (
    p?.nombre_cientifico ||
    p?.producto_nombre_cientifico ||
    p?.nombre_cientifico_producto ||
    p?.nombre ||
    p?.producto_nombre ||
    p?.nombre_natural ||
    p?.producto_nombre_natural ||
    `Producto #${p?.id || p?.producto_id || "—"}`
  );
}

function ModalStat({ label, value, tone = "default" }) {
  const tones = {
    default: {
      background: "var(--card)",
      color: "var(--foreground)",
      border: "1px solid var(--border)",
    },
    success: {
      background: "var(--muted)",
      color: "var(--success-subtle-foreground)",
      border: "1px solid var(--border)",
    },
    warn: {
      background: "var(--warning-subtle)",
      color: "var(--warning-subtle-foreground)",
      border: "1px solid var(--border)",
    },
  };

  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: "var(--radius-lg)",
        ...tones[tone],
      }}
    >
      <div style={{ fontSize: 11, fontWeight: "var(--font-weight-semibold)", color: "var(--muted-foreground)", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ marginTop: 4, fontSize: 22, fontWeight: "var(--font-weight-semibold)", color: tones[tone].color }}>{value}</div>
    </div>
  );
}

/* ===========================
   NUEVO PEDIDO
   =========================== */

/*
 * Serie de colores para distinguir DESTINOS dentro de un pedido.
 *
 * Eran diez colores escritos a mano. La escala `--chart-*` del sistema existe
 * exactamente para esto —series categóricas— y está resuelta para separar
 * luminancias entre entradas contiguas, que es lo que hace que se distingan.
 *
 * El destino nunca depende SOLO del color: cada grupo lleva su dirección
 * escrita encima.
 */
const DESTINO_COLORS = Array.from({ length: 8 }, (_, i) => ({
  bg: `var(--chart-${i + 1})`,
  fg: "var(--card)",
}));
const destinoColorAt = (i) => DESTINO_COLORS[((i % DESTINO_COLORS.length) + DESTINO_COLORS.length) % DESTINO_COLORS.length];

function PedidoModal({
  open,
  onClose,
  productos,
  stockByProductSize,
  onSubmit,
  saving,
  esEmpresaExterna = false,
}) {
  const [search, setSearch] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroSubcategoria, setFiltroSubcategoria] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [qtyInput, setQtyInput] = useState({});
  const [localError, setLocalError] = useState("");

  // El pedido se construye por GRUPOS: cada grupo es un destino con su propia
  // cesta de productos. Un pedido normal tiene un único grupo (un destino); la
  // empresa externa (UTE) puede añadir hasta 10 grupos (producto→destino),
  // eligiendo productos y asociándolos a cada destino.
  const MAX_DESTINOS = 10;
  /*
   * DEFECTO PREVIO CORREGIDO. El inicializador de `useState` leía e incrementaba
   * `grupoSeqRef` durante el render. En StrictMode React invoca el inicializador
   * dos veces, así que el contador arrancaba en 3 en vez de en 2 y el primer
   * grupo podía recibir un `_id` distinto en cada montaje.
   *
   * El primer grupo se declara literalmente con el id 1 y el contador arranca en
   * 2. `makeGrupo` solo se llama desde manejadores de evento, nunca en render.
   */
  const GRUPO_VACIO = { distrito: "", barrio: "", direccion: "", cart: {} };
  const grupoSeqRef = useRef(2);
  const makeGrupo = () => ({ _id: grupoSeqRef.current++, ...GRUPO_VACIO });
  const [grupos, setGrupos] = useState(() => [{ _id: 1, ...GRUPO_VACIO }]);
  // Grupo al que se añaden los productos seleccionados en el panel izquierdo.
  const [activeGrupoId, setActiveGrupoId] = useState(null);
  // Destinos plegados en el modal (por _id de grupo).
  const [gruposColapsados, setGruposColapsados] = useState({});
  const toggleGrupoColapsado = (id) => setGruposColapsados((p) => ({ ...p, [id]: !p[id] }));
  // Comentarios/anotaciones que la empresa externa adjunta al pedido; los ve
  // quien aprueba y quien sirve, y salen en el PDF impreso.
  const [nota, setNota] = useState("");

  /*
   * Antes había aquí dos efectos que hacían `setState`: uno reiniciaba once
   * campos al cerrarse el modal y otro limpiaba la subcategoría al cambiar la
   * categoría.
   *
   * El primero lo sustituye el remontado: el padre pasa una `key` atada a la
   * apertura, así que abrir el modal crea una instancia nueva y el estado
   * arranca en el de la declaración — sin una lista que haya que ampliar cada
   * vez que se añade un campo.
   *
   * El segundo pasa al manejador, que es donde ocurre la acción del usuario.
   */

  /** La subcategoría depende de la categoría: mantenerla daría una lista vacía. */
  const cambiarCategoria = (valor) => {
    setFiltroCategoria(valor);
    setFiltroSubcategoria("");
  };

  // Solo los productos que TIENEN stock disponible (en alguno de sus formatos).
  // Los desplegables de categoría/subcategoría se derivan EXCLUSIVAMENTE de
  // estos, para no ofrecer categorías/subcategorías sin existencias.
  const productosConStock = useMemo(() => {
    return safeArray(productos).filter((p) => {
      const formatoOptions = getFormatoOptions(getProductFormatoConfig(p));
      return formatoOptions.some(
        (t) => (stockByProductSize.get(lineKey(p.id, t)) || 0) > 0
      );
    });
  }, [productos, stockByProductSize]);

  // Categorías y subcategorías disponibles para los desplegables de filtro,
  // solo entre productos con stock.
  const categoriasDisponibles = useMemo(() => {
    const set = new Set();
    for (const p of productosConStock) {
      const c = String(p?.categoria || "").trim();
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [productosConStock]);

  const subcategoriasDisponibles = useMemo(() => {
    if (!filtroCategoria) return [];
    const set = new Set();
    for (const p of productosConStock) {
      if (String(p?.categoria || "").trim() !== filtroCategoria) continue;
      const s = String(p?.subcategoria || "").trim();
      if (s) set.add(s);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [productosConStock, filtroCategoria]);

  const barriosDe = (distrito) => (distrito ? DISTRITO_BARRIOS[distrito] || [] : []);

  const activeGrupo = grupos.find((g) => g._id === activeGrupoId) || grupos[0];

  // Suma de un producto+tamaño reservado en TODOS los grupos (para no exceder
  // el stock disponible al repartir el mismo producto entre varios destinos).
  /*
   * `useCallback` para que su identidad sólo cambie cuando cambian los grupos.
   * Sin eso, el `useMemo` que la usa la recibe distinta en cada render y el
   * compilador de React no puede conservar esa memoización.
   */
  const totalAsignado = useCallback(
    (key) => grupos.reduce((s, g) => s + Number(g.cart?.[key] || 0), 0),
    [grupos]
  );

  // Líneas (producto, tamaño, cantidad) de un grupo.
  const grupoLines = (g) =>
    Object.entries(g.cart || {})
      .map(([key, cantidad]) => {
        const parsed = parseLineKey(key);
        const prod = productos.find((p) => p.id === parsed.producto_id);
        return {
          key,
          producto_id: parsed.producto_id,
          tamano: parsed.tamano,
          cantidad: Number(cantidad),
          nombre: getScientificProductDisplayName(prod),
        };
      })
      .filter((x) => x.cantidad > 0);

  const grupoAddressValid = (g) =>
    !!g.distrito && !!g.barrio && !!String(g.direccion || "").trim();

  // Gestión de grupos/destinos (solo la UTE puede tener más de uno).
  const updateGrupo = (id, field, value) => {
    setGrupos((prev) =>
      prev.map((g) =>
        g._id === id
          ? { ...g, [field]: value, ...(field === "distrito" ? { barrio: "" } : {}) }
          : g
      )
    );
  };
  const addGrupo = () => {
    if (grupos.length >= MAX_DESTINOS) return;
    const g = makeGrupo();
    setGrupos((prev) => [...prev, g]);
    setActiveGrupoId(g._id);
    // Colapsa los destinos anteriores para que el foco quede en el nuevo.
    setGruposColapsados((prev) => {
      const next = { ...prev };
      for (const gr of grupos) next[gr._id] = true;
      return next;
    });
  };
  const removeGrupo = (id) => {
    if (grupos.length <= 1) return;
    const next = grupos.filter((g) => g._id !== id);
    setGrupos(next);
    if (activeGrupoId === id) setActiveGrupoId(next[0]._id);
  };

  const addToGrupo = (grupoId, productoId, tamano, qty) => {
    const key = lineKey(productoId, tamano);
    setGrupos((prev) =>
      prev.map((g) =>
        g._id === grupoId
          ? { ...g, cart: { ...g.cart, [key]: Number(g.cart?.[key] || 0) + qty } }
          : g
      )
    );
  };
  const setGrupoLineQty = (grupoId, key, qty) => {
    setGrupos((prev) =>
      prev.map((g) => {
        if (g._id !== grupoId) return g;
        const cart = { ...g.cart };
        if (qty <= 0) delete cart[key];
        else cart[key] = qty;
        return { ...g, cart };
      })
    );
  };

  const productosDisponibles = useMemo(() => {
    const texto = search.trim().toLowerCase();

    return safeArray(productos)
      .filter((p) => {
        // Las opciones válidas dependen de la categoría del producto:
        // plantas → tamaños de maceta; fito/fert → formatos de polvo/líquido;
        // áridos/material vegetal → "metros cúbicos"; ferretería → "metros" o "unidades".
        const formatoOptions = getFormatoOptions(getProductFormatoConfig(p));
        const tieneStock = formatoOptions.some(
          (t) => (stockByProductSize.get(lineKey(p.id, t)) || 0) > 0
        );
        if (!tieneStock) return false;

        // Filtros por desplegable de categoría / subcategoría.
        if (filtroCategoria && String(p?.categoria || "").trim() !== filtroCategoria) return false;
        if (filtroSubcategoria && String(p?.subcategoria || "").trim() !== filtroSubcategoria) return false;

        if (!texto) return true;

        const nombreCientifico = String(p?.nombre_cientifico || p?.producto_nombre_cientifico || "").toLowerCase();
        const categoria = String(p?.categoria || "").toLowerCase();
        const subcategoria = String(p?.subcategoria || "").toLowerCase();

        return (
          nombreCientifico.includes(texto) ||
          categoria.includes(texto) ||
          subcategoria.includes(texto)
        );
      })
      .sort((a, b) =>
        String(getScientificProductDisplayName(a)).localeCompare(String(getScientificProductDisplayName(b)))
      );
  }, [productos, stockByProductSize, search, filtroCategoria, filtroSubcategoria]);

  const selectedProduct = useMemo(
    () => productosDisponibles.find((p) => String(p.id) === String(selectedProductId)) || null,
    [productosDisponibles, selectedProductId]
  );

  // FormatoConfig del producto seleccionado — usado para decidir si la cantidad
  // admite decimales (fitosanitarios/fertilizantes) o solo enteros.
  const selectedFormatoConfig = useMemo(
    () => getProductFormatoConfig(selectedProduct),
    [selectedProduct]
  );

  const selectedProductSizes = useMemo(() => {
    if (!selectedProduct) return [];
    const formatoOptions = getFormatoOptions(getProductFormatoConfig(selectedProduct));
    return formatoOptions.map((tamano) => {
      const key = lineKey(selectedProduct.id, tamano);
      const disponible = Math.max(0, Number(stockByProductSize.get(key) || 0));
      // Ya asignado a TODOS los destinos del pedido (no solo al grupo activo),
      // para no permitir repartir más unidades de las que hay.
      const asignado = totalAsignado(key);
      const restante = Math.max(0, disponible - asignado);
      return { tamano, disponible, restante, enCesta: asignado };
    }).filter((x) => x.disponible > 0);
    // `totalAsignado` ya depende de `grupos`: nombrarla aquí es lo que permite
    // al compilador comprobar que la memoización es correcta.
  }, [selectedProduct, stockByProductSize, totalAsignado]);

  const totalLineas = grupos.reduce((s, g) => s + grupoLines(g).length, 0);
  const totalItems = grupos.reduce(
    (s, g) => s + Object.values(g.cart || {}).reduce((a, q) => a + Number(q || 0), 0),
    0
  );
  const hasAnyProduct = totalLineas > 0;

  // Ningún producto puede superar, sumando todos los destinos, su stock.
  const stockValid = useMemo(() => {
    const totals = {};
    for (const g of grupos) {
      for (const [key, q] of Object.entries(g.cart || {})) {
        totals[key] = (totals[key] || 0) + Number(q || 0);
      }
    }
    return Object.entries(totals).every(
      ([key, q]) => q <= Math.max(0, Number(stockByProductSize.get(key) || 0))
    );
  }, [grupos, stockByProductSize]);

  // Cada destino debe tener dirección completa y al menos un producto.
  const allGruposValid = grupos.every(
    (g) => grupoAddressValid(g) && grupoLines(g).length > 0
  );

  const canSubmit = !saving && hasAnyProduct && allGruposValid && stockValid;

  const addToCart = (productoId, tamano) => {
    setLocalError("");
    const key = lineKey(productoId, tamano);
    const qty = Number(qtyInput[key]);
    const disponible = Math.max(0, Number(stockByProductSize.get(key) || 0));
    const restante = disponible - totalAsignado(key);

    if (!qty || qty <= 0) {
      setLocalError("Indica una cantidad válida mayor que 0.");
      return;
    }
    if (qty > restante) {
      setLocalError(`No puedes añadir ${qty}. Disponible restante para ${tamano}: ${restante}.`);
      return;
    }
    if (!activeGrupo) return;

    addToGrupo(activeGrupo._id, productoId, tamano, qty);
    setQtyInput((prev) => ({ ...prev, [key]: "" }));
  };

  const submitPedido = async () => {
    setLocalError("");

    if (!hasAnyProduct) {
      setLocalError("Añade al menos un producto a algún destino.");
      return;
    }
    if (!stockValid) {
      setLocalError("Hay productos cuya cantidad total supera el stock disponible.");
      return;
    }
    for (const g of grupos) {
      if (grupoLines(g).length === 0) {
        setLocalError("Cada destino debe tener al menos un producto.");
        return;
      }
      if (!grupoAddressValid(g)) {
        setLocalError("Cada destino debe tener distrito, barrio y dirección.");
        return;
      }
    }

    // Una línea por (producto, destino): así al servir se genera un movimiento
    // por cada una con su dirección.
    const items = [];
    for (const g of grupos) {
      for (const line of grupoLines(g)) {
        items.push({
          producto_id: line.producto_id,
          tamano: line.tamano,
          cantidad: line.cantidad,
          distrito_destino: g.distrito,
          barrio_destino: g.barrio,
          direccion_destino: String(g.direccion || "").trim(),
        });
      }
    }
    const primero = grupos[0];
    await onSubmit({
      items,
      // Destino a nivel de pedido = primer destino (compatibilidad/visualización).
      distrito_destino: primero.distrito,
      barrio_destino: primero.barrio,
      direccion_destino: String(primero.direccion || "").trim(),
      nota: String(nota || "").trim() || null,
    });
  };

  return (
    /*
     * `Dialog` del sistema en lugar de dos `div` con `position: fixed`
     * anidados. Lo que gana no es aspecto: trampa de foco, cierre con Escape y
     * devolución del foco al botón que lo abrió — ninguna de las tres existía.
     *
     * Las tres columnas se conservan a partir de `xl`; por debajo se apilan, que
     * es lo que hacía falta: la rejilla fija de tres columnas obligaba a
     * desplazarse en horizontal en cualquier portátil.
     */
    <Dialog open={open} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent
        title="Nuevo pedido"
        description="Selecciona productos con stock disponible y confirma el destino final."
        closeLabel="Cerrar"
        size="lg"
        className="max-w-[min(1760px,98vw)]"
      >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.02fr_1fr]">
        <div
          style={{
            padding: 24,
            borderRight: "1px solid var(--border)",
            overflowY: "auto",
            overflowX: "hidden",
            minWidth: 0,
            background: "var(--muted)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 30, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Nuevo pedido</div>
              <div style={{ marginTop: 6, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-medium)" }}>
                Selecciona productos con stock disponible y confirma el destino final.
              </div>
            </div>

            <button
              onClick={onClose}
              style={{
                width: 42,
                height: 42,
                borderRadius: "var(--radius-full)",
                border: "1px solid var(--border)",
                background: "white",
                fontWeight: "var(--font-weight-semibold)",
                fontSize: 18,
                cursor: "pointer",
                color: "var(--foreground)",
              }}
              title="Cerrar"
            >
              ×
            </button>
          </div>

          <div style={{ marginTop: 18, position: "relative" }}>
            <input
              placeholder="Buscar por nombre científico, categoría o subcategoría..."
              aria-label="Buscar productos"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={INPUT_CLS}
            />
          </div>

          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <select
              aria-label="Filtrar productos por categoría"
              value={filtroCategoria}
              onChange={(e) => cambiarCategoria(e.target.value)}
              className={INPUT_CLS}
            >
              <option value="">Todas las categorías</option>
              {categoriasDisponibles.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              aria-label="Filtrar productos por subcategoría"
              value={filtroSubcategoria}
              onChange={(e) => setFiltroSubcategoria(e.target.value)}
              className={cn(INPUT_CLS, !filtroCategoria && "opacity-55")}
              disabled={!filtroCategoria || subcategoriasDisponibles.length === 0}
            >
              <option value="">Todas las subcategorías</option>
              {subcategoriasDisponibles.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <ModalStat label="Productos con stock" value={productosDisponibles.length} />
            <ModalStat label="Líneas del pedido" value={totalLineas} tone={totalLineas ? "success" : "default"} />
          </div>

          {esEmpresaExterna && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--muted)", border: "1px solid var(--border)", color: "var(--info-subtle-foreground)", fontWeight: "var(--font-weight-semibold)", fontSize: 12 }}>
              Añadiendo a: <strong>Destino {Math.max(0, grupos.findIndex((g) => g._id === activeGrupo?._id)) + 1}</strong>
              {activeGrupo?.barrio ? ` · ${activeGrupo.barrio}` : ""}
            </div>
          )}

          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {productosDisponibles.length === 0 ? (
              <div style={{ color: "var(--muted-foreground)", fontWeight: "var(--font-weight-medium)" }}>
                No hay productos disponibles para esa búsqueda.
              </div>
            ) : (
              productosDisponibles.map((p) => {
                const formatoOptionsP = getFormatoOptions(getProductFormatoConfig(p));
                const total = formatoOptionsP.reduce(
                  (acc, t) => acc + Math.max(0, Number(stockByProductSize.get(lineKey(p.id, t)) || 0)),
                  0
                );

                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProductId(String(p.id))}
                    className={CARD_CLS}
                  >
                    <div style={{ fontWeight: "var(--font-weight-semibold)", fontSize: 18, color: "var(--foreground)" }}>
                      {getScientificProductDisplayName(p)}
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 12,
                        color: "var(--muted-foreground)",
                        fontWeight: "var(--font-weight-semibold)",
                        letterSpacing: 0.2,
                        textTransform: "uppercase",
                      }}
                    >
                      {(p.categoria || "—") + (p.subcategoria ? ` · ${p.subcategoria}` : "")}
                    </div>

                    <div
                      style={{
                        marginTop: 12,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "7px 10px",
                        borderRadius: "var(--radius-full)",
                        background: "var(--muted)",
                        color: "var(--foreground)",
                        fontWeight: "var(--font-weight-semibold)",
                        fontSize: 13,
                      }}
                    >
                      Stock total disponible: {total}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div
          style={{
            padding: 24,
            borderRight: "1px solid var(--border)",
            overflowY: "auto",
            overflowX: "hidden",
            minWidth: 0,
          }}
        >
          <div style={{ fontSize: 24, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>
            {selectedProduct ? getScientificProductDisplayName(selectedProduct) : "Selecciona un producto"}
          </div>

          <div style={{ marginTop: 6, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-medium)" }}>
            {selectedProduct
              ? "Añade solo lo que realmente esté disponible. El sistema valida stock en tiempo real."
              : "Cuando elijas un producto, aquí verás los tamaños y las unidades disponibles."}
          </div>

          {!selectedProduct ? (
            <div
              className={CARD_CLS}
            >
              Elige un producto del panel izquierdo para continuar.
            </div>
          ) : (
            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.1fr 0.8fr 0.9fr auto",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: "var(--radius-lg)",
                  background: "var(--muted)",
                  border: "1px solid var(--border)",
                  color: "var(--muted-foreground)",
                  fontWeight: "var(--font-weight-semibold)",
                  fontSize: 13,
                  textTransform: "uppercase",
                  letterSpacing: 0.3,
                }}
              >
                <div>Tamaño</div>
                <div className="text-center">Disponible</div>
                <div className="text-center">Añadir</div>
                <div className="text-center">Acción</div>
              </div>

              {selectedProductSizes.length === 0 ? (
                <div style={{ color: "var(--muted-foreground)", fontWeight: "var(--font-weight-medium)" }}>
                  Este producto no tiene stock por tamaño disponible.
                </div>
              ) : (
                selectedProductSizes.map((row) => {
                  const key = lineKey(selectedProduct.id, row.tamano);
                  const disabled = row.restante <= 0;
                  return (
                    <div
                      key={key}
                      className={CARD_CLS}
                    >
                      <div>
                        <div style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", fontSize: 18 }}>{row.tamano}</div>
                        <div style={{ marginTop: 4, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-medium)", fontSize: 12 }}>
                          En cesta: {formatCantidad(row.enCesta)} · Restante tras pedido: {formatCantidad(row.restante)}
                        </div>
                      </div>

                      <div
                        style={{
                          justifySelf: "center",
                          padding: "8px 12px",
                          borderRadius: "var(--radius-full)",
                          background: row.restante > 0 ? "var(--muted)" : "var(--muted)",
                          color: row.restante > 0 ? "var(--success-subtle-foreground)" : "var(--muted-foreground)",
                          fontWeight: "var(--font-weight-semibold)",
                          minWidth: 70,
                          textAlign: "center",
                        }}
                      >
                        {formatCantidad(row.restante)}
                      </div>

                      <div className="flex justify-center">
                        <input
                          type="number"
                          min={0}
                          max={row.restante}
                          step={selectedFormatoConfig?.allowDecimals ? "0.001" : "1"}
                          value={qtyInput[key] ?? ""}
                          onChange={(e) =>
                            setQtyInput((prev) => ({
                              ...prev,
                              [key]: clampNumber(e.target.value, 0, row.restante),
                            }))
                          }
                          placeholder={selectedFormatoConfig?.allowDecimals ? "0.00" : "0"}
                          style={{
                            width: 104,
                            padding: "10px 12px",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--border)",
                            textAlign: "center",
                            fontWeight: "var(--font-weight-semibold)",
                            color: "var(--foreground)",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>

                      <div className="flex justify-center">
                        <button
                          onClick={() => addToCart(selectedProduct.id, row.tamano)}
                          disabled={disabled}
                          style={{
                            padding: "10px 14px",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--border)",
                            background: disabled
                              ? "var(--muted)"
                              : "var(--muted)",
                            color: disabled ? "var(--muted-foreground)" : "var(--success-subtle-foreground)",
                            fontWeight: "var(--font-weight-semibold)",
                            cursor: disabled ? "not-allowed" : "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Añadir
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div
          style={{
            padding: 24,
            overflowY: "auto",
            overflowX: "hidden",
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            background:
              "var(--muted)",
          }}
        >
          <div style={{ fontSize: 24, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Resumen y destinos</div>
          <div style={{ marginTop: 6, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-medium)" }}>
            {esEmpresaExterna
              ? "Añade productos a un destino y, si lo necesitas, crea más destinos para el mismo pedido."
              : "Revisa la cesta y define el destino exacto del pedido."}
          </div>

          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <ModalStat label={esEmpresaExterna ? "Destinos" : "Líneas"} value={esEmpresaExterna ? grupos.length : totalLineas} />
            <ModalStat label="Unidades" value={totalItems} tone={totalItems ? "success" : "default"} />
            <ModalStat label="Estado" value={canSubmit ? "Listo" : "Pendiente"} tone={canSubmit ? "success" : "warn"} />
          </div>

          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            {grupos.map((g, idx) => {
              const lines = grupoLines(g);
              const isActive = g._id === activeGrupo?._id;
              const col = destinoColorAt(idx);
              const colapsado = !!gruposColapsados[g._id];
              const labelMini = { fontSize: 12, fontWeight: "var(--font-weight-semibold)", color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase" };
              return (
                <div
                  key={g._id}
                  className={CARD_CLS}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: colapsado ? 0 : 10 }}>
                    <div
                      onClick={() => toggleGrupoColapsado(g._id)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: "var(--radius-sm)", background: col.bg, color: col.fg, fontWeight: "var(--font-weight-semibold)", fontSize: 14, cursor: "pointer" }}
                      title={colapsado ? "Desplegar destino" : "Plegar destino"}
                    >
                      <span style={{ fontSize: 11 }}>{colapsado ? "▶" : "▼"}</span>
                      {esEmpresaExterna ? `Destino ${idx + 1}` : "Destino del pedido"}
                      <span style={{ opacity: 0.85, fontWeight: "var(--font-weight-semibold)", fontSize: 12 }}>
                        ({lines.length}{g.barrio ? ` · ${g.barrio}` : ""})
                      </span>
                    </div>
                    {esEmpresaExterna && (
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {isActive ? (
                          <span style={{ fontSize: 11, fontWeight: "var(--font-weight-semibold)", color: "var(--info-subtle-foreground)", background: "var(--primary-subtle)", padding: "4px 8px", borderRadius: "var(--radius-full)" }}>Añadiendo aquí</span>
                        ) : (
                          <button type="button" onClick={() => setActiveGrupoId(g._id)} style={{ border: "1px solid var(--border)", background: "var(--muted)", color: "var(--info-subtle-foreground)", fontWeight: "var(--font-weight-semibold)", fontSize: 11, padding: "4px 8px", borderRadius: "var(--radius-full)", cursor: "pointer" }}>Añadir aquí</button>
                        )}
                        {grupos.length > 1 && (
                          <button type="button" onClick={() => removeGrupo(g._id)} style={{ border: "none", background: "transparent", color: "var(--danger-subtle-foreground)", fontWeight: "var(--font-weight-semibold)", cursor: "pointer", fontSize: 12 }}>Quitar</button>
                        )}
                      </div>
                    )}
                  </div>

                  {!colapsado && (<>
                  <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                    {/*
                      Las etiquetas van asociadas con `htmlFor`/`id`. Eran
                      `div` con texto: visualmente parecen etiquetas, pero para
                      un lector de pantalla el control no tenía nombre. Los ids
                      llevan el `_id` del grupo porque hay un juego de campos
                      por destino.
                    */}
                    <div>
                      <label htmlFor={`destino-${g._id}-distrito`} style={labelMini}>Distrito</label>
                      <select id={`destino-${g._id}-distrito`} value={g.distrito} onChange={(e) => updateGrupo(g._id, "distrito", e.target.value)} className={INPUT_CLS}>
                        <option value="">Seleccionar distrito</option>
                        {DISTRITOS.map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`destino-${g._id}-barrio`} style={labelMini}>Barrio</label>
                      <select id={`destino-${g._id}-barrio`} value={g.barrio} onChange={(e) => updateGrupo(g._id, "barrio", e.target.value)} disabled={!g.distrito} className={cn(INPUT_CLS, !g.distrito && "opacity-65")}>
                        <option value="">{g.distrito ? "Seleccionar barrio" : "Primero el distrito"}</option>
                        {barriosDe(g.distrito).map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div style={{ gridColumn: "span 2" }}>
                      <label htmlFor={`destino-${g._id}-direccion`} style={labelMini}>Dirección</label>
                      <input id={`destino-${g._id}-direccion`} value={g.direccion} onChange={(e) => updateGrupo(g._id, "direccion", e.target.value)} placeholder="Escribe la dirección de destino" className={INPUT_CLS} />
                    </div>
                  </div>

                  <div className="mt-3">
                    <div style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", fontSize: 13, marginBottom: 6 }}>Productos ({lines.length})</div>
                    {lines.length === 0 ? (
                      <div style={{ color: "var(--muted-foreground)", fontWeight: "var(--font-weight-medium)", fontSize: 12 }}>
                        {esEmpresaExterna ? "Pulsa «Añadir aquí» y elige productos en el panel izquierdo." : "Añade productos desde el panel izquierdo."}
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: 8 }}>
                        {lines.map((line) => {
                          const prod = productos.find((p) => p.id === line.producto_id);
                          const allowDecimals = !!getProductFormatoConfig(prod)?.allowDecimals;
                          return (
                            <div key={line.key} style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 10px", borderRadius: "var(--radius-md)", background: "var(--muted)", border: "1px solid var(--border)" }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line.nombre}</div>
                                <div style={{ fontSize: 11, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-medium)" }}>Tamaño: {line.tamano}</div>
                              </div>
                              <input
                                type="number"
                                min={0}
                                step={allowDecimals ? "0.001" : "1"}
                                aria-label={`Cantidad de ${line.nombre}, tamaño ${line.tamano}`}
                                value={line.cantidad}
                                onChange={(e) => setGrupoLineQty(g._id, line.key, clampNumber(e.target.value, 0, Number.MAX_SAFE_INTEGER))}
                                style={{ width: 84, padding: "8px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", textAlign: "center", fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}
                              />
                              <button type="button" onClick={() => setGrupoLineQty(g._id, line.key, 0)} style={{ padding: "8px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--danger-subtle)", color: "var(--danger-subtle-foreground)", fontWeight: "var(--font-weight-semibold)", cursor: "pointer", fontSize: 12 }}>Quitar</button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  </>)}
                </div>
              );
            })}

            {esEmpresaExterna && (
              <button
                type="button"
                onClick={addGrupo}
                disabled={grupos.length >= MAX_DESTINOS}
                style={{
                  padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px dashed var(--primary-subtle)",
                  background: grupos.length >= MAX_DESTINOS ? "var(--muted)" : "var(--muted)",
                  color: grupos.length >= MAX_DESTINOS ? "var(--muted-foreground)" : "var(--primary)", fontWeight: "var(--font-weight-semibold)", fontSize: 13,
                  cursor: grupos.length >= MAX_DESTINOS ? "not-allowed" : "pointer",
                }}
              >
                {grupos.length >= MAX_DESTINOS ? `Máximo ${MAX_DESTINOS} destinos` : "+ Añadir otro destino"}
              </button>
            )}
          </div>

          <div className={CARD_CLS}>
            <div style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", fontSize: 14 }}>Comentarios / anotaciones</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-medium)" }}>
              Opcional. Lo verá quien aprueba y quien sirve el pedido, y aparecerá en el PDF impreso.
            </div>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej.: entregar en horario de mañana, avisar al llegar, plantas para reposición del parque…"
              maxLength={1000}
              style={{
                marginTop: 10, width: "100%", boxSizing: "border-box", minHeight: 70, resize: "vertical",
                padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)",
                outline: "none", fontWeight: "var(--font-weight-medium)", color: "var(--foreground)", background: "var(--card)", fontFamily: "inherit",
              }}
            />
          </div>

          {localError ? (
            <div
              className={CARD_CLS}
            >
              {localError}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cerrar
            </Button>

            <Button
              type="button"
              variant="primary"
              onClick={submitPedido}
              disabled={!canSubmit}
              loading={saving}
              className="ml-auto"
            >
              {saving ? "Creando…" : "Confirmar pedido"}
            </Button>
          </div>
        </div>
      </div>
      </DialogContent>
    </Dialog>
  );
}

/* =========================================
   LISTA DE PEDIDOS
   ========================================= */

// Per-item state badge for the items column in the Pedidos table.
// Renders only when the parent pedido is APROBADO_PARCIAL — in any other
// state every item shares the same status, so the badge would be
// redundant noise.
/*
 * Estado de UNA LÍNEA del pedido.
 *
 * Eran tres paletas escritas a mano con un emoji delante («✓ Aprobado»,
 * «✗ Denegado», «⏳ Pendiente»). El emoji lo leía el lector de pantalla como
 * parte de la etiqueta; el color era la única diferencia real entre los tres.
 * Ahora sale del mismo vocabulario que el estado del pedido.
 */
function ItemEstadoBadge({ estadoItem }) {
  const { status, label } = estadoPedido(estadoItem || "RESERVA");
  return <StatusBadge status={status} label={label} />;
}

function PedidoDetalleCellOld({
  pedido,
  mapProdName,
  expanded,
  toggleExpanded,
  editingId,
  editQty,
  setEditQty,
  editSearch,
  setEditSearch,
  productosDisponiblesParaEdicion,
}) {
  const items = editingId === pedido.id
    ? Object.entries(editQty).map(([key, cantidad]) => {
        const parsed = parseLineKey(key);
        return {
          producto_id: parsed.producto_id,
          tamano: parsed.tamano,
          cantidad: Number(cantidad),
        };
      })
    : safeArray(pedido.items);

  // Annotate per-item status whenever the items don't all share the same
  // state — the parent pedido's estado is the primary signal, but we also
  // compute it directly from items as a defensive fallback in case the
  // backend hasn't recomputed (or there's legacy data sitting in the wrong
  // state — e.g. an APROBADO pedido that secretly has a DENEGADO line).
  const itemStates = new Set(items.map((it) => String(it.estado_item || "RESERVA").toUpperCase()));
  const isPartial =
    estadoNormalizado(pedido?.estado) === "APROBADO_PARCIAL" ||
    itemStates.size > 1;

  // ¿El pedido reparte en varios destinos? Para mostrar el destino por línea.
  const _dstDeItem = (it) => [it.distrito_destino, it.barrio_destino, it.direccion_destino].filter(Boolean).join(" · ");
  const variosDestinos = new Set(items.map(_dstDeItem).filter(Boolean)).size > 1;

  if (editingId !== pedido.id) {
    // Show at most 3 items by default — including for APROBADO_PARCIAL.
    // The "+ ver N más" button expands the rest in-place.  For partial
    // pedidos with hidden denied/pending items we surface a small badge
    // in the toggle so the viewer notices there's masked state.
    const COLLAPSED_MAX = 3;
    const visibleItems = expanded ? items : items.slice(0, COLLAPSED_MAX);
    const hiddenCount = Math.max(0, items.length - visibleItems.length);
    // Count of "interesting" hidden items in partial mode (denied or
    // approved that the viewer otherwise might miss).
    const hiddenInteresting = expanded
      ? 0
      : items.slice(COLLAPSED_MAX).filter((it) => {
          if (!isPartial) return false;
          const e = String(it.estado_item || "RESERVA").toUpperCase();
          return e === "DENEGADO" || e === "APROBADO";
        }).length;

    return (
      <div>
        {items.length ? (
          <div className="flex flex-col gap-2">
            {visibleItems.map((it, idx) => {
              const pid = it.producto_id;
              const nombre =
                it.producto_nombre_cientifico ||
                it.nombre_cientifico ||
                mapProdName.get(pid) ||
                it.producto_nombre_natural ||
                it.nombre_natural ||
                it.nombre ||
                `ID ${pid}`;

              const estIt = String(it.estado_item || "RESERVA").toUpperCase();
              const isDenegado = isPartial && estIt === "DENEGADO";
              // In partial-approval mode, tint the row background by state
              // so the manager / proveedor can scan which lines are which.
              const rowBg = !isPartial
                ? "transparent"
                : estIt === "APROBADO"
                ? "var(--success-subtle)"
                : estIt === "DENEGADO"
                ? "var(--danger-subtle)"
                : "var(--warning-subtle)";
              const rowBorder = !isPartial
                ? "transparent"
                : estIt === "APROBADO"
                ? "var(--success-subtle)"
                : estIt === "DENEGADO"
                ? "var(--danger-subtle)"
                : "var(--warning-subtle)";

              return (
                <div
                  key={`${pedido.id}-${idx}`}
                  style={{
                    padding: isPartial ? "6px 8px" : "0",
                    borderRadius: isPartial ? "var(--radius-sm)" : 0,
                    background: rowBg,
                    borderLeft: isPartial ? `3px solid ${rowBorder}` : "none",
                  }}
                >
                  {/* Row 1: matches the header grid (1fr 90px 80px) so the
                      Producto / Tamaño / Cantidad columns line up perfectly
                      with the column headers above the table. */}
                  <div
                    style={{
                      display: "grid",
                      // Mantén estos valores en sync con la sub-grid del
                      // <th> de Producto.  Si cambias uno, cambia el otro.
                      gridTemplateColumns: "1fr 80px 70px",
                      gap: 8,
                      alignItems: "center",
                      opacity: isDenegado ? 0.55 : 1,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: "var(--font-weight-semibold)",
                        color: "var(--foreground)",
                        textDecoration: isDenegado ? "line-through" : "none",
                      }}
                    >
                      {nombre}
                    </div>
                    <div style={{ textAlign: "center", fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>
                      {it.tamano || "—"}
                    </div>
                    <div style={{ textAlign: "right", fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>
                      {formatCantidad(it.cantidad ?? 0) || "0"}
                    </div>
                  </div>
                  {variosDestinos && _dstDeItem(it) ? (
                    <div style={{ marginTop: 2, fontSize: 11, fontWeight: "var(--font-weight-semibold)", color: "var(--info-subtle-foreground)" }}>
                      📍 {_dstDeItem(it)}
                    </div>
                  ) : null}

                  {/* Row 2: small inline badge under the item — only in
                      partial-approval mode.  Does not consume horizontal
                      space, so the columns above stay aligned with the
                      table header. */}
                  {isPartial ? (
                    <div style={{ marginTop: 4 }}>
                      <ItemEstadoBadge estadoItem={it.estado_item} />
                    </div>
                  ) : null}
                </div>
              );
            })}

            {items.length > 3 ? (
              <button
                onClick={() => toggleExpanded(pedido.id)}
                style={{
                  alignSelf: "flex-start",
                  marginTop: 4,
                  padding: "6px 10px",
                  borderRadius: "var(--radius-full)",
                  border: `1px solid ${
                    hiddenInteresting > 0
                      ? "var(--danger-subtle)"
                      : "var(--muted)"
                  }`,
                  background: hiddenInteresting > 0 ? "var(--danger-subtle)" : "white",
                  color: "var(--foreground)",
                  fontWeight: "var(--font-weight-semibold)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
                title={
                  hiddenInteresting > 0
                    ? `Hay ${hiddenInteresting} líneas con decisión que están ocultas`
                    : undefined
                }
              >
                {hiddenInteresting > 0 && !expanded ? (
                  <span
                    // Punto indicador. `--radius-full` da el mismo círculo que
                    // el 50 % y sale de la escala, así que el guardarraíl no
                    // tiene que hacer una excepción.
                    className="inline-block size-[7px] rounded-[var(--radius-full)] bg-[var(--danger-subtle-foreground)]"
                  />
                ) : null}
                {expanded ? "Ver menos" : `+ ver ${hiddenCount} más`}
              </button>
            ) : null}
          </div>
        ) : (
          <span style={{ color: "var(--muted-foreground)", fontWeight: "var(--font-weight-medium)" }}>Sin detalle</span>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {Object.entries(editQty).map(([key, cantidad]) => {
          const parsed = parseLineKey(key);
          return (
            <div
              key={`${pedido.id}-${key}`}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 90px 90px",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>
                {mapProdName.get(parsed.producto_id) || `ID ${parsed.producto_id}`}
              </div>
              <div style={{ textAlign: "center", fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>
                {parsed.tamano}
              </div>
              {/*
                `aria-label` con el producto y el tamaño: sin él son varios
                campos numéricos idénticos que un lector de pantalla anuncia
                como «edición de texto» a secas, sin decir de qué línea son.
                Poner 0 elimina la línea, así que la descripción lo advierte.
              */}
              <input
                type="number"
                min={0}
                aria-label={`Cantidad de ${
                  mapProdName.get(parsed.producto_id) || `producto ${parsed.producto_id}`
                }, tamaño ${parsed.tamano}. Poner 0 elimina la línea.`}
                value={cantidad}
                onChange={(e) =>
                  setEditQty((prev) => ({
                    ...prev,
                    [key]: Number(e.target.value),
                  }))
                }
                style={{
                  padding: "8px 10px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border)",
                  textAlign: "center",
                  fontWeight: "var(--font-weight-semibold)",
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-3">
        <input
          type="text"
          placeholder="Buscar productos para añadir por nombre científico..."
          value={editSearch}
          onChange={(e) => setEditSearch(e.target.value)}
          className={INPUT_CLS}
        />

        <div
          style={{
            marginTop: 10,
            maxHeight: 180,
            overflow: "auto",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
          }}
        >
          {productosDisponiblesParaEdicion.length === 0 ? (
            <div style={{ padding: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-medium)" }}>
              No hay más productos que coincidan.
            </div>
          ) : (
            productosDisponiblesParaEdicion.flatMap((prod) =>
              getFormatoOptions(getProductFormatoConfig(prod)).map((tam) => {
                const key = lineKey(prod.id, tam);
                const disponible = Number(prod._stockBySize?.[tam] || 0);
                if (editQty[key] != null || disponible <= 0) return null;

                return (
                  <div
                    key={key}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 90px 90px auto",
                      gap: 10,
                      alignItems: "center",
                      padding: "10px 12px",
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    <div style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>
                      {getScientificProductDisplayName(prod)}
                    </div>
                    <div style={{ textAlign: "center", fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>
                      {tam}
                    </div>
                    <div style={{ textAlign: "center", fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>
                      {disponible}
                    </div>
                    <button
                      onClick={() =>
                        setEditQty((prev) => ({
                          ...prev,
                          [key]: 1,
                        }))
                      }
                      style={{
                        padding: "8px 10px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border)",
                        background: "var(--muted)",
                        color: "var(--success-subtle-foreground)",
                        fontWeight: "var(--font-weight-semibold)",
                        cursor: "pointer",
                      }}
                    >
                      Añadir
                    </button>
                  </div>
                );
              })
            )
          )}
        </div>
      </div>
    </>
  );
}

function ImprimirPedidosModal({ open, pedidos, mapProdName, onClose }) {
  const [seleccion, setSeleccion] = useState({}); // { [id]: true }
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) {
      setSeleccion({});
      setSearch("");
      setBusy(false);
      setErr("");
    }
  }, [open]);

  const lista = useMemo(() => {
    const t = search.trim().toLowerCase();
    const arr = Array.isArray(pedidos) ? [...pedidos] : [];
    arr.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    if (!t) return arr;
    return arr.filter((p) => {
      const sol = String(p.solicitante_username || p.solicitante || p.created_by || "").toLowerCase();
      const est = String(p.estado || "").toLowerCase();
      const tipo = String(p.tipo || "salida").toLowerCase();
      const destino = [p.distrito_destino, p.barrio_destino, p.direccion_destino].filter(Boolean).join(" ").toLowerCase();
      const detalle = (Array.isArray(p.items) ? p.items : [])
        .map((it) => `${it.producto_nombre_cientifico || it.producto_nombre || ""} ${it.tamano || ""}`.toLowerCase())
        .join(" ");
      return (
        String(p.id).includes(t) ||
        sol.includes(t) ||
        est.includes(t) ||
        tipo.includes(t) ||
        destino.includes(t) ||
        detalle.includes(t)
      );
    });
  }, [pedidos, search]);

  const seleccionados = useMemo(
    () => lista.filter((p) => seleccion[p.id]),
    [lista, seleccion]
  );

  const toggleOne = (id) =>
    setSeleccion((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });

  const marcarTodosVisibles = () => {
    setSeleccion((prev) => {
      const next = { ...prev };
      lista.forEach((p) => {
        next[p.id] = true;
      });
      return next;
    });
  };

  const limpiar = () => setSeleccion({});

  const handleGuardar = async () => {
    if (!seleccionados.length) {
      setErr("Selecciona al menos un pedido.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await guardarPedidosPdf(seleccionados, mapProdName);
    } catch (e) {
      setErr(e?.message || "Error generando PDF.");
    } finally {
      setBusy(false);
    }
  };

  const handleImprimir = async () => {
    if (!seleccionados.length) {
      setErr("Selecciona al menos un pedido.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await imprimirPedidosEnNavegador(seleccionados, mapProdName);
    } catch (e) {
      setErr(e?.message || "Error imprimiendo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    /*
     * Igual que el modal de nuevo pedido: `Dialog` del sistema. El `onClick` en
     * el fondo que había aquí cerraba el diálogo también al soltar una
     * selección de texto iniciada dentro.
     */
    <Dialog open={open} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent
        title="Imprimir pedido"
        description="Elige uno o varios pedidos y genera el comprobante."
        closeLabel="Cerrar"
        size="lg"
        className="max-w-[min(1100px,96vw)]"
      >
      <div className="flex flex-col">
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            position: "sticky",
            top: 0,
            background: "white",
            zIndex: 2,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
          }}
        >
          <div>
            <div style={{ fontSize: 24, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>Imprimir pedido</div>
            <div style={{ marginTop: 4, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-medium)", fontSize: 14 }}>
              Selecciona uno o varios pedidos. Podrás elegir impresora o guardar como PDF.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: "8px 14px",
              borderRadius: "var(--radius-md)",
              fontWeight: "var(--font-weight-semibold)",
              cursor: "pointer",
              background: "var(--warning-subtle-foreground)",
              color: "var(--foreground)",
              border: "1px solid var(--border)",
            }}
          >
            Cerrar
          </button>
        </div>

        <div
          style={{
            padding: "14px 22px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por ID, solicitante, estado, destino..."
            style={{
              flex: 1,
              minWidth: 240,
              padding: "10px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              fontWeight: "var(--font-weight-medium)",
            }}
          />
          <button
            onClick={marcarTodosVisibles}
            style={{
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              background: "white",
              fontWeight: "var(--font-weight-semibold)",
              cursor: "pointer",
            }}
          >
            Seleccionar todos
          </button>
          <button
            onClick={limpiar}
            style={{
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              background: "white",
              fontWeight: "var(--font-weight-semibold)",
              cursor: "pointer",
            }}
          >
            Limpiar
          </button>
          <span style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", marginLeft: "auto" }}>
            Seleccionados: {seleccionados.length}
          </span>
        </div>

        {err ? (
          <div
            style={{
              margin: "12px 22px 0",
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              background: "var(--danger-subtle)",
              border: "1px solid var(--border)",
              color: "var(--danger-subtle-foreground)",
              fontWeight: "var(--font-weight-semibold)",
            }}
          >
            {err}
          </div>
        ) : null}

        <div style={{ padding: 22 }}>
          {lista.length === 0 ? (
            <div style={{ color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)", padding: 20 }}>
              No hay pedidos que coincidan.
            </div>
          ) : (
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "36px 80px 110px 110px 1fr 160px 120px",
                  gap: 8,
                  padding: "10px 12px",
                  background: "var(--muted)",
                  fontWeight: "var(--font-weight-semibold)",
                  fontSize: 12,
                  color: "var(--foreground)",
                  textTransform: "uppercase",
                }}
              >
                <div></div>
                <div>ID</div>
                <div>Tipo</div>
                <div>Fecha</div>
                <div>Solicitante / Destino</div>
                <div>Estado</div>
                <div>Caduca</div>
              </div>
              {lista.map((p) => {
                const checked = !!seleccion[p.id];
                // Si el pedido reparte en varios destinos distintos, lo indicamos
                // en vez de mostrar solo el primero.
                const _destinosPedido = new Set(
                  safeArray(p.items)
                    .map((it) => [it.distrito_destino, it.barrio_destino, it.direccion_destino].filter(Boolean).join(" · "))
                    .filter(Boolean)
                );
                const destino =
                  p.tipo === "reposicion"
                    ? "Vivero"
                    : _destinosPedido.size > 1
                    ? `Múltiples destinos (${_destinosPedido.size})`
                    : [p.distrito_destino, p.barrio_destino, p.direccion_destino]
                        .filter(Boolean)
                        .join(" · ") || "—";
                const solicitante =
                  formatUsername(
                    p.solicitante_username || p.solicitante || p.created_by || ""
                  ) || "—";
                return (
                  <label
                    key={p.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "36px 80px 110px 110px 1fr 160px 120px",
                      gap: 8,
                      padding: "10px 12px",
                      borderTop: "1px solid var(--border)",
                      alignItems: "center",
                      background: checked ? "var(--info-subtle)" : "white",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOne(p.id)}
                      style={{ width: 18, height: 18, cursor: "pointer" }}
                    />
                    <div className="font-[var(--font-weight-medium)]">#{p.id}</div>
                    <div style={{ fontWeight: "var(--font-weight-semibold)", color: p.tipo === "reposicion" ? "var(--warning-subtle-foreground)" : "var(--info-subtle-foreground)" }}>
                      {p.tipo === "reposicion" ? "Reposición" : "Salida"}
                    </div>
                    <div>{fmtFechaES(p.created_at)}</div>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <div className="font-[var(--font-weight-medium)]">{solicitante}</div>
                      <div style={{ color: "var(--muted-foreground)", fontSize: 12 }}>{destino}</div>
                    </div>
                    <div className="font-[var(--font-weight-medium)]">{p.estado || "—"}</div>
                    <div style={{ color: "var(--danger-subtle-foreground)", fontWeight: "var(--font-weight-semibold)" }}>
                      {/* La caducidad no aplica a pedidos ya cerrados (servidos,
                          denegados, cancelados o caducados). */}
                      {(() => {
                        const e = String(p.estado || "").toUpperCase();
                        const cerrado = ["SERVIDO", "DENEGADO", "CANCELADO", "CADUCADO"].includes(e);
                        return !cerrado && p.fecha_caducidad ? fmtFechaES(p.fecha_caducidad) : "—";
                      })()}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div
          style={{
            padding: "14px 22px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            flexWrap: "wrap",
            position: "sticky",
            bottom: 0,
            background: "white",
            borderBottomLeftRadius: 22,
            borderBottomRightRadius: 22,
          }}
        >
          <button
            onClick={handleGuardar}
            disabled={busy || seleccionados.length === 0}
            style={{
              padding: "12px 18px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              background: busy || seleccionados.length === 0 ? "var(--muted)" : "white",
              color: "var(--foreground)",
              fontWeight: "var(--font-weight-semibold)",
              cursor: busy || seleccionados.length === 0 ? "not-allowed" : "pointer",
            }}
            title="Descargar como PDF"
          >
            {busy ? "Generando..." : "Descargar PDF"}
          </button>
          <button
            onClick={handleImprimir}
            disabled={busy || seleccionados.length === 0}
            style={{
              padding: "12px 18px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              background:
                busy || seleccionados.length === 0
                  ? "var(--muted)"
                  : "var(--primary)",
              color: "var(--card)",
              fontWeight: "var(--font-weight-semibold)",
              cursor: busy || seleccionados.length === 0 ? "not-allowed" : "pointer",
            }}
            title="Abrir diálogo de impresión (imprimir o guardar como PDF)"
          >
            {busy ? "Preparando…" : `Imprimir${seleccionados.length > 1 ? ` ${seleccionados.length}` : ""}`}
          </button>
        </div>
      </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Pedidos() {
  const { me } = useOutletContext();

  const [productos, setProductos] = useState([]);
  // Sólo se escribe: los movimientos se cargan para que un 403 de ese
  // endpoint no aborte la carga de pedidos, pero esta pantalla no los lista.
  const [, setMovimientos] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingNewPedido, setSavingNewPedido] = useState(false);

  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("success");
  const msgTimerRef = useRef(null);

  const [estadoFiltro, setEstadoFiltro] = useState("TODOS");
  const [idFiltro, setIdFiltro] = useState("");
  const [fechaFiltro, setFechaFiltro] = useState("");
  const [solicitanteFiltro, setSolicitanteFiltro] = useState("");
  const [textoFiltro, setTextoFiltro] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editQty, setEditQty] = useState({});
  const [editSearch, setEditSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [imprimirOpen, setImprimirOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});

  // Confirmación de acciones destructivas. Devuelve una promesa: ver `onCancelar`.
  const { confirmar, dialogo: dialogoConfirmacion } = useConfirm();

  const role = rolEfectivo(me);  // superadmin/admin_vivero cuentan como admin
  // Proveedor es estrictamente de lectura: no edita ni cancela ni crea.
  const isProveedor = role === "proveedor";
  const isReadOnly = role === "tecnico" || role === "gestor_vivero" || isProveedor;

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

  /*
   * Carga ÚNICA al montar. `refrescar` se redefine en cada render, así que nombrarla
   * como dependencia volvería a pedir los datos en bucle. Envolverla en
   * `useCallback` sólo trasladaría el problema: sus propias dependencias cambian
   * con el estado que la propia carga escribe.
   *
   * El refresco posterior no depende de este efecto: lo disparan las acciones
   * del usuario y el evento `vivero:data-changed`.
   */
  useEffect(() => {
    refrescar();
    return () => clearMsgTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga única al montar; incluirla provocaría un bucle de peticiones
  }, []);

  /*
   * Todo lo que sigue delega en `pedidos.logic.js`. La lógica ya no vive aquí:
   * está extraída y comparada contra main en `pedidos.equivalence.test.js`
   * sobre 8 400 combinaciones de rol, usuario y estado.
   */
  const solicitanteFromPedido = solicitanteFromPedidoLogica;

  const solicitantesDisponibles = useMemo(
    () => solicitantesDisponiblesLogica(pedidos),
    [pedidos]
  );

  const refrescar = async () => {
    setLoading(true);
    clearMsgTimer();
    setMsg("");

    try {
      // El rol 'proveedor' es de SOLO consulta y no tiene permiso sobre
      // /productos ni /movimientos (devolverían 403). Para ese rol solo
      // pedimos /pedidos; el resto de roles pide los tres en paralelo.
      // Usamos Promise.allSettled para que un fallo aislado en productos
      // o movimientos no aborte la carga de pedidos (antes Promise.all
      // hacía que un 403 vaciara toda la lista).
      if (isProveedor) {
        const peds = await getPedidos();
        setProductos([]);
        setMovimientos([]);
        setPedidos(safeArray(peds));
      } else {
        const [prodsRes, movsRes, pedsRes] = await Promise.allSettled([
          getProductos(),
          getMovimientos(),
          getPedidos(),
        ]);
        if (prodsRes.status === "fulfilled") setProductos(safeArray(prodsRes.value));
        if (movsRes.status === "fulfilled") setMovimientos(safeArray(movsRes.value));
        if (pedsRes.status === "fulfilled") {
          setPedidos(safeArray(pedsRes.value));
        } else {
          // Si lo único que ha fallado es /pedidos sí avisamos al usuario.
          const e = pedsRes.reason;
          showTimedMessage(
            e?.response?.data?.detail || e?.message || "Error cargando pedidos",
            "error"
          );
        }
      }
    } catch (e) {
      showTimedMessage(
        e?.response?.data?.detail || e?.message || "Error cargando pedidos",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  // Para crear pedidos usamos el stock DISPONIBLE que da el backend
  // (= stock real − reservado por otros pedidos vivos), no el derivado de
  // movimientos. Así la interfaz coincide con la validación del servidor y no
  // deja pedir lo que ya está comprometido en otro pedido.
  const stockByProductSize = useMemo(() => {
    const m = new Map();
    for (const p of (Array.isArray(productos) ? productos : [])) {
      const disp = p?.disponible_by_size || p?.stock_by_size || {};
      for (const [tam, qty] of Object.entries(disp)) {
        m.set(lineKey(p.id, tam), Math.max(0, Number(qty || 0)));
      }
    }
    return m;
  }, [productos]);

  const productosConStock = useMemo(() => {
    return productos
      .map((p) => {
        // Opciones válidas por categoría del producto.
        const formatoOptions = getFormatoOptions(getProductFormatoConfig(p));
        const stockBySize = {};
        formatoOptions.forEach((t) => {
          stockBySize[t] = Math.max(0, Number(stockByProductSize.get(lineKey(p.id, t)) || 0));
        });
        return { ...p, _stockBySize: stockBySize, _formatoOptions: formatoOptions };
      })
      .filter((p) => (p._formatoOptions || []).some((t) => Number(p._stockBySize[t] || 0) > 0));
  }, [productos, stockByProductSize]);

  const mapProdName = useMemo(() => {
    const m = new Map();
    for (const p of productos) {
      m.set(p.id, getScientificProductDisplayName(p));
    }
    return m;
  }, [productos]);

  const handleCreatePedidoFromModal = async (payload) => {
    setSavingNewPedido(true);

    try {
      const created = await createPedido(payload);
      setModalOpen(false);
      // El pedido recién creado entra en RESERVA. Si había un filtro de estado
      // activo (p.ej. "Aprobado"), el nuevo pedido no se vería. Reseteamos a
      // "Todos" para que siempre aparezca tras crearlo.
      setEstadoFiltro("TODOS");
      await refrescar();
      // If the backend surfaced any email-delivery warnings (e.g. a
      // manager without email registered), show them as a soft notice
      // RIGHT AFTER the success message so the user knows what didn't go
      // through, without making the create flow look like it failed.
      const warns = Array.isArray(created?.email_warnings) ? created.email_warnings : [];
      if (warns.length) {
        showTimedMessage(
          `Pedido creado. Aviso: ${warns.join(" · ")}`,
          "warning"
        );
      } else {
        showTimedMessage("Pedido creado correctamente.", "success");
      }
    } catch (e) {
      showTimedMessage(
        e?.response?.data?.detail || e?.message || "Error creando pedido",
        "error"
      );
    } finally {
      setSavingNewPedido(false);
    }
  };

  const puedeEditarCancelar = (p) => puedeEditarCancelarLogica(p, { role, username: me?.username });

  /**
   * Cancelar un pedido.
   *
   * DEFECTO PREVIO CORREGIDO: se ejecutaba SIN confirmación ninguna. Un clic
   * accidental en «Cancelar» —que está junto a «Editar» en la misma celda—
   * cancelaba el pedido y no hay forma de deshacerlo desde la interfaz.
   *
   * Se usa el `useConfirm` de la Fase 2, que devuelve una promesa: el flujo se
   * detiene de verdad hasta que el usuario decide, en vez de invertir el
   * control como hacía `window.confirm`. El diálogo identifica el pedido por su
   * número y su solicitante, para que se vea CUÁL se está cancelando.
   */
  const onCancelar = async (p) => {
    const ok = await confirmar({
      title: `¿Cancelar el pedido #${p.id}?`,
      description: `Solicitado por ${solicitanteFromPedido(p)}. La cancelación no se puede deshacer desde aquí.`,
      confirmLabel: "Cancelar el pedido",
      cancelLabel: "Volver",
      destructive: true,
    });
    if (!ok) return;

    try {
      await cancelarPedido(p.id);
      await refrescar();
      showTimedMessage("Pedido cancelado.", "success");
    } catch (e) {
      showTimedMessage(
        e?.response?.data?.detail || e?.message || "Error cancelando pedido",
        "error"
      );
    }
  };

  const startEdit = (p) => {
    setEditQty(construirEdicion(p));
    setEditingId(p.id);
    setEditSearch("");
  };

  const stopEdit = () => {
    setEditingId(null);
    setEditQty({});
    setEditSearch("");
  };

  const onGuardarEdicion = async (pedidoId) => {
    try {
      const pedidoOriginal = pedidos.find((p) => p.id === pedidoId);

      // Una cantidad a 0 ELIMINA la línea: es como se quita un producto de un
      // pedido, porque no hay botón de borrar. Ver `construirItemsEdicion`.
      const items = construirItemsEdicion(editQty);

      await updatePedido(pedidoId, {
        items,
        distrito_destino: pedidoOriginal?.distrito_destino || null,
        barrio_destino: pedidoOriginal?.barrio_destino || null,
        direccion_destino: pedidoOriginal?.direccion_destino || null,
      });

      stopEdit();
      await refrescar();
      showTimedMessage("Pedido actualizado correctamente.", "success");
    } catch (e) {
      showTimedMessage(
        e?.response?.data?.detail || e?.message || "Error actualizando pedido",
        "error"
      );
    }
  };

  const productosDisponiblesParaEdicion = useMemo(() => {
    const texto = editSearch.trim().toLowerCase();
    return productosConStock.filter((p) => {
      const nombreCientifico = String(p?.nombre_cientifico || p?.producto_nombre_cientifico || "").toLowerCase();
      const categoria = String(p?.categoria || "").toLowerCase();
      const subcategoria = String(p?.subcategoria || "").toLowerCase();
      return !texto || nombreCientifico.includes(texto) || categoria.includes(texto) || subcategoria.includes(texto);
    });
  }, [productosConStock, editSearch]);

  const pedidosFiltrados = useMemo(
    () =>
      filtrarPedidos(pedidos, {
        role,
        username: me?.username,
        mapProdName,
        filtros: {
          estado: estadoFiltro,
          id: idFiltro,
          fecha: fechaFiltro,
          solicitante: solicitanteFiltro,
          texto: textoFiltro,
        },
      }),
    [pedidos, role, me?.username, mapProdName, estadoFiltro, idFiltro, fechaFiltro, solicitanteFiltro, textoFiltro]
  );

  const toggleExpanded = (pedidoId) => {
    setExpandedRows((prev) => ({
      ...prev,
      [pedidoId]: !prev[pedidoId],
    }));
  };

  const clearFilters = () => {
    setEstadoFiltro("TODOS");
    setIdFiltro("");
    setFechaFiltro("");
    setSolicitanteFiltro("");
    setTextoFiltro("");
  };

  /** «Limpiar» solo aparece si hay algo que limpiar. */
  const hayFiltros =
    estadoFiltro !== "TODOS" || !!idFiltro || !!fechaFiltro || !!solicitanteFiltro || !!textoFiltro;

  return (
    <div className="w-full">
      <PageHeader
        title={isProveedor ? "Pedidos de reposición" : "Pedidos"}
        description={
          isProveedor
            ? "Listado de pedidos de reposición aprobados. Descarga o imprime el PDF para servir cada pedido."
            : "Crea y gestiona pedidos con control de stock y destino final."
        }
        /*
          Los botones van sueltos dentro de un contenedor con el máximo anclado
          al viewport. `PageHeader` mete las acciones en un contenedor
          `shrink-0`, cuyo ancho se resuelve por el contenido: sin ese tope, a
          320 px la acción principal queda cortada por el borde. Es el mismo
          hallazgo de la Fase 4A.
        */
        actions={
          <div className="flex max-w-[calc(100vw-2rem)] flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setImprimirOpen(true)}
              title="Imprimir uno o varios pedidos"
            >
              Imprimir pedido
            </Button>
            {!isReadOnly && (
              <Button type="button" variant="primary" onClick={() => setModalOpen(true)}>
                Nuevo pedido
              </Button>
            )}
          </div>
        }
      />

      <MessageBanner
        msg={msg}
        msgType={msgType}
        onClose={() => {
          clearMsgTimer();
          setMsg("");
        }}
      />

      <div
        className={CARD_CLS}
      >
        <div style={{ fontSize: 18, fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", marginBottom: 14 }}>
          Lista de pedidos
        </div>

        {/*
          Antes: una rejilla de SEIS columnas fijas (140/170/180/170/1fr/auto)
          con los rótulos metidos en el `placeholder`. Dos problemas: por debajo
          de ~1 100 px obligaba a desplazarse en horizontal, y un placeholder
          desaparece al escribir — quien vuelve a un filtro ya relleno no sabe
          qué era. `FilterBar` reflowa sola y cada campo lleva etiqueta visible.
        */}
        <FilterBar
          label="Filtros de pedidos"
          minColumn="180px"
          actions={
            hayFiltros ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            ) : null
          }
        >
          <SearchField
            label="Número de pedido"
            hideLabel={false}
            value={idFiltro}
            onChange={setIdFiltro}
            placeholder="p. ej. 42"
          />

          <SelectField
            label="Estado"
            value={estadoFiltro === "TODOS" ? "" : estadoFiltro}
            onChange={(v) => setEstadoFiltro(v || "TODOS")}
            options={ESTADO_FILTERS.filter((f) => f.value !== "TODOS")}
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="ped-filtro-fecha" className="text-body-sm font-[var(--font-weight-medium)]">
              Fecha de creación
            </label>
            <input
              id="ped-filtro-fecha"
              type="date"
              value={fechaFiltro}
              onChange={(e) => setFechaFiltro(e.target.value)}
              className={INPUT_CLS}
            />
          </div>

          <SelectField
            label="Solicitante"
            value={solicitanteFiltro}
            onChange={setSolicitanteFiltro}
            allLabel={solicitantesDisponibles.length === 0 ? null : "Todos"}
            placeholder={solicitantesDisponibles.length === 0 ? "No hay solicitantes" : undefined}
            options={solicitantesDisponibles}
          />

          <SearchField
            label="Buscar"
            hideLabel={false}
            value={textoFiltro}
            onChange={setTextoFiltro}
            placeholder="Producto, destino o estado"
          />
        </FilterBar>

        {loading ? (
          <div style={{ color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>Cargando…</div>
        ) : pedidosFiltrados.length === 0 ? (
          <div style={{ color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>No hay pedidos para los filtros seleccionados.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 10px", minWidth: 1180 }}>
              <thead>
                <tr style={{ background: "var(--muted)" }}>
                  <th scope="col" className={TH}>ID</th>
                  <th scope="col" className={TH}>Tipo</th>
                  <th scope="col" className={TH}>Pedido</th>
                  <th scope="col" className={TH}>Caduca</th>
                  <th scope="col" className={TH}>Solicitante</th>
                  <th scope="col" className={TH}>Destino</th>
                  <th scope="col" className={cn(TH, "min-w-[320px]")}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 80px 70px",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <div>Producto</div>
                      <div className="text-center">Tamaño</div>
                      <div className="text-right">Cantidad</div>
                    </div>
                  </th>
                  <th scope="col" className={TH}>Estado</th>
                  <th scope="col" className={TH}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pedidosFiltrados.map((p) => {
                  const estado = p.estado || "RESERVA";
                  const canEditCancel = puedeEditarCancelar(p);
                  const expanded = !!expandedRows[p.id];

                  return (
                    <tr
                      key={p.id}
                      style={{
                        background: "white",
                        boxShadow: "var(--shadow-md)",
                      }}
                    >
                      <td
                        className={TD}
                      >
                        #{p.id}
                      </td>

                      <td className={TD}>
                        <span
                          style={{
                            display: "inline-flex",
                            padding: "4px 10px",
                            borderRadius: "var(--radius-full)",
                            fontSize: 12,
                            fontWeight: "var(--font-weight-semibold)",
                            background: (p.tipo === "reposicion") ? "var(--warning-subtle)" : "var(--info-subtle)",
                            color: (p.tipo === "reposicion") ? "var(--warning-subtle-foreground)" : "var(--info-subtle-foreground)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          {p.tipo === "reposicion" ? "Reposición" : "Salida"}
                        </span>
                      </td>

                      <td className={TD}>
                        {fmtFechaES(p.created_at)}
                      </td>

                      <td
                        className={TD}
                      >
                        {(() => {
                          // La caducidad no aplica a pedidos cerrados (servido,
                          // denegado, cancelado o caducado).
                          const e = String(p.estado || "").toUpperCase();
                          const cerrado = ["SERVIDO", "DENEGADO", "CANCELADO", "CADUCADO"].includes(e);
                          const fc = cerrado ? null : getPedidoFechaCaducidad(p);
                          return fc ? fmtFechaES(fc) : <span style={{ color: "var(--muted-foreground)", fontWeight: "var(--font-weight-medium)" }}>—</span>;
                        })()}
                      </td>

                      <td className={TD}>
                        {solicitanteFromPedido(p)}
                      </td>

                      <td
                        className={TD}
                      >
                        {p?.tipo === "reposicion" ? (
                          <span style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--success-subtle-foreground)" }}>Vivero</span>
                        ) : (() => {
                          // Si el pedido reparte en varios destinos distintos
                          // (según sus líneas), lo indicamos en vez del primero.
                          const dset = new Set(
                            safeArray(p?.items)
                              .map((it) => [it.distrito_destino, it.barrio_destino, it.direccion_destino].filter(Boolean).join(" · "))
                              .filter(Boolean)
                          );
                          return dset.size > 1 ? (
                            <span style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--info-subtle-foreground)" }}>Múltiples destinos ({dset.size})</span>
                          ) : (
                            <DestinoResumen
                              distrito={p?.distrito_destino}
                              barrio={p?.barrio_destino}
                              direccion={p?.direccion_destino}
                            />
                          );
                        })()}
                      </td>

                      <td
                        className={TD}
                      >
                        <PedidoDetalleCellOld
                          pedido={p}
                          mapProdName={mapProdName}
                          expanded={expanded}
                          toggleExpanded={toggleExpanded}
                          editingId={editingId}
                          editQty={editQty}
                          setEditQty={setEditQty}
                          editSearch={editSearch}
                          setEditSearch={setEditSearch}
                          productosDisponiblesParaEdicion={productosDisponiblesParaEdicion}
                        />
                      </td>

                      <td className={cn(TD, "whitespace-nowrap")}>
                        {/*
                          El estado sale del vocabulario compartido, no de una
                          escalera de colores escrita a mano. Además del color,
                          `StatusBadge` lleva TEXTO: antes el tono era el único
                          canal para distinguir «denegado» de «cancelado».
                        */}
                        {(() => {
                          const { status } = estadoPedido(estado);
                          return <StatusBadge status={status} label={estadoLabel(estado)} />;
                        })()}
                      </td>

                      <td
                        className={TD}
                      >
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {canEditCancel && editingId !== p.id ? (
                            <>
                              {!isReadOnly && (
                                <Button type="button" variant="secondary" size="sm" onClick={() => startEdit(p)}>
                                  Editar
                                </Button>
                              )}
                              {!isReadOnly && (
                                <Button type="button" variant="destructive" size="sm" onClick={() => onCancelar(p)}>
                                  Cancelar
                                </Button>
                              )}
                            </>
                          ) : null}

                          {canEditCancel && editingId === p.id ? (
                            <>
                              <Button type="button" variant="primary" size="sm" onClick={() => onGuardarEdicion(p.id)}>
                                Guardar
                              </Button>
                              <Button type="button" variant="secondary" size="sm" onClick={stopEdit}>
                                Cerrar
                              </Button>
                            </>
                          ) : null}

                          {/* Descarga del PDF "oficial" del pedido.  Disponible
                              en cualquier estado decidido (APROBADO, APROBADO_PARCIAL,
                              SERVIDO o DENEGADO) — incluso para los denegados,
                              porque el PDF lleva motivo de denegación + detalle
                              de líneas y sirve como registro de auditoría. */}
                          {(() => {
                            const e = estadoNormalizado(estado);
                            const puedePdf =
                              e === "APROBADO" ||
                              e === "APROBADO_PARCIAL" ||
                              e === "SERVIDO" ||
                              e === "DENEGADO";
                            if (!puedePdf) return null;
                            return (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await descargarPedidoPdf(p.id);
                                  } catch (err) {
                                    showTimedMessage(
                                      err?.response?.data?.detail || err?.message || "No se pudo descargar el PDF",
                                      "error"
                                    );
                                  }
                                }}
                                title="Descargar PDF del pedido aprobado"
                                style={{
                                  padding: "8px 12px",
                                  borderRadius: "var(--radius-md)",
                                  border: "1px solid var(--border)",
                                  background: "var(--muted)",
                                  color: "var(--success-subtle-foreground)",
                                  fontWeight: "var(--font-weight-semibold)",
                                  cursor: "pointer",
                                  fontSize: 13,
                                }}
                              >
                                📄 PDF
                              </button>
                            );
                          })()}

                          {(() => {
                            // Show the "—" placeholder ONLY when there are
                            // truly no actions to render: can't edit/cancel
                            // and no PDF available either.  PDF is now available
                            // in any decided state (including DENEGADO).
                            const e = estadoNormalizado(estado);
                            const hasPdf =
                              e === "APROBADO" ||
                              e === "APROBADO_PARCIAL" ||
                              e === "SERVIDO" ||
                              e === "DENEGADO";
                            if (canEditCancel || hasPdf) return null;
                            return <span style={{ color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)" }}>—</span>;
                          })()}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* `key`: abrir el modal monta una instancia nueva y su estado arranca
          limpio, sin un efecto que reinicie campo por campo. */}
      <PedidoModal
        key={modalOpen ? "pedido-abierto" : "pedido-cerrado"}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        productos={productos}
        stockByProductSize={stockByProductSize}
        onSubmit={handleCreatePedidoFromModal}
        saving={savingNewPedido}
        esEmpresaExterna={role === "empresa_externa"}
      />

      <ImprimirPedidosModal
        open={imprimirOpen}
        pedidos={pedidos}
        mapProdName={mapProdName}
        onClose={() => setImprimirOpen(false)}
      />

      {dialogoConfirmacion}
    </div>
  );
}