import { useEffect, useMemo, useRef, useState } from "react";
import { Package, PackageOpen, Repeat, Undo2, ChevronRight, ChevronDown } from "lucide-react";

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Input,
  StatusBadge,
  Textarea,
  cn,
} from "../../ui";
import { Alert } from "../../components/ui/feedback";
import SearchField from "../../components/ui/SearchField";
import SelectField from "../../components/ui/SelectField";
import VerPlanta from "../../components/VerPlanta";

import { getProductFormatoConfig, getFormatoOptions, tamanoDisponiblePlanta } from "../../utils/formato";
import { getZonaLabel } from "../../utils/zonas";
import { datetimeLocalToUtcIso } from "../../utils/fecha";

import {
  DEFAULT_ZONAS,
  DISTRITO_BARRIOS,
  ENTRADA_ORIGENES,
  ENTRADA_ORIGEN_OTROS,
  SALIDA_DESTINOS,
  getZonasPermitidasParaCategoria,
} from "../movimientos.constants";
import {
  DESTINOS_EXTERNOS,
  buildStockByProductZoneSize,
  buildStockKey,
  defaultFechaLocal,
  getDestinoOptions,
  getFormErrors,
  getMovimientoTipo,
  getProductDisplayName,
  getTipoDisplayLabel,
  isExternalDestination,
  normalizeTamanoForStock,
  safeArray,
} from "../movimientos.logic";

import PedidoSelectorModal from "./PedidoSelectorModal";
import PrestamoSelectorModal from "./PrestamoSelectorModal";

/*
 * ASISTENTE DE MOVIMIENTO — servir pedido y devoluciones.
 *
 * Tres pasos: tipo → producto y cantidad → destino y confirmación.
 *
 * TODA la lógica es idéntica a `Movimientos.jsx@693d45c`: los quince estados,
 * los efectos de saneamiento en cascada, el cálculo de existencias por zona y
 * tamaño, el reparto de una línea de pedido entre varias zonas, la validación
 * por paso y la construcción de los payloads. Lo comprueban las pruebas de
 * equivalencia de `movimientos.logic.js` y las de comportamiento de esta
 * pantalla.
 *
 * CÓDIGO MUERTO RETIRADO. `main` definía `usarLineaPedido()` y el estado
 * `selectedPedidoLineKey`, pero la primera no se llamaba desde ningún sitio y
 * el segundo solo se escribía, nunca se leía. Ninguno de los dos tenía efecto.
 *
 * Lo que cambia es la presentación:
 *   - `Dialog` del sistema en lugar de dos `div` fijos anidados sin trampa de
 *     foco, sin Escape y sin devolver el foco.
 *   - Los emojis como iconografía (📦 📤 🔄 ↩️ 📋 📍 🎯 🗺️ 🕒 ▶ ▼) pasan a
 *     iconos con `aria-hidden`: un lector de pantalla leía «paquete» en medio
 *     de una etiqueta.
 *   - Los degradados por tipo y los nueve colores de destino desaparecen. El
 *     tipo se comunica con el sistema de estados, que lleva texto.
 *   - Las listas de `div` con `onClick` pasan a botones: antes ni el producto,
 *     ni el pedido, ni el préstamo se podían elegir con el teclado.
 *   - 138 objetos de estilo en línea, 148 hexadecimales y 81 `rgba()` fuera.
 */

const TIPOS = [
  {
    value: "entrada",
    label: "Entrada al vivero",
    desc: "Material que llega al vivero desde un proveedor externo u otra entidad.",
    icon: Package,
  },
  {
    value: "salida",
    label: "Salida del vivero",
    desc: "Material que sale del vivero hacia un destino externo.",
    icon: PackageOpen,
  },
  {
    value: "traslado_interno",
    label: "Traslado interno",
    desc: "Movimiento entre zonas del vivero, con posible cambio de tamaño.",
    icon: Repeat,
  },
  {
    value: "devolucion",
    label: "Devolución",
    desc: "Planta prestada que regresa al vivero desde una entidad externa.",
    icon: Undo2,
  },
];

const PASOS = ["Tipo", "Producto", "Destino"];

const FORM_VACIO = {
  pedido_id: "",
  pedido_item_id: "",
  producto_id: "",
  cantidad: "",
  origen_tipo: "",
  destino_tipo: "",
  zona_origen: "",
  zona_destino: "",
  tamano_origen: "",
  tamano_destino: "",
  distrito_destino: "",
  barrio_destino: "",
  direccion_destino: "",
  cp_destino: "",
  observaciones: "",
  prestamo: false,
  fecha_disponibilidad: "",
  prestamo_referencia_id: null,
  tipo_elegido: "",
  origen_especificar: "",
  usar_fecha_personalizada: false,
  fecha_movimiento: "",
  prestamo_max: null,
};

/** Indicador de paso. Es una lista ordenada, y así se anuncia. */
function Pasos({ step }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1" aria-label="Progreso del asistente">
      {PASOS.map((nombre, i) => {
        const n = i + 1;
        const actual = n === step;
        const hecho = n < step;
        return (
          <li key={nombre} className="flex items-center gap-2">
            <span
              className={cn(
                "flex items-center gap-1.5 text-caption",
                actual ? "text-foreground" : "text-muted-foreground"
              )}
              aria-current={actual ? "step" : undefined}
            >
              <span
                className={cn(
                  "tabular flex size-5 items-center justify-center rounded-full text-caption",
                  actual && "bg-primary text-primary-foreground",
                  hecho && "bg-[var(--success-subtle)] text-[var(--success-subtle-foreground)]",
                  !actual && !hecho && "bg-muted text-muted-foreground"
                )}
              >
                {n}
              </span>
              {nombre}
              {/* Sin esto, un lector de pantalla no distingue el paso hecho del
                  pendiente: el color sería el único canal. */}
              {hecho && <span className="sr-only">(completado)</span>}
            </span>
            {i < PASOS.length - 1 && (
              <ChevronRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Tarjeta de tipo de movimiento. Un radio de verdad, no un div clicable. */
function TipoCard({ tipo, selected, disabled, disabledHint, onClick }) {
  const Icono = tipo.icon;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-describedby={disabled && disabledHint ? `${tipo.value}-hint` : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-border p-3 text-left",
        "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected && "border-primary bg-[var(--primary-subtle)]",
        disabled && "cursor-not-allowed opacity-60 hover:bg-transparent"
      )}
    >
      <span className="flex items-center gap-2">
        <Icono aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-body-sm font-[var(--font-weight-medium)]">{tipo.label}</span>
      </span>
      <span className="text-caption text-muted-foreground">{tipo.desc}</span>
      {disabled && disabledHint && (
        <span id={`${tipo.value}-hint`} className="text-caption text-muted-foreground">
          {disabledHint}
        </span>
      )}
    </button>
  );
}

export default function MovimientoModal({
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
  const [form, setForm] = useState(FORM_VACIO);
  const [errors, setErrors] = useState([]);
  const [showPedidoModal, setShowPedidoModal] = useState(false);
  const [showPrestamoModal, setShowPrestamoModal] = useState(false);
  const [distribucion, setDistribucion] = useState({});
  const [zonasSalida, setZonasSalida] = useState([]);
  const [pedidoLineAlloc, setPedidoLineAlloc] = useState({});
  const [destinosColapsados, setDestinosColapsados] = useState({});
  const [batchPayloads, setBatchPayloads] = useState([]);
  const [productoSearch, setProductoSearch] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroSubcategoria, setFiltroSubcategoria] = useState("");

  const salidaZonasRef = useRef(null);

  const setAllocQty = (key, zona, val) =>
    setPedidoLineAlloc((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), [zona]: val } }));
  const allocSum = (key) =>
    Object.values(pedidoLineAlloc[key] || {}).reduce((s, v) => s + Number(v || 0), 0);
  const toggleDestinoColapsado = (dst) =>
    setDestinosColapsados((p) => ({ ...p, [dst]: !p[dst] }));

  useEffect(() => {
    if (!open) {
      setStep(1);
      setForm(FORM_VACIO);
      setErrors([]);
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

  // En un traslado interno el destino es siempre «Vivero»: no se recalcula.
  useEffect(() => {
    if (form.tipo_elegido === "traslado_interno") return;
    const allowed = getDestinoOptions(form.origen_tipo);
    if (form.origen_tipo && !allowed.includes(form.destino_tipo)) {
      // Con una sola opción se fija; con varias se deja vacío para que el
      // usuario elija destinatario explícitamente.
      const fallback = allowed.length === 1 ? allowed[0] : "";
      setForm((prev) => ({
        ...prev,
        destino_tipo: fallback,
        zona_destino: "",
        tamano_destino: "",
        distrito_destino: "",
        barrio_destino: "",
        direccion_destino: "",
        cp_destino: "",
        prestamo: false,
      }));
    }
  }, [form.origen_tipo, form.destino_tipo, form.tipo_elegido]);

  const stockByProductZoneSize = useMemo(
    () => buildStockByProductZoneSize(movimientos),
    [movimientos]
  );

  const barriosDisponibles = useMemo(
    () => (form.distrito_destino ? DISTRITO_BARRIOS[form.distrito_destino] || [] : []),
    [form.distrito_destino]
  );

  const cantidadesEnLote = useMemo(() => {
    const m = new Map();
    for (const p of batchPayloads) {
      if (!p?.pedido_item_id) continue;
      const k = Number(p.pedido_item_id);
      m.set(k, (m.get(k) || 0) + Number(p.cantidad || 0));
    }
    return m;
  }, [batchPayloads]);

  const selectedPedido = useMemo(
    () => safeArray(pedidosAprobados).find((p) => String(p.id) === String(form.pedido_id)) || null,
    [pedidosAprobados, form.pedido_id]
  );

  const pedidoLineas = useMemo(() => {
    return safeArray(selectedPedido?.items).map((it, idx) => {
      // La verdad sobre lo servido la da el backend (`cantidad_servida`), no un
      // recuento de movimientos.
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
      const razon = itemRechazado
        ? "item_denegado"
        : itemPendiente
        ? "item_pendiente"
        : yaEnLote
        ? "ya_en_lote"
        : yaServidaCompleto
        ? "ya_servida"
        : null;
      return {
        ...it,
        _key: `${selectedPedido?.id || "pedido"}-${it?.producto_id || "prod"}-${it?.tamano || "tam"}-${idx}`,
        _cantidad_movida: servidaBackend,
        _cantidad_en_lote: cantidadEnLoteLocal,
        _disabled: disabled,
        _razon_bloqueo: razon,
      };
    });
  }, [selectedPedido, cantidadesEnLote]);

  const selectedProducto = safeArray(productos).find((p) => String(p.id) === String(form.producto_id));
  const formatoConfig = useMemo(() => getProductFormatoConfig(selectedProducto), [selectedProducto]);

  useEffect(() => {
    if (!selectedProducto) return;
    if (formatoConfig.kind === "formato_fijo") {
      setForm((prev) => ({
        ...prev,
        tamano_origen: formatoConfig.value,
        tamano_destino: formatoConfig.value,
      }));
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
    if (!filtroCategoria) {
      if (filtroSubcategoria !== "") setFiltroSubcategoria("");
      return;
    }
    const valid = new Set(
      safeArray(productos)
        .filter((p) => String(p?.categoria || "").trim() === filtroCategoria)
        .map((p) => String(p?.subcategoria || "").trim())
        .filter(Boolean)
    );
    if (filtroSubcategoria && !valid.has(filtroSubcategoria)) setFiltroSubcategoria("");
  }, [filtroCategoria, productos, filtroSubcategoria]);

  useEffect(() => {
    if (!form.producto_id) return;
    const prod = safeArray(productos).find((p) => String(p.id) === String(form.producto_id));
    if (!prod) return;
    const catMismatch = filtroCategoria && String(prod?.categoria || "").trim() !== filtroCategoria;
    const subMismatch =
      filtroSubcategoria && String(prod?.subcategoria || "").trim() !== filtroSubcategoria;
    if (!catMismatch && !subMismatch) return;
    setForm((prev) => ({
      ...prev,
      producto_id: "",
      pedido_item_id: "",
      cantidad: "",
      tamano_origen: "",
      tamano_destino: "",
      zona_origen: "",
      zona_destino: "",
      fecha_disponibilidad: "",
    }));
    setDistribucion({});
  }, [filtroCategoria, filtroSubcategoria, form.producto_id, productos]);

  const categoriasDisponibles = useMemo(() => {
    const set = new Set();
    for (const p of safeArray(productos)) {
      const c = String(p?.categoria || "").trim();
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [productos]);

  const subcategoriasDisponibles = useMemo(() => {
    if (!filtroCategoria) return [];
    const set = new Set();
    for (const p of safeArray(productos)) {
      if (String(p?.categoria || "").trim() !== filtroCategoria) continue;
      const s = String(p?.subcategoria || "").trim();
      if (s) set.add(s);
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
      const parts = key.split("__");
      if (parts.length < 3) continue;
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

  const zonasPermitidasPorCategoria = useMemo(
    () => getZonasPermitidasParaCategoria(selectedProducto, ZONAS),
    [selectedProducto, ZONAS]
  );

  const availableOriginZones = useMemo(() => {
    if (form.origen_tipo !== "Vivero" || !form.producto_id) return zonasPermitidasPorCategoria;
    const formatoOptions = getFormatoOptions(formatoConfig);
    return zonasPermitidasPorCategoria.filter((zona) => {
      if (form.tamano_origen)
        return (
          Number(
            stockByProductZoneSize.get(buildStockKey(form.producto_id, zona, form.tamano_origen)) || 0
          ) > 0
        );
      return formatoOptions.some(
        (t) => Number(stockByProductZoneSize.get(buildStockKey(form.producto_id, zona, t)) || 0) > 0
      );
    });
  }, [form.origen_tipo, form.producto_id, form.tamano_origen, stockByProductZoneSize, formatoConfig, zonasPermitidasPorCategoria]);

  const availableOriginSizes = useMemo(() => {
    const formatoOptions = getFormatoOptions(formatoConfig);
    if (form.origen_tipo !== "Vivero" || !form.producto_id) return formatoOptions;
    return formatoOptions.filter((tamano) => {
      if (form.zona_origen)
        return (
          Number(
            stockByProductZoneSize.get(buildStockKey(form.producto_id, form.zona_origen, tamano)) || 0
          ) > 0
        );
      return zonasPermitidasPorCategoria.some(
        (z) => Number(stockByProductZoneSize.get(buildStockKey(form.producto_id, z, tamano)) || 0) > 0
      );
    });
  }, [form.origen_tipo, form.producto_id, form.zona_origen, stockByProductZoneSize, formatoConfig, zonasPermitidasPorCategoria]);

  useEffect(() => {
    if (
      form.origen_tipo === "Vivero" &&
      form.zona_origen &&
      !availableOriginZones.includes(form.zona_origen)
    ) {
      setForm((prev) => ({ ...prev, zona_origen: "", tamano_origen: "" }));
    }
  }, [form.origen_tipo, form.zona_origen, availableOriginZones]);

  useEffect(() => {
    if (!selectedProducto) return;
    if (zonasPermitidasPorCategoria.length !== 1) return;
    const zonaUnica = zonasPermitidasPorCategoria[0];
    setForm((prev) => {
      const next = { ...prev };
      let changed = false;
      if (
        prev.origen_tipo === "Vivero" &&
        prev.zona_origen !== zonaUnica &&
        availableOriginZones.includes(zonaUnica)
      ) {
        next.zona_origen = zonaUnica;
        changed = true;
      }
      if (prev.destino_tipo === "Vivero" && prev.zona_destino !== zonaUnica) {
        next.zona_destino = zonaUnica;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [selectedProducto, zonasPermitidasPorCategoria, form.origen_tipo, form.destino_tipo, availableOriginZones]);

  useEffect(() => {
    if (!form.producto_id || !productosConStockOrigen) return;
    if (productosConStockOrigen.has(Number(form.producto_id))) return;
    setForm((prev) => ({
      ...prev,
      producto_id: "",
      tamano_origen: prev.origen_tipo === "Vivero" ? "" : prev.tamano_origen,
      zona_origen: prev.origen_tipo === "Vivero" ? "" : prev.zona_origen,
      tamano_destino: prev.destino_tipo === "Vivero" ? "" : prev.tamano_destino,
      zona_destino: prev.destino_tipo === "Vivero" ? "" : prev.zona_destino,
    }));
  }, [form.producto_id, productosConStockOrigen]);

  useEffect(() => {
    if (
      form.destino_tipo === "Vivero" &&
      form.zona_destino &&
      selectedProducto &&
      !zonasPermitidasPorCategoria.includes(form.zona_destino)
    ) {
      setForm((prev) => ({ ...prev, zona_destino: "" }));
    }
  }, [form.destino_tipo, form.zona_destino, selectedProducto, zonasPermitidasPorCategoria]);

  useEffect(() => {
    if (
      form.origen_tipo === "Vivero" &&
      form.tamano_origen &&
      !availableOriginSizes.includes(form.tamano_origen)
    ) {
      setForm((prev) => ({ ...prev, tamano_origen: "" }));
    }
  }, [form.origen_tipo, form.tamano_origen, availableOriginSizes]);

  const esDevolucion = useMemo(() => form.tipo_elegido === "devolucion", [form.tipo_elegido]);

  /* ¿El origen se elige por zona+tamaño en el paso 2? Aplica a salidas y a
     traslados: en ambos el material sale de zonas del vivero y no se puede
     conocer el tamaño sin elegir la zona. */
  const salidaPorZonas =
    (form.tipo_elegido === "salida" || form.tipo_elegido === "traslado_interno") &&
    form.origen_tipo === "Vivero";

  const zonaIdByLower = useMemo(() => {
    const m = new Map();
    for (const z of ZONAS) m.set(String(z).toLowerCase(), z);
    return m;
  }, [ZONAS]);

  const salidaStockRows = useMemo(() => {
    if (!salidaPorZonas || !form.producto_id) return [];
    const pid = String(form.producto_id);
    const prod = safeArray(productos).find((p) => String(p.id) === pid);
    // La regla de tamaño disponible solo aplica a SALIDAS; en traslados hay que
    // poder reubicar cualquier tamaño.
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

  const salidaDispByKey = useMemo(() => {
    const m = {};
    for (const r of salidaStockRows) m[`${r.zona}__${r.tamano}`] = r.disponible;
    return m;
  }, [salidaStockRows]);

  const totalSalida = useMemo(
    () => Object.values(distribucion).reduce((a, b) => a + Number(b || 0), 0),
    [distribucion]
  );

  const salidaStockByZona = useMemo(() => {
    const m = new Map();
    for (const r of salidaStockRows) {
      if (!m.has(r.zona)) m.set(r.zona, []);
      m.get(r.zona).push({ tamano: r.tamano, disponible: r.disponible });
    }
    return m;
  }, [salidaStockRows]);

  const zonasConStock = useMemo(() => Array.from(salidaStockByZona.keys()), [salidaStockByZona]);

  useEffect(() => {
    setDistribucion({});
    setZonasSalida([]);
  }, [form.producto_id, form.origen_tipo]);

  // Al elegir producto, lleva la vista al bloque de zonas para no obligar a
  // bajar buscándolo.
  useEffect(() => {
    if (!salidaPorZonas || !form.producto_id || selectedPedido) return;
    const id = requestAnimationFrame(() => {
      salidaZonasRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(id);
  }, [salidaPorZonas, form.producto_id, selectedPedido]);

  useEffect(() => {
    if (salidaPorZonas && zonasConStock.length === 1 && zonasSalida.length === 0) {
      setZonasSalida([zonasConStock[0]]);
    }
  }, [salidaPorZonas, zonasConStock, zonasSalida.length]);

  // En traslado el formato se elige una vez sobre el origen y el destino hereda
  // el mismo tamaño; aún se puede cambiar en el paso 3.
  useEffect(() => {
    if (form.tipo_elegido !== "traslado_interno") return;
    if (form.tamano_origen && !form.tamano_destino) {
      setForm((prev) => ({ ...prev, tamano_destino: prev.tamano_origen }));
    }
  }, [form.tipo_elegido, form.tamano_origen, form.tamano_destino]);

  useEffect(() => {
    if (
      !(form.tipo_elegido === "entrada" && form.origen_tipo === ENTRADA_ORIGEN_OTROS) &&
      form.origen_especificar
    ) {
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
    return arr
      .filter((m) => !!m?.es_prestamo)
      .map((m) => {
        const devuelto = Number(devolucionesPorRef.get(Number(m.id)) || 0);
        const prestado = Number(m.cantidad || 0);
        return { ...m, _prestado: prestado, _devuelto: devuelto, _pendiente: Math.max(prestado - devuelto, 0) };
      })
      .filter((m) => m._pendiente > 0)
      .sort((a, b) => new Date(b.fecha_movimiento || 0) - new Date(a.fecha_movimiento || 0));
  }, [movimientos]);

  const esSalida = form.tipo_elegido === "salida";
  const esEntrada = form.tipo_elegido === "entrada";
  const esTrasladoTipo = form.tipo_elegido === "traslado_interno";
  const esDevolucionTipo = form.tipo_elegido === "devolucion";

  const handleSeleccionPrestamo = (prestamo) => {
    const origenSugerido = prestamo?.destino_tipo || "Empresa";
    const tamanoOriginal = prestamo?.tamano_origen || prestamo?.tamano_destino || "";
    const detalle = [prestamo?.distrito_destino, prestamo?.barrio_destino, prestamo?.direccion_destino].filter(Boolean);
    const notaBase = `Devolución del préstamo #${prestamo.id}${detalle.length ? ` (${detalle.join(" · ")})` : ""}`;
    setForm((prev) => ({
      ...prev,
      pedido_id: prestamo?.pedido_id ? String(prestamo.pedido_id) : "",
      pedido_item_id: "",
      producto_id: String(prestamo.producto_id),
      cantidad: String(prestamo._pendiente),
      origen_tipo: origenSugerido,
      destino_tipo: "Vivero",
      zona_origen: "",
      tamano_origen: "",
      zona_destino: "",
      tamano_destino: tamanoOriginal,
      distrito_destino: "",
      barrio_destino: "",
      direccion_destino: "",
      cp_destino: "",
      observaciones: prev.observaciones || notaBase,
      prestamo: false,
      fecha_disponibilidad: "",
      prestamo_referencia_id: prestamo.id,
      prestamo_max: Number(prestamo._pendiente) || null,
    }));
    setErrors([]);
    setShowPrestamoModal(false);
  };

  const handleSeleccionPedido = (pedido) => {
    const esReposicion = (pedido?.tipo || "salida") === "reposicion";
    setForm((prev) => ({
      ...prev,
      pedido_id: String(pedido.id),
      pedido_item_id: "",
      producto_id: "",
      cantidad: "",
      origen_tipo: esReposicion ? "Empresa Externa" : "Vivero",
      destino_tipo: esReposicion ? "Vivero" : DESTINOS_EXTERNOS.includes("Empresa") ? "Empresa" : "Otro",
      zona_origen: "",
      zona_destino: "",
      tamano_origen: "",
      tamano_destino: "",
      distrito_destino: esReposicion ? "" : pedido.distrito_destino || "",
      barrio_destino: esReposicion ? "" : pedido.barrio_destino || "",
      direccion_destino: esReposicion ? "" : pedido.direccion_destino || "",
      cp_destino: "",
      observaciones: prev.observaciones || `Movimiento asociado al pedido #${pedido.id}`,
      prestamo: false,
      tipo_elegido: esReposicion ? "entrada" : "salida",
    }));
    setShowPedidoModal(false);
    setStep(2);
  };

  const buildCurrentPayloads = () => {
    const foundErrors = getFormErrors(form, formatoConfig);
    let filtered = [...foundErrors];

    if (esDevolucionTipo && form.prestamo_max && Number(form.cantidad) > Number(form.prestamo_max)) {
      filtered.push(`No puedes devolver más de lo pendiente del préstamo (${form.prestamo_max}).`);
    }

    if (salidaPorZonas) {
      // La zona, el tamaño y la cantidad se eligen por fila en el paso 2: se
      // ignoran los errores de los campos únicos.
      filtered = filtered.filter((e) => {
        const l = e.toLowerCase();
        return (
          !l.includes("zona de origen") &&
          !l.includes("tamaño de origen") &&
          !l.includes("tamano de origen") &&
          !l.includes("cantidad debe ser mayor")
        );
      });
      const elegidas = Object.entries(distribucion).filter(([, q]) => Number(q) > 0);
      if (elegidas.length === 0) filtered.push("Indica al menos una zona con cantidad > 0.");
      for (const [k, q] of elegidas) {
        const parts = k.split("__");
        const zona = parts[0];
        const tamano = parts.slice(1).join("__");
        const disp = Number(salidaDispByKey[k] || 0);
        if (Number(q) > disp)
          filtered.push(`${getZonaLabel(zona)} · ${tamano}: solicitado ${q} supera el disponible (${disp}).`);
      }
    } else if (form.origen_tipo === "Vivero" && form.zona_origen && form.tamano_origen) {
      const disp = Number(
        stockByProductZoneSize.get(buildStockKey(form.producto_id, form.zona_origen, form.tamano_origen)) || 0
      );
      const pedido = formatoConfig.allowDecimals ? Number(form.cantidad) : Math.round(Number(form.cantidad));
      if (pedido > disp)
        filtered.push(
          `La zona ${getZonaLabel(form.zona_origen)} solo tiene ${disp} disponibles para ${form.tamano_origen}.`
        );
    }

    if (filtered.length > 0) return { ok: false, payloads: [], errors: filtered };

    // En una entrada «Otros» el origen real es el texto especificado. La
    // columna admite 30 caracteres.
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
      origen_tipo: origenTipoFinal,
      destino_tipo: form.destino_tipo,
      tamano_origen: form.origen_tipo === "Vivero" ? form.tamano_origen || null : null,
      tamano_destino: form.destino_tipo === "Vivero" ? form.tamano_destino || null : null,
      zona_destino: form.destino_tipo === "Vivero" ? form.zona_destino || null : null,
      distrito_destino: isExternalDestination(form.destino_tipo) ? form.distrito_destino || null : null,
      barrio_destino: isExternalDestination(form.destino_tipo) ? form.barrio_destino || null : null,
      direccion_destino: isExternalDestination(form.destino_tipo) ? form.direccion_destino || null : null,
      cp_destino: isExternalDestination(form.destino_tipo) ? form.cp_destino || null : null,
      observaciones: form.observaciones || null,
      nota: form.observaciones || null,
      es_prestamo:
        form.origen_tipo === "Vivero" && isExternalDestination(form.destino_tipo) ? !!form.prestamo : false,
      es_devolucion: esDevolucion,
      prestamo_referencia_id:
        esDevolucion && form.prestamo_referencia_id ? Number(form.prestamo_referencia_id) : null,
      fecha_disponibilidad:
        form.destino_tipo === "Vivero" && form.tamano_destino === "M35" && form.fecha_disponibilidad
          ? form.fecha_disponibilidad
          : null,
      fecha_movimiento: form.usar_fecha_personalizada && form.fecha_movimiento ? form.fecha_movimiento : null,
    };

    // Unidades enteras salvo kg, litros, m³ y metros.
    const normCantidad = (n) => (formatoConfig.allowDecimals ? Number(n) : Math.round(Number(n)));

    let payloads;
    if (salidaPorZonas) {
      payloads = Object.entries(distribucion)
        .filter(([, q]) => Number(q) > 0)
        .map(([k, q]) => {
          const [zona, tamano] = k.split("__");
          return { ...basePayload, zona_origen: zona, tamano_origen: tamano, cantidad: normCantidad(q) };
        });
    } else {
      const cantidadFinal = formatoConfig.showCantidad ? normCantidad(parseFloat(form.cantidad)) : 1;
      payloads = [
        {
          ...basePayload,
          zona_origen: form.origen_tipo === "Vivero" ? form.zona_origen || null : null,
          cantidad: cantidadFinal,
        },
      ];
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
    setForm((prev) => ({
      ...prev,
      pedido_item_id: "",
      producto_id: "",
      cantidad: "",
      tamano_origen: "",
      tamano_destino: prev.destino_tipo === "Vivero" ? "" : prev.tamano_destino,
      zona_origen: "",
      zona_destino: prev.destino_tipo === "Vivero" ? "" : prev.zona_destino,
      fecha_disponibilidad: "",
    }));
    setDistribucion({});
    setProductoSearch("");
  };

  const removeBatchItem = (idx) => setBatchPayloads((prev) => prev.filter((_, i) => i !== idx));

  const zonasParaLineaPedido = (linea) => {
    const esRepo = (selectedPedido?.tipo || "salida") === "reposicion";
    if (esRepo) {
      const prod = safeArray(productos).find((p) => String(p.id) === String(linea.producto_id));
      return getZonasPermitidasParaCategoria(prod, ZONAS).map((z) => ({ zona: z, disponible: null }));
    }
    const pid = String(linea.producto_id);
    const out = [];
    for (const [key, qty] of stockByProductZoneSize.entries()) {
      if (Number(qty) <= 0) continue;
      const parts = key.split("__");
      if (parts[0] !== pid) continue;
      const tam = parts.slice(2).join("__");
      if (linea.tamano && tam !== linea.tamano) continue;
      out.push({ zona: zonaIdByLower.get(parts[1]) || parts[1], disponible: Number(qty) });
    }
    out.sort((a, b) => b.disponible - a.disponible);
    return out;
  };

  const lineasPendientesPedido = pedidoLineas.filter((l) => !l._disabled).length;

  const addPedidoLinea = (linea) => {
    const esRepo = (selectedPedido?.tipo || "salida") === "reposicion";
    const necesaria = Math.max(0, Number(linea.cantidad || 0) - Number(linea._cantidad_movida || 0));
    if (necesaria <= 0) {
      setErrors(["La línea no tiene cantidad pendiente."]);
      return;
    }

    const alloc = pedidoLineAlloc[linea._key] || {};
    const entradas = Object.entries(alloc)
      .map(([zona, v]) => ({ zona, cant: Number(v || 0) }))
      .filter((e) => e.cant > 0);

    if (entradas.length === 0) {
      setErrors(["Indica cuántas unidades sacar de cada zona para esta línea."]);
      return;
    }

    if (!esRepo) {
      for (const e of entradas) {
        const disp = Number(
          stockByProductZoneSize.get(
            `${linea.producto_id}__${String(e.zona).toLowerCase()}__${linea.tamano}`
          ) || 0
        );
        if (e.cant > disp) {
          setErrors([
            `En ${getZonaLabel(e.zona)} solo hay ${disp} de ${linea.producto_nombre || "este producto"} (${linea.tamano}).`,
          ]);
          return;
        }
      }
    }

    const suma = entradas.reduce((s, e) => s + e.cant, 0);
    if (Math.abs(suma - necesaria) > 1e-9) {
      setErrors([`La suma repartida (${suma}) debe coincidir con la cantidad de la línea (${necesaria}).`]);
      return;
    }

    const destinoTipo = esRepo
      ? "Vivero"
      : DESTINOS_EXTERNOS.includes(form.destino_tipo)
      ? form.destino_tipo
      : "Empresa";
    const nota = `Movimiento asociado al pedido #${selectedPedido?.id || ""}`;

    const nuevos = entradas.map((e) => ({
      pedido_id: selectedPedido?.id ? Number(selectedPedido.id) : null,
      pedido_item_id: linea.id ? Number(linea.id) : null,
      producto_id: Number(linea.producto_id),
      origen_tipo: esRepo ? "Empresa Externa" : "Vivero",
      destino_tipo: destinoTipo,
      tamano_origen: esRepo ? null : linea.tamano || null,
      tamano_destino: esRepo ? linea.tamano || null : null,
      zona_origen: esRepo ? null : e.zona,
      zona_destino: esRepo ? e.zona : null,
      distrito_destino: esRepo ? null : selectedPedido?.distrito_destino || null,
      barrio_destino: esRepo ? null : selectedPedido?.barrio_destino || null,
      direccion_destino: esRepo ? null : selectedPedido?.direccion_destino || null,
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
    setPedidoLineAlloc((prev) => {
      const n = { ...prev };
      delete n[linea._key];
      return n;
    });
    setErrors([]);
  };

  const submit = async () => {
    const currentIsFilled = formTieneLineaActual();
    if (!currentIsFilled && batchPayloads.length === 0) {
      setErrors(["No hay líneas que guardar. Rellena el formulario o añade al lote."]);
      return;
    }
    let allPayloads = [...batchPayloads];
    if (currentIsFilled) {
      const result = buildCurrentPayloads();
      setErrors(result.errors);
      if (!result.ok) return;
      allPayloads = [...allPayloads, ...result.payloads];
    } else {
      setErrors([]);
    }

    /* La fecha personalizada, las observaciones y —en salidas directas— la
       dirección se eligen en el paso 3, pero las líneas del lote se
       construyeron en el paso 2. Se aplican aquí a TODAS. En pedidos no se toca
       la dirección: cada línea lleva la suya. */
    const fechaMov =
      form.usar_fecha_personalizada && form.fecha_movimiento
        ? datetimeLocalToUtcIso(form.fecha_movimiento)
        : null;
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

  const formatoField = esSalida || esTrasladoTipo ? "tamano_origen" : "tamano_destino";
  const formatoFijo = formatoConfig.kind === "formato_fijo";

  const entradaOtrosSinEspecificar =
    esEntrada && form.origen_tipo === ENTRADA_ORIGEN_OTROS && !(form.origen_especificar || "").trim();

  const step1Valid =
    !!form.tipo_elegido &&
    (esSalida ? !!form.destino_tipo : true) &&
    (esEntrada ? !!form.origen_tipo && !entradaOtrosSinEspecificar : true) &&
    (esDevolucionTipo ? !!form.prestamo_referencia_id : true);

  const hayExcesoSalida =
    salidaPorZonas &&
    Object.entries(distribucion).some(([k, q]) => Number(q) > Number(salidaDispByKey[k] || 0));

  const setCampo = (campo, valor) => setForm((p) => ({ ...p, [campo]: valor }));

  /** Filas de destino agrupadas, para servir un pedido. */
  const gruposDestino = useMemo(() => {
    const order = [];
    const gmap = new Map();
    for (const linea of pedidoLineas) {
      const dst =
        [linea.distrito_destino, linea.barrio_destino, linea.direccion_destino].filter(Boolean).join(" · ") ||
        "Sin destino";
      if (!gmap.has(dst)) {
        gmap.set(dst, []);
        order.push(dst);
      }
      gmap.get(dst).push(linea);
    }
    return order.map((dst) => ({ destino: dst, lineas: gmap.get(dst) }));
  }, [pedidoLineas]);

  const avanzar = () => {
    if (step === 1 && !step1Valid) {
      setErrors([
        entradaOtrosSinEspecificar
          ? "Especifica la procedencia del material."
          : "Completa los campos requeridos antes de continuar.",
      ]);
      return;
    }
    if (step === 2 && batchPayloads.length > 0 && !formTieneLineaActual()) {
      setErrors([]);
      setStep((s) => s + 1);
      return;
    }
    if (step === 2 && selectedPedido && batchPayloads.length === 0 && !formTieneLineaActual()) {
      setErrors(["Añade al menos una línea del pedido al lote."]);
      return;
    }
    if (step === 2 && !form.producto_id) {
      setErrors(["Selecciona un producto antes de continuar."]);
      return;
    }
    if (step === 2 && salidaPorZonas && !(totalSalida > 0)) {
      setErrors(["Indica cuántas unidades sacar de al menos una zona."]);
      return;
    }
    if (step === 2 && salidaPorZonas && hayExcesoSalida) {
      setErrors(["Hay zonas donde pides más de lo disponible. Corrige las cantidades marcadas."]);
      return;
    }
    if (
      step === 2 &&
      !salidaPorZonas &&
      formatoConfig.showCantidad !== false &&
      (!form.cantidad || Number(form.cantidad) <= 0)
    ) {
      setErrors(["La cantidad debe ser mayor que 0."]);
      return;
    }
    if (step === 2 && !salidaPorZonas && !formatoFijo && !form[formatoField]) {
      setErrors([`Selecciona el ${formatoConfig.kind === "tamano" ? "tamaño" : "formato"} antes de continuar.`]);
      return;
    }
    setErrors([]);
    setStep((s) => s + 1);
  };

  const tituloPaso =
    step === 1 ? "¿Qué tipo de movimiento?" : step === 2 ? "Producto, cantidad y formato" : "Destino y confirmación";

  return (
    <>
      <Dialog open={open} onOpenChange={(abierto) => !abierto && onClose()}>
        <DialogContent
          title="Nuevo movimiento"
          description={tituloPaso}
          closeLabel="Cerrar"
          size="lg"
          className="max-w-[var(--modal-width-xl)]"
        >
          <div className="flex flex-col gap-4">
            <Pasos step={step} />

            {errors.length > 0 && (
              <Alert tone="error" title="Revisa lo siguiente">
                <ul className="list-inside list-disc">
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </Alert>
            )}

            {/* ══ PASO 1 · Tipo ══════════════════════════════════════════ */}
            {step === 1 && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border p-3">
                  <div className="min-w-0">
                    <p className="text-body-sm font-[var(--font-weight-medium)]">
                      ¿Tienes un pedido aprobado?
                    </p>
                    <p className="text-caption text-muted-foreground">
                      Al asociarlo se rellenan producto, cantidad y destino.
                    </p>
                  </div>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setShowPedidoModal(true)}>
                    Asociar pedido
                  </Button>
                </div>

                {form.pedido_id && (
                  <div className="flex items-center justify-between gap-3">
                    <StatusBadge status="success" label={`Pedido #${form.pedido_id} asociado`} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setForm((p) => ({ ...p, pedido_id: "", pedido_item_id: "" }))}
                    >
                      Quitar
                    </Button>
                  </div>
                )}

                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-body-sm font-[var(--font-weight-medium)]">
                    Selecciona el tipo de movimiento
                  </legend>
                  <div role="radiogroup" aria-label="Tipo de movimiento" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {TIPOS.map((t) => (
                      <TipoCard
                        key={t.value}
                        tipo={t}
                        selected={form.tipo_elegido === t.value}
                        disabled={t.value === "devolucion" && prestamosActivos.length === 0}
                        disabledHint="No hay préstamos activos que devolver."
                        onClick={() => {
                          if (t.value === "entrada")
                            setForm((p) => ({ ...p, tipo_elegido: "entrada", destino_tipo: "Vivero", origen_tipo: "", zona_origen: "", tamano_origen: "" }));
                          if (t.value === "salida")
                            setForm((p) => ({ ...p, tipo_elegido: "salida", origen_tipo: "Vivero", destino_tipo: "", zona_destino: "", tamano_destino: "" }));
                          if (t.value === "traslado_interno")
                            setForm((p) => ({ ...p, tipo_elegido: "traslado_interno", origen_tipo: "Vivero", destino_tipo: "Vivero" }));
                          if (t.value === "devolucion")
                            setForm((p) => ({ ...p, tipo_elegido: "devolucion", destino_tipo: "Vivero", zona_destino: "", tamano_destino: "" }));
                        }}
                      />
                    ))}
                  </div>
                </fieldset>

                {esSalida && (
                  <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border p-3">
                    <h3 className="text-body-sm font-[var(--font-weight-medium)]">¿A dónde va el material?</h3>
                    <SelectField
                      label="Tipo de destinatario"
                      required
                      value={form.destino_tipo}
                      onChange={(v) =>
                        setForm((p) => ({ ...p, destino_tipo: v, distrito_destino: "", barrio_destino: "", direccion_destino: "" }))
                      }
                      allLabel={null}
                      placeholder="Elige el destinatario"
                      options={SALIDA_DESTINOS.map((d) => ({ value: d, label: d }))}
                    />
                    {isExternalDestination(form.destino_tipo) && (
                      <p className="text-caption text-muted-foreground">
                        Indicarás distrito, barrio y dirección en el último paso.
                      </p>
                    )}
                  </div>
                )}

                {esEntrada && (
                  <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border p-3">
                    <h3 className="text-body-sm font-[var(--font-weight-medium)]">¿De dónde viene el material?</h3>
                    <SelectField
                      label="Origen"
                      required
                      value={form.origen_tipo}
                      onChange={(v) => setCampo("origen_tipo", v)}
                      allLabel={null}
                      placeholder="Elige la procedencia"
                      options={ENTRADA_ORIGENES.map((o) => ({ value: o, label: o }))}
                    />
                    {form.origen_tipo === ENTRADA_ORIGEN_OTROS && (
                      <Field label="Especificar procedencia" required description="Máximo 30 caracteres.">
                        <Input
                          value={form.origen_especificar}
                          maxLength={30}
                          placeholder="Palmetum u otra entidad"
                          onChange={(e) => setCampo("origen_especificar", e.target.value)}
                        />
                      </Field>
                    )}
                  </div>
                )}

                {esTrasladoTipo && (
                  <p className="text-body-sm text-muted-foreground">
                    Elegirás la zona de origen y la de destino en los pasos siguientes.
                  </p>
                )}

                {esDevolucionTipo && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border p-3">
                    <div className="min-w-0">
                      <p className="text-body-sm font-[var(--font-weight-medium)]">Préstamo que se devuelve</p>
                      <p className="text-caption text-muted-foreground">
                        {form.prestamo_referencia_id
                          ? `Préstamo #${form.prestamo_referencia_id} · hasta ${form.prestamo_max} unidades`
                          : "Todavía no has elegido ninguno."}
                      </p>
                    </div>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setShowPrestamoModal(true)}>
                      Elegir préstamo
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* ══ PASO 2 · Producto y cantidad ═══════════════════════════ */}
            {step === 2 && (
              <div className="flex flex-col gap-4">
                {!selectedPedido && (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <SelectField
                        label="Categoría"
                        value={filtroCategoria}
                        onChange={setFiltroCategoria}
                        options={categoriasDisponibles.map((c) => ({ value: c, label: c }))}
                      />
                      <SelectField
                        label="Subcategoría"
                        value={filtroSubcategoria}
                        onChange={setFiltroSubcategoria}
                        options={subcategoriasDisponibles.map((s) => ({ value: s, label: s }))}
                      />
                      <SearchField
                        label="Buscar producto"
                        hideLabel={false}
                        value={productoSearch}
                        onChange={setProductoSearch}
                        placeholder="Nombre científico o común"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <p className="text-body-sm font-[var(--font-weight-medium)]">
                        Producto{" "}
                        <span className="tabular font-[var(--font-weight-regular)] text-muted-foreground">
                          ({filteredProductos.length} disponibles
                          {form.origen_tipo === "Vivero" ? " con existencias" : ""})
                        </span>
                      </p>
                      <div
                        role="radiogroup"
                        aria-label="Producto"
                        className="max-h-64 overflow-y-auto rounded-[var(--radius-md)] border border-border"
                      >
                        {filteredProductos.length === 0 ? (
                          <p className="p-4 text-body-sm text-muted-foreground">
                            No hay productos{form.origen_tipo === "Vivero" ? " con existencias" : ""} que coincidan.
                          </p>
                        ) : (
                          filteredProductos.map((p) => {
                            const active = String(p.id) === String(form.producto_id);
                            return (
                              <div
                                key={p.id}
                                className={cn(
                                  "flex items-center gap-2 border-b border-border pr-2 last:border-b-0",
                                  active && "bg-accent"
                                )}
                              >
                                <button
                                  type="button"
                                  role="radio"
                                  aria-checked={active}
                                  onClick={() => {
                                    setForm((prev) => ({
                                      ...prev,
                                      producto_id: String(p.id),
                                      zona_origen: "",
                                      tamano_origen: "",
                                      zona_destino: "",
                                      tamano_destino: "",
                                    }));
                                    setDistribucion({});
                                  }}
                                  className="min-w-0 flex-1 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                >
                                  <span className="block truncate text-body-sm">{getProductDisplayName(p)}</span>
                                  {p.categoria && (
                                    <span className="block truncate text-caption text-muted-foreground">
                                      {p.categoria}
                                      {p.subcategoria ? ` · ${p.subcategoria}` : ""}
                                    </span>
                                  )}
                                </button>
                                <VerPlanta
                                  nombreCientifico={p.nombre_cientifico}
                                  nombreNatural={p.nombre_natural}
                                  variant="button"
                                  stopPropagation
                                />
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Reparto por zonas (salida y traslado desde el vivero) */}
                {salidaPorZonas && form.producto_id && !selectedPedido && (
                  <section ref={salidaZonasRef} className="flex flex-col gap-3 scroll-mt-2">
                    <h3 className="text-body-sm font-[var(--font-weight-medium)]">
                      ¿De qué zonas sale?{" "}
                      <span className="tabular font-[var(--font-weight-regular)] text-muted-foreground">
                        (total: {totalSalida})
                      </span>
                    </h3>
                    {salidaStockRows.length === 0 ? (
                      <p className="text-body-sm text-muted-foreground">
                        Este producto no tiene existencias en ninguna zona.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {salidaStockRows.map((r) => {
                          const k = `${r.zona}__${r.tamano}`;
                          const exceso = Number(distribucion[k] || 0) > r.disponible;
                          return (
                            <Field
                              key={k}
                              label={`${getZonaLabel(r.zona)} · ${r.tamano}`}
                              description={`${r.disponible} disponibles`}
                              error={exceso ? `Solo hay ${r.disponible} disponibles.` : undefined}
                            >
                              <Input
                                type="number"
                                min="0"
                                max={String(r.disponible)}
                                step={formatoConfig.allowDecimals ? "0.01" : "1"}
                                value={distribucion[k] ?? ""}
                                onChange={(e) =>
                                  setDistribucion((prev) => ({ ...prev, [k]: e.target.value }))
                                }
                                className="tabular text-right"
                              />
                            </Field>
                          );
                        })}
                      </div>
                    )}
                  </section>
                )}

                {/* Cantidad y formato simples */}
                {!salidaPorZonas && !selectedPedido && form.producto_id && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {formatoConfig.showCantidad !== false && (
                      <Field label="Cantidad" required>
                        <Input
                          type="number"
                          min="0"
                          step={formatoConfig.allowDecimals ? "0.01" : "1"}
                          value={form.cantidad}
                          onChange={(e) => setCampo("cantidad", e.target.value)}
                          className="tabular text-right"
                        />
                      </Field>
                    )}
                    {!formatoFijo && (
                      <SelectField
                        label={formatoConfig.kind === "tamano" ? "Tamaño" : "Formato"}
                        required
                        value={form[formatoField]}
                        onChange={(v) => setCampo(formatoField, v)}
                        allLabel={null}
                        placeholder="Elige una opción"
                        options={(esSalida || esTrasladoTipo ? availableOriginSizes : getFormatoOptions(formatoConfig)).map(
                          (t) => ({ value: t, label: t })
                        )}
                      />
                    )}
                    {formatoFijo && (
                      <Field label="Formato">
                        <p className="text-body-sm text-muted-foreground">{formatoConfig.value}</p>
                      </Field>
                    )}
                  </div>
                )}

                {/* Líneas del pedido */}
                {selectedPedido && (
                  <section className="flex flex-col gap-3">
                    <h3 className="text-body-sm font-[var(--font-weight-medium)]">
                      Líneas del pedido #{selectedPedido.id}
                    </h3>
                    {selectedPedido.nota && (
                      <Alert tone="info" title="Comentarios del solicitante">
                        {selectedPedido.nota}
                      </Alert>
                    )}
                    <p className="text-caption text-muted-foreground">
                      Elige la zona de origen de cada línea y añádela. Se guarda un movimiento por zona.
                    </p>

                    {gruposDestino.map((grupo) => {
                      const colapsado = !!destinosColapsados[grupo.destino];
                      return (
                        <div key={grupo.destino} className="rounded-[var(--radius-md)] border border-border">
                          <button
                            type="button"
                            onClick={() => toggleDestinoColapsado(grupo.destino)}
                            aria-expanded={!colapsado}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                          >
                            {colapsado ? (
                              <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
                            ) : (
                              <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
                            )}
                            <span className="min-w-0 flex-1 truncate text-body-sm font-[var(--font-weight-medium)]">
                              {grupo.destino}
                            </span>
                            <span className="tabular shrink-0 text-caption text-muted-foreground">
                              {grupo.lineas.length}
                            </span>
                          </button>

                          {!colapsado && (
                            <div className="flex flex-col gap-3 border-t border-border p-3">
                              {grupo.lineas.map((linea) => {
                                const disabled = !!linea._disabled;
                                const zonasLinea = disabled ? [] : zonasParaLineaPedido(linea);
                                const esRepoPedido = (selectedPedido?.tipo || "salida") === "reposicion";
                                const necesaria = Math.max(
                                  0,
                                  Number(linea.cantidad || 0) - Number(linea._cantidad_movida || 0)
                                );
                                const asignado = allocSum(linea._key);
                                const repartoOk = Math.abs(asignado - necesaria) < 1e-9;
                                const motivo =
                                  linea._razon_bloqueo === "ya_en_lote"
                                    ? "añadida al lote"
                                    : linea._razon_bloqueo === "ya_servida"
                                    ? "ya movida"
                                    : linea._razon_bloqueo === "item_denegado"
                                    ? "línea denegada"
                                    : linea._razon_bloqueo === "item_pendiente"
                                    ? "pendiente de aprobar"
                                    : "no disponible";
                                return (
                                  <div
                                    key={linea._key}
                                    className="flex flex-col gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="truncate text-body-sm font-[var(--font-weight-medium)]">
                                          {linea.producto_nombre || `Producto #${linea.producto_id}`}
                                        </p>
                                        <p className="tabular text-caption text-muted-foreground">
                                          Tamaño: {linea.tamano || "—"} · Cantidad: {linea.cantidad || 0}
                                        </p>
                                      </div>
                                      {/* El estado va con texto, no con un tono de fondo. */}
                                      {disabled && <StatusBadge status="inactive" label={motivo} />}
                                    </div>

                                    {!disabled && (
                                      <>
                                        <p className="text-caption text-muted-foreground">
                                          {esRepoPedido
                                            ? "Zonas de destino (reparte la cantidad)"
                                            : "Zonas de origen (reparte la cantidad)"}
                                        </p>
                                        {zonasLinea.length === 0 ? (
                                          <p className="text-body-sm text-muted-foreground">
                                            Este producto no tiene existencias en ninguna zona.
                                          </p>
                                        ) : (
                                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                            {zonasLinea.map(({ zona, disponible }) => {
                                              const cap = Math.min(
                                                Number(disponible != null ? disponible : Infinity),
                                                necesaria
                                              );
                                              return (
                                                <Field
                                                  key={zona}
                                                  label={`${getZonaLabel(zona)}${
                                                    disponible != null ? ` · ${disponible} uds` : ""
                                                  }`}
                                                >
                                                  <Input
                                                    type="number"
                                                    min="0"
                                                    max={String(cap)}
                                                    value={pedidoLineAlloc[linea._key]?.[zona] ?? ""}
                                                    onChange={(e) => {
                                                      // Tope: ni más de lo que hay en la zona, ni
                                                      // más de lo que falta por servir.
                                                      const v = Math.min(Number(e.target.value || 0), cap);
                                                      setAllocQty(linea._key, zona, v > 0 ? String(v) : "");
                                                    }}
                                                    className="tabular text-right"
                                                  />
                                                </Field>
                                              );
                                            })}
                                          </div>
                                        )}
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <span className="tabular text-caption text-muted-foreground">
                                            Repartido {asignado} de {necesaria}
                                          </span>
                                          <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            disabled={!repartoOk || zonasLinea.length === 0}
                                            onClick={() => addPedidoLinea(linea)}
                                          >
                                            Añadir al lote
                                          </Button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </section>
                )}

                {/* Lote acumulado */}
                {batchPayloads.length > 0 && (
                  <section className="flex flex-col gap-2">
                    <h3 className="text-body-sm font-[var(--font-weight-medium)]">
                      Lote{" "}
                      <span className="tabular font-[var(--font-weight-regular)] text-muted-foreground">
                        ({batchPayloads.length} línea{batchPayloads.length === 1 ? "" : "s"})
                      </span>
                    </h3>
                    <ul className="flex flex-col rounded-[var(--radius-md)] border border-border">
                      {batchPayloads.map((p, i) => (
                        <li
                          key={`${p.producto_id}-${p.zona_origen || p.zona_destino}-${i}`}
                          className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
                        >
                          <span className="min-w-0 flex-1 truncate text-body-sm">
                            Producto #{p.producto_id} ·{" "}
                            {p.zona_origen ? getZonaLabel(p.zona_origen) : getZonaLabel(p.zona_destino)} ·{" "}
                            {p.tamano_origen || p.tamano_destino || "—"}
                          </span>
                          <span className="tabular shrink-0 text-body-sm">{p.cantidad}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeBatchItem(i)}
                            aria-label={`Quitar la línea ${i + 1} del lote`}
                          >
                            Quitar
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {!selectedPedido && form.producto_id && (
                  <div className="flex justify-end">
                    <Button type="button" variant="secondary" size="sm" onClick={addCurrentToBatch}>
                      Añadir al lote y seguir
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* ══ PASO 3 · Destino y confirmación ════════════════════════ */}
            {step === 3 && (
              <div className="flex flex-col gap-4">
                {esTrasladoTipo && !salidaPorZonas && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <SelectField
                      label="Zona de origen"
                      required
                      value={form.zona_origen}
                      onChange={(v) => setCampo("zona_origen", v)}
                      allLabel={null}
                      placeholder={
                        !form.producto_id
                          ? "Primero elige producto"
                          : availableOriginZones.length === 0
                          ? "Sin existencias para este producto"
                          : "Elige zona"
                      }
                      options={availableOriginZones.map((z) => {
                        const qty = form.tamano_origen
                          ? Number(
                              stockByProductZoneSize.get(
                                buildStockKey(form.producto_id, z, form.tamano_origen)
                              ) || 0
                            )
                          : getFormatoOptions(formatoConfig).reduce(
                              (s, t) =>
                                s +
                                Number(
                                  stockByProductZoneSize.get(buildStockKey(form.producto_id, z, t)) || 0
                                ),
                              0
                            );
                        return {
                          value: String(z),
                          label: `${getZonaLabel(z)}${form.producto_id ? ` (${qty} uds)` : ""}`,
                        };
                      })}
                    />
                    <Field label={formatoConfig.kind === "tamano" ? "Tamaño" : "Formato"}>
                      <p className="text-body-sm text-muted-foreground">{form.tamano_origen || "—"}</p>
                    </Field>
                  </div>
                )}

                {esSalida && isExternalDestination(form.destino_tipo) && (
                  <section className="flex flex-col gap-3">
                    <h3 className="text-body-sm font-[var(--font-weight-medium)]">
                      Dirección de destino · {form.destino_tipo}
                    </h3>
                    {selectedPedido ? (
                      <div className="rounded-[var(--radius-md)] border border-border p-3">
                        <p className="text-body-sm">
                          {[form.distrito_destino, form.barrio_destino, form.direccion_destino]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                        <p className="text-caption text-muted-foreground">
                          Dirección del pedido #{selectedPedido.id}; igual para todas las líneas y no editable.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <SelectField
                          label="Distrito"
                          required
                          value={form.distrito_destino}
                          onChange={(v) => setForm((p) => ({ ...p, distrito_destino: v, barrio_destino: "" }))}
                          allLabel={null}
                          placeholder="Elige distrito"
                          options={Object.keys(DISTRITO_BARRIOS).map((d) => ({ value: d, label: d }))}
                        />
                        <SelectField
                          label="Barrio"
                          required
                          value={form.barrio_destino}
                          onChange={(v) => setCampo("barrio_destino", v)}
                          allLabel={null}
                          placeholder={form.distrito_destino ? "Elige barrio" : "Primero elige el distrito"}
                          options={barriosDisponibles.map((b) => ({ value: b, label: b }))}
                        />
                        <Field label="Dirección" required className="sm:col-span-2">
                          <Input
                            value={form.direccion_destino}
                            placeholder="Calle, número…"
                            onChange={(e) => setCampo("direccion_destino", e.target.value)}
                          />
                        </Field>
                      </div>
                    )}
                  </section>
                )}

                {!selectedPedido && (esEntrada || esTrasladoTipo || esDevolucionTipo) && (
                  <section className="flex flex-col gap-3">
                    <h3 className="text-body-sm font-[var(--font-weight-medium)]">Zona de destino</h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <SelectField
                        label="Zona de destino"
                        required
                        value={form.zona_destino}
                        onChange={(v) => setCampo("zona_destino", v)}
                        allLabel={null}
                        placeholder="Elige zona"
                        options={zonasPermitidasPorCategoria.map((z) => ({
                          value: String(z),
                          label: getZonaLabel(z),
                        }))}
                      />
                      {/* El tamaño solo es editable en traslados: en entrada y
                          devolución ya se eligió en el paso 2. */}
                      {esTrasladoTipo && !formatoFijo && (
                        <SelectField
                          label={formatoConfig.kind === "tamano" ? "Tamaño de destino" : "Formato de destino"}
                          value={form.tamano_destino}
                          onChange={(v) => setCampo("tamano_destino", v)}
                          allLabel={null}
                          placeholder="Elige una opción"
                          options={getFormatoOptions(formatoConfig).map((t) => ({ value: t, label: t }))}
                        />
                      )}
                      {form.destino_tipo === "Vivero" && form.tamano_destino === "M35" && (
                        <Field
                          label="Fecha de disponibilidad"
                          optionalLabel="(opcional)"
                          description="Solo aplica a M35. Debe ser futura."
                        >
                          <Input
                            type="date"
                            value={form.fecha_disponibilidad || ""}
                            onChange={(e) => setCampo("fecha_disponibilidad", e.target.value)}
                          />
                        </Field>
                      )}
                    </div>
                  </section>
                )}

                <Field label="Observaciones" optionalLabel="(opcional)">
                  <Textarea
                    rows={3}
                    value={form.observaciones}
                    placeholder="Información adicional"
                    onChange={(e) => setCampo("observaciones", e.target.value)}
                  />
                </Field>

                <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border p-3">
                  <Checkbox
                    checked={form.usar_fecha_personalizada}
                    onCheckedChange={(v) =>
                      setForm((p) => ({
                        ...p,
                        usar_fecha_personalizada: !!v,
                        fecha_movimiento: v && !p.fecha_movimiento ? defaultFechaLocal() : p.fecha_movimiento,
                      }))
                    }
                    label="Registrar en otra fecha y hora"
                  />
                  {form.usar_fecha_personalizada && (
                    <Field
                      label="Fecha y hora del movimiento"
                      description="No puede ser futura."
                    >
                      <Input
                        type="datetime-local"
                        value={form.fecha_movimiento}
                        max={defaultFechaLocal()}
                        onChange={(e) => setCampo("fecha_movimiento", e.target.value)}
                      />
                    </Field>
                  )}
                </div>

                {esSalida && isExternalDestination(form.destino_tipo) && (
                  <Checkbox
                    checked={!!form.prestamo}
                    onCheckedChange={(v) => setCampo("prestamo", !!v)}
                    label="Marcar como préstamo"
                    description="El material saldrá temporalmente y se esperará su devolución."
                  />
                )}

                {/* ── Resumen ─────────────────────────────────────────── */}
                <section className="flex flex-col gap-2">
                  <h3 className="text-body-sm font-[var(--font-weight-medium)]">Resumen del movimiento</h3>
                  <dl className="flex flex-col rounded-[var(--radius-md)] border border-border">
                    {[
                      { label: "Tipo", value: getTipoDisplayLabel(tipoPreview) },
                      { label: "Producto", value: selectedProducto ? getProductDisplayName(selectedProducto) : "—" },
                      salidaPorZonas
                        ? totalSalida > 0
                          ? { label: "Cantidad", value: `${totalSalida} uds (total)` }
                          : null
                        : form.cantidad
                        ? {
                            label: "Cantidad",
                            value: `${form.cantidad} ${
                              formatoConfig.kind === "tamano"
                                ? "uds"
                                : formatoConfig.kind === "formato_fijo"
                                ? formatoConfig.value
                                : formatoConfig.unit || ""
                            }`.trim(),
                          }
                        : null,
                      {
                        label: "Origen",
                        value: salidaPorZonas
                          ? `Vivero · ${
                              Object.entries(distribucion)
                                .filter(([, q]) => Number(q) > 0)
                                .map(([k, q]) => {
                                  const [z, t] = k.split("__");
                                  return `${getZonaLabel(z)}·${t}: ${q}`;
                                })
                                .join(", ") || "—"
                            }`
                          : form.origen_tipo === "Vivero"
                          ? `Vivero · ${getZonaLabel(form.zona_origen) || "—"} · ${form.tamano_origen || "—"}`
                          : form.origen_tipo || "—",
                      },
                      {
                        label: "Destino",
                        value:
                          form.destino_tipo === "Vivero"
                            ? `Vivero · ${getZonaLabel(form.zona_destino) || "—"} · ${form.tamano_destino || "—"}`
                            : isExternalDestination(form.destino_tipo)
                            ? [form.destino_tipo, form.distrito_destino, form.barrio_destino, form.direccion_destino]
                                .filter(Boolean)
                                .join(" · ")
                            : form.destino_tipo || "—",
                      },
                      form.pedido_id ? { label: "Pedido", value: `#${form.pedido_id}` } : null,
                      batchPayloads.length > 0
                        ? { label: "En lote", value: `${batchPayloads.length} líneas adicionales` }
                        : null,
                    ]
                      .filter(Boolean)
                      .map(({ label, value }) => (
                        <div
                          key={label}
                          className="grid grid-cols-1 gap-1 border-b border-border px-3 py-2 last:border-b-0 sm:grid-cols-[10rem_1fr] sm:gap-3"
                        >
                          <dt className="text-caption text-muted-foreground">{label}</dt>
                          <dd className="min-w-0 break-words text-body-sm">{value}</dd>
                        </div>
                      ))}
                  </dl>
                </section>
              </div>
            )}

            {/* ── Pie ──────────────────────────────────────────────────── */}
            <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end sm:gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (step === 1) {
                    onClose();
                  } else {
                    setStep((s) => s - 1);
                    setErrors([]);
                  }
                }}
              >
                {step === 1 ? "Cancelar" : "Atrás"}
              </Button>
              {step < 3 && (
                <Button type="button" variant="primary" onClick={avanzar}>
                  Continuar
                </Button>
              )}
              {step === 3 && (
                <Button type="button" variant="primary" onClick={submit} loading={saving}>
                  Confirmar movimiento
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PedidoSelectorModal
        open={showPedidoModal}
        pedidos={pedidosAprobados}
        onClose={() => setShowPedidoModal(false)}
        onSelect={handleSeleccionPedido}
      />

      <PrestamoSelectorModal
        open={showPrestamoModal}
        prestamos={prestamosActivos}
        onClose={() => setShowPrestamoModal(false)}
        onSelect={handleSeleccionPrestamo}
      />
    </>
  );
}
