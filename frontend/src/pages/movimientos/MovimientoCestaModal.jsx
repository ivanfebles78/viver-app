import { useMemo, useState } from "react";
import { Trash2, Plus } from "lucide-react";

import {
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from "../../ui";
import { Alert } from "../../components/ui/feedback";
import SearchField from "../../components/ui/SearchField";
import SelectField from "../../components/ui/SelectField";

import { getProductFormatoConfig, getFormatoOptions } from "../../utils/formato";
import { formatCantidad } from "../../utils/numero";
import { getZonaLabel } from "../../utils/zonas";

import {
  DISTRITO_BARRIOS,
  ENTRADA_ORIGENES,
  ENTRADA_ORIGEN_OTROS,
  SALIDA_DESTINOS,
  getZonasPermitidasParaCategoria,
  naturalSortZonas,
} from "../movimientos.constants";
import {
  buildStockByProductZoneSize,
  getProductDisplayName,
  isExternalDestination,
  safeArray,
} from "../movimientos.logic";

/*
 * CESTA DE MOVIMIENTOS.
 *
 * Se registran varios productos de una vez: se eligen líneas, se acumulan en
 * una cesta y se guardan juntas.
 *
 * TODA la lógica —cálculo de existencias por zona y tamaño, descuento de lo ya
 * puesto en la cesta, validaciones, y la construcción de los payloads— es
 * IDÉNTICA a la de `Movimientos.jsx@693d45c`. Lo único que cambia es la
 * presentación.
 *
 * Qué se va:
 *   - El `div` con `position: fixed` y `backdropFilter: blur(6px)` que hacía de
 *     modal sin trampa de foco, sin Escape y sin devolver el foco al salir.
 *   - Los tres degradados de TIPO_META (verde→cian, rojo→ámbar, índigo→azul).
 *     El tipo se elige con pestañas: es una elección entre tres vistas
 *     excluyentes, que es exactamente lo que un `Tabs` comunica.
 *   - 79 objetos de estilo en línea, 57 colores hexadecimales y 18 `rgba()`.
 */

const TIPOS = [
  { value: "entrada", label: "Entrada", cta: "Registrar entradas" },
  { value: "salida", label: "Salida", cta: "Registrar salidas" },
  { value: "traslado_interno", label: "Traslado", cta: "Registrar traslados" },
];

/** Campo numérico de cantidad, alineado a la derecha y con figuras tabulares. */
function CantidadInput({ label, value, onChange, max, allowDecimals, invalid }) {
  return (
    <Field label={label} error={invalid ? `Solo hay ${formatCantidad(max)} disponibles.` : undefined}>
      <Input
        type="number"
        min="0"
        step={allowDecimals ? "0.01" : "1"}
        max={max != null ? String(max) : undefined}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="tabular text-right"
      />
    </Field>
  );
}

export default function MovimientoCestaModal({
  open,
  onClose,
  productos,
  movimientos,
  zonas,
  onSubmit,
  saving,
}) {
  const stockByProductZoneSize = useMemo(
    () => buildStockByProductZoneSize(movimientos),
    [movimientos]
  );

  const prodById = useMemo(() => {
    const m = new Map();
    for (const p of safeArray(productos)) m.set(String(p.id), p);
    return m;
  }, [productos]);

  const [tipo, setTipo] = useState("salida");
  const [search, setSearch] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroSubcategoria, setFiltroSubcategoria] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [sourceZone, setSourceZone] = useState("");
  const [sizeQty, setSizeQty] = useState({});
  const [zonaQty, setZonaQty] = useState({});
  const [lineZonaDestino, setLineZonaDestino] = useState("");
  const [lineTamanoDestino, setLineTamanoDestino] = useState("");
  const [entradaOrigen, setEntradaOrigen] = useState("");
  const [entradaOtros, setEntradaOtros] = useState("");
  const [destinoTipo, setDestinoTipo] = useState("");
  const [distrito, setDistrito] = useState("");
  const [barrio, setBarrio] = useState("");
  const [direccion, setDireccion] = useState("");
  const [cart, setCart] = useState([]);
  const [localError, setLocalError] = useState("");

  const esEntrada = tipo === "entrada";
  const esSalida = tipo === "salida";
  const esTraslado = tipo === "traslado_interno";

  const resetSeleccion = () => {
    setSelectedProductId("");
    setSizeQty({});
    setZonaQty({});
    setLineZonaDestino("");
    setLineTamanoDestino("");
  };

  /*
   * REINICIOS — antes eran seis `useEffect` que llamaban a `setState` en
   * cuanto cambiaba una dependencia. Cada uno provocaba un render en cascada:
   * React pintaba con el valor viejo, el efecto corría, y volvía a pintar.
   *
   * Todos respondían a una ACCIÓN DEL USUARIO, así que su sitio es el
   * manejador que la atiende, no un efecto. El reinicio al cerrar el modal se
   * resuelve de otra forma: el padre le pasa una `key`, de modo que abrirlo
   * monta una instancia nueva y el estado inicial es el de la declaración.
   *
   * Lo que se reinicia y cuándo está fijado en `MovimientoCestaModal.test.jsx`.
   */

  /** Cambiar de tipo vacía la pantalla: las líneas son propias del tipo. */
  const cambiarTipo = (nuevo) => {
    setTipo(nuevo);
    setSearch("");
    setFiltroCategoria("");
    setFiltroSubcategoria("");
    resetSeleccion();
    setSourceZone("");
    setEntradaOrigen("");
    setEntradaOtros("");
    setDestinoTipo("");
    setDistrito("");
    setBarrio("");
    setDireccion("");
    setCart([]);
    setLocalError("");
  };

  /** La subcategoría depende de la categoría: mantenerla daría una lista vacía. */
  const cambiarCategoria = (valor) => {
    setFiltroCategoria(valor);
    setFiltroSubcategoria("");
  };

  /** El barrio depende del distrito. */
  const cambiarDistrito = (valor) => {
    setDistrito(valor);
    setBarrio("");
  };

  /** Otro producto son otras cantidades: no se arrastran las del anterior. */
  const elegirProducto = (id) => {
    setSelectedProductId(id);
    setSizeQty({});
    setZonaQty({});
    setLineZonaDestino("");
    setLineTamanoDestino("");
  };

  /** Cambiar la zona de origen invalida lo seleccionado en la anterior. */
  const cambiarSourceZone = (valor) => {
    setSourceZone(valor);
    resetSeleccion();
  };

  const zonaIdByLower = useMemo(() => {
    const m = new Map();
    for (const z of safeArray(zonas)) m.set(String(z).toLowerCase(), z);
    return m;
  }, [zonas]);

  const esExterno = isExternalDestination(destinoTipo);
  const esBaja = destinoTipo === "Baja Vivero";

  /* Existencias totales por producto — para salida. Se cuenta TODO el stock
     físico real, sin filtrar por tamaño «estándar», para que los árboles en
     M20 sigan siendo movibles. */
  const stockPorProducto = useMemo(() => {
    const totals = new Map();
    for (const [key, qty] of stockByProductZoneSize.entries()) {
      if (Number(qty) <= 0) continue;
      const pid = key.split("__")[0];
      totals.set(pid, (totals.get(pid) || 0) + Number(qty));
    }
    return totals;
  }, [stockByProductZoneSize]);

  /** Existencias por producto en la zona de origen — solo traslado. */
  const stockEnZonaOrigen = useMemo(() => {
    const totals = new Map();
    if (!sourceZone) return totals;
    const zl = String(sourceZone).toLowerCase();
    for (const [key, qty] of stockByProductZoneSize.entries()) {
      if (Number(qty) <= 0) continue;
      const parts = key.split("__");
      if (parts[1] !== zl) continue;
      totals.set(parts[0], (totals.get(parts[0]) || 0) + Number(qty));
    }
    return totals;
  }, [sourceZone, stockByProductZoneSize]);

  const productosBase = useMemo(() => {
    if (esEntrada) return safeArray(productos);
    if (esTraslado)
      return safeArray(productos).filter((p) => (stockEnZonaOrigen.get(String(p.id)) || 0) > 0);
    return safeArray(productos).filter((p) => (stockPorProducto.get(String(p.id)) || 0) > 0);
  }, [esEntrada, esTraslado, productos, stockEnZonaOrigen, stockPorProducto]);

  const infoStock = (pid) => {
    if (esEntrada) return null;
    if (esTraslado) return stockEnZonaOrigen.get(String(pid)) || 0;
    return stockPorProducto.get(String(pid)) || 0;
  };

  const categoriasDisponibles = useMemo(() => {
    const s = new Set();
    for (const p of productosBase) {
      const c = String(p?.categoria || "").trim();
      if (c) s.add(c);
    }
    return [...s].sort((a, b) => a.localeCompare(b, "es"));
  }, [productosBase]);

  const subcategoriasDisponibles = useMemo(() => {
    if (!filtroCategoria) return [];
    const s = new Set();
    for (const p of productosBase) {
      if (String(p?.categoria || "").trim() !== filtroCategoria) continue;
      const sc = String(p?.subcategoria || "").trim();
      if (sc) s.add(sc);
    }
    return [...s].sort((a, b) => a.localeCompare(b, "es"));
  }, [productosBase, filtroCategoria]);

  const productosFiltrados = useMemo(() => {
    const t = search.trim().toLowerCase();
    return productosBase
      .filter((p) => {
        if (filtroCategoria && String(p.categoria || "").trim() !== filtroCategoria) return false;
        if (filtroSubcategoria && String(p.subcategoria || "").trim() !== filtroSubcategoria) return false;
        if (!t) return true;
        return (
          getProductDisplayName(p).toLowerCase().includes(t) ||
          String(p.categoria || "").toLowerCase().includes(t) ||
          String(p.subcategoria || "").toLowerCase().includes(t)
        );
      })
      .sort((a, b) => getProductDisplayName(a).localeCompare(getProductDisplayName(b), "es"));
  }, [productosBase, search, filtroCategoria, filtroSubcategoria]);

  const selectedProduct = prodById.get(String(selectedProductId)) || null;
  const formatoConfig = getProductFormatoConfig(selectedProduct);
  const allowDecimals = !!formatoConfig?.allowDecimals;

  const zonasDestinoPermitidas = useMemo(
    () => getZonasPermitidasParaCategoria(selectedProduct, zonas),
    [selectedProduct, zonas]
  );

  /*
   * Con una sola zona posible, se fija sola: preguntar por algo sin alternativa
   * es hacer trabajar al usuario para nada.
   *
   * Es estado DERIVADO, así que se calcula al pintar en vez de guardarse. Antes
   * era un efecto que hacía `setState` justo después de pintar: el primer
   * render mostraba el campo vacío y el segundo ya con la zona, y entre los dos
   * había un instante en el que el formulario se creía incompleto.
   */
  const zonaDestinoEfectiva =
    (esEntrada || esTraslado) && selectedProduct && zonasDestinoPermitidas.length === 1
      ? zonasDestinoPermitidas[0]
      : lineZonaDestino;

  /* ENTRADA: se ofrecen TODOS los formatos del producto. `tamanoDisponiblePlanta`
     limita lo que la UTE puede PEDIR, no los movimientos físicos: una planta
     puede entrar o repotarse a cualquier tamaño. */
  const tamanosEntrada = useMemo(() => {
    if (!esEntrada || !selectedProduct) return [];
    return getFormatoOptions(formatoConfig);
  }, [esEntrada, selectedProduct, formatoConfig]);

  /** TRASLADO: tamaños con existencias en la zona origen, menos lo ya en cesta. */
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
      const enCarrito = cart
        .filter(
          (c) =>
            String(c.producto_id) === pid &&
            String(c.zona_origen || "").toLowerCase() === zl &&
            c.tamano_origen === tam
        )
        .reduce((s, c) => s + Number(c.cantidad || 0), 0);
      const disp = Math.max(0, Number(qty) - enCarrito);
      if (disp <= 0) continue;
      rows.push({ tamano: tam, disponible: disp });
    }
    rows.sort((a, b) => String(a.tamano).localeCompare(String(b.tamano)));
    return rows;
  }, [esTraslado, selectedProduct, sourceZone, stockByProductZoneSize, cart]);

  /** SALIDA: zonas con existencias del producto, menos lo ya puesto en cesta. */
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
      const enCarrito = cart
        .filter(
          (c) =>
            String(c.producto_id) === pid &&
            String(c.zona_origen || "").toLowerCase() === zonaLower &&
            c.tamano_origen === tam
        )
        .reduce((s, c) => s + Number(c.cantidad || 0), 0);
      const disp = Math.max(0, Number(qty) - enCarrito);
      if (disp <= 0) continue;
      rows.push({ zonaLower, zona: zonaIdByLower.get(zonaLower) || zonaLower, tamano: tam, disponible: disp });
    }
    rows.sort((a, b) => b.disponible - a.disponible || String(a.tamano).localeCompare(String(b.tamano)));
    return rows;
  }, [esSalida, selectedProduct, stockByProductZoneSize, cart, zonaIdByLower]);

  const totalSeleccionado = useMemo(() => {
    if (esSalida)
      return zonasSalida.reduce((s, r) => s + Number(zonaQty[`${r.zonaLower}__${r.tamano}`] || 0), 0);
    const sizes = esEntrada ? tamanosEntrada : tamanosTraslado.map((r) => r.tamano);
    return sizes.reduce((s, t) => s + Number(sizeQty[t] || 0), 0);
  }, [esSalida, esEntrada, zonasSalida, zonaQty, tamanosEntrada, tamanosTraslado, sizeQty]);

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
      if (!zonaDestinoEfectiva) {
        setLocalError("Elige la zona destino de este producto.");
        return;
      }
      for (const tam of tamanosEntrada) {
        let q = Number(sizeQty[tam] || 0);
        if (!allowDecimals) q = Math.round(q);
        if (q <= 0) continue;
        nuevos.push({
          key: `${selectedProduct.id}-${tam}-${cart.length}-${nuevos.length}`,
          tipo: "entrada",
          producto_id: selectedProduct.id,
          nombre,
          tamano_destino: tam,
          zona_destino: zonaDestinoEfectiva,
          cantidad: q,
        });
      }
      if (nuevos.length === 0) {
        setLocalError("Indica cuántas unidades entran de al menos un tamaño.");
        return;
      }
    } else if (esTraslado) {
      if (!zonaDestinoEfectiva) {
        setLocalError("Elige la zona destino del traslado.");
        return;
      }
      for (const r of tamanosTraslado) {
        let q = Number(sizeQty[r.tamano] || 0);
        if (!allowDecimals) q = Math.round(q);
        if (q <= 0) continue;
        if (q > r.disponible) {
          setLocalError(`En ${getZonaLabel(sourceZone)} · ${r.tamano} solo hay ${r.disponible} disponibles.`);
          return;
        }
        nuevos.push({
          key: `${selectedProduct.id}-${r.tamano}-${cart.length}-${nuevos.length}`,
          tipo: "traslado_interno",
          producto_id: selectedProduct.id,
          nombre,
          zona_origen: sourceZone,
          tamano_origen: r.tamano,
          zona_destino: zonaDestinoEfectiva,
          tamano_destino: lineTamanoDestino || r.tamano,
          cantidad: q,
        });
      }
      if (nuevos.length === 0) {
        setLocalError("Indica cuántas unidades trasladar de al menos un tamaño.");
        return;
      }
    } else {
      for (const r of zonasSalida) {
        const rk = `${r.zonaLower}__${r.tamano}`;
        let q = Number(zonaQty[rk] || 0);
        if (!allowDecimals) q = Math.round(q);
        if (q <= 0) continue;
        if (q > r.disponible) {
          setLocalError(`En ${getZonaLabel(r.zona)} · ${r.tamano} solo hay ${r.disponible} disponibles.`);
          return;
        }
        nuevos.push({
          key: `${selectedProduct.id}-${rk}-${cart.length}-${nuevos.length}`,
          tipo: "salida",
          producto_id: selectedProduct.id,
          nombre,
          zona_origen: r.zona,
          tamano_origen: r.tamano,
          cantidad: q,
        });
      }
      if (nuevos.length === 0) {
        setLocalError("Indica cuántas unidades sacar de al menos una zona.");
        return;
      }
    }
    setCart((prev) => [...prev, ...nuevos]);
    resetSeleccion();
  };

  const compartidoValido = esEntrada
    ? !!entradaOrigen && (entradaOrigen !== ENTRADA_ORIGEN_OTROS || !!entradaOtros.trim())
    : esSalida
    ? !!destinoTipo && (esBaja || (!!distrito && !!barrio && !!String(direccion).trim()))
    : true;

  const canSubmit = !saving && cart.length > 0 && compartidoValido;

  const submit = async () => {
    setLocalError("");
    if (cart.length === 0) {
      setLocalError("Añade al menos un producto al carrito.");
      return;
    }
    if (esEntrada && !entradaOrigen) {
      setLocalError("Elige el origen de la entrada.");
      return;
    }
    if (esEntrada && entradaOrigen === ENTRADA_ORIGEN_OTROS && !entradaOtros.trim()) {
      setLocalError("Especifica el origen de la entrada.");
      return;
    }
    if (esSalida && !destinoTipo) {
      setLocalError("Elige el destino de la salida.");
      return;
    }
    if (esSalida && esExterno && (!distrito || !barrio || !String(direccion).trim())) {
      setLocalError("Indica distrito, barrio y dirección de destino.");
      return;
    }

    const origenEntradaFinal =
      entradaOrigen === ENTRADA_ORIGEN_OTROS && entradaOtros.trim()
        ? entradaOtros.trim().slice(0, 30)
        : entradaOrigen;

    const base = () => ({
      pedido_id: null,
      pedido_item_id: null,
      cp_destino: null,
      observaciones: null,
      nota: null,
      es_prestamo: false,
      es_devolucion: false,
      prestamo_referencia_id: null,
      fecha_disponibilidad: null,
      fecha_movimiento: null,
    });

    const payloads = cart.map((c) => {
      if (c.tipo === "entrada") {
        return {
          ...base(),
          producto_id: Number(c.producto_id),
          origen_tipo: origenEntradaFinal,
          destino_tipo: "Vivero",
          tamano_origen: null,
          tamano_destino: c.tamano_destino || null,
          zona_origen: null,
          zona_destino: c.zona_destino,
          distrito_destino: null,
          barrio_destino: null,
          direccion_destino: null,
          cantidad: c.cantidad,
        };
      }
      if (c.tipo === "traslado_interno") {
        return {
          ...base(),
          producto_id: Number(c.producto_id),
          origen_tipo: "Vivero",
          destino_tipo: "Vivero",
          tamano_origen: c.tamano_origen || null,
          tamano_destino: c.tamano_destino || c.tamano_origen || null,
          zona_origen: c.zona_origen,
          zona_destino: c.zona_destino,
          distrito_destino: null,
          barrio_destino: null,
          direccion_destino: null,
          cantidad: c.cantidad,
        };
      }
      return {
        ...base(),
        producto_id: Number(c.producto_id),
        origen_tipo: "Vivero",
        destino_tipo: destinoTipo,
        tamano_origen: c.tamano_origen || null,
        tamano_destino: null,
        zona_origen: c.zona_origen,
        zona_destino: null,
        distrito_destino: esExterno ? distrito || null : null,
        barrio_destino: esExterno ? barrio || null : null,
        direccion_destino: esExterno ? String(direccion).trim() || null : null,
        cantidad: c.cantidad,
      };
    });

    await onSubmit(payloads);
  };

  const totalUds = cart.reduce((s, c) => s + Number(c.cantidad || 0), 0);
  const barriosDisp = distrito ? DISTRITO_BARRIOS[distrito] || [] : [];
  const DISTRITOS = Object.keys(DISTRITO_BARRIOS);
  const tamanosDestinoTraslado = getFormatoOptions(formatoConfig);
  const ctaLabel = TIPOS.find((t) => t.value === tipo)?.cta || "Registrar";

  /*
   * El cuerpo se monta DENTRO del panel de la pestaña activa. No es un detalle
   * de estilo: cada `TabsTrigger` declara `aria-controls` apuntando a su panel,
   * y si el panel no existe el atributo apunta al vacío — axe lo marca como
   * violación crítica (`aria-valid-attr-value`), y un lector de pantalla
   * anuncia una pestaña que no controla nada.
   */
  const cuerpo = () => (
    <div className="flex flex-col gap-4 pt-4">
      {localError && <Alert tone="error">{localError}</Alert>}

          {esTraslado && (
            <SelectField
              label="Zona de origen"
              value={sourceZone}
              onChange={cambiarSourceZone}
              allLabel={null}
              placeholder="Elige la zona de la que sale el material"
              options={zonasConStockGlobal.map((z) => ({ value: String(z), label: getZonaLabel(z) }))}
            />
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {/* ── Selección de producto ─────────────────────────────────── */}
            <section aria-labelledby="cesta-productos" className="flex min-w-0 flex-col gap-3">
              <h3 id="cesta-productos" className="text-h5 font-[var(--font-weight-semibold)]">
                {esTraslado && !sourceZone ? "Elige antes la zona de origen" : "Producto"}
              </h3>

              <SearchField
                label="Buscar producto"
                hideLabel={false}
                value={search}
                onChange={setSearch}
                placeholder="Nombre, categoría o subcategoría"
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SelectField
                  label="Categoría"
                  value={filtroCategoria}
                  onChange={cambiarCategoria}
                  options={categoriasDisponibles.map((c) => ({ value: c, label: c }))}
                />
                <SelectField
                  label="Subcategoría"
                  value={filtroSubcategoria}
                  onChange={setFiltroSubcategoria}
                  options={subcategoriasDisponibles.map((c) => ({ value: c, label: c }))}
                />
              </div>

              {/* Lista de productos. `radiogroup` porque es exactamente eso:
                  una elección única entre opciones, navegable con flechas. */}
              <div
                role="radiogroup"
                aria-label="Productos disponibles"
                className="max-h-72 overflow-y-auto rounded-[var(--radius-md)] border border-border"
              >
                {productosFiltrados.length === 0 ? (
                  <p className="p-4 text-body-sm text-muted-foreground">
                    {esTraslado && !sourceZone
                      ? "Elige una zona de origen para ver qué hay disponible."
                      : "Ningún producto coincide con la búsqueda."}
                  </p>
                ) : (
                  productosFiltrados.map((p) => {
                    const activo = String(p.id) === String(selectedProductId);
                    const stock = infoStock(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={activo}
                        onClick={() => elegirProducto(String(p.id))}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left last:border-b-0",
                          "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                          activo && "bg-accent"
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body-sm">{getProductDisplayName(p)}</span>
                          {p.categoria && (
                            <span className="block truncate text-caption text-muted-foreground">
                              {p.categoria}
                              {p.subcategoria ? ` · ${p.subcategoria}` : ""}
                            </span>
                          )}
                        </span>
                        {stock != null && (
                          <span className="tabular shrink-0 text-caption text-muted-foreground">
                            {formatCantidad(stock)} ud.
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            {/* ── Cantidades de la línea ────────────────────────────────── */}
            <section aria-labelledby="cesta-cantidades" className="flex min-w-0 flex-col gap-3">
              <h3 id="cesta-cantidades" className="text-h5 font-[var(--font-weight-semibold)]">
                Cantidades
              </h3>

              {!selectedProduct ? (
                <EmptyState
                  title="Elige un producto"
                  description="Selecciona uno de la lista para indicar cuántas unidades mover."
                />
              ) : (
                <div className="flex flex-col gap-3">
                  {(esEntrada || esTraslado) && (
                    <SelectField
                      label="Zona de destino"
                      value={zonaDestinoEfectiva}
                      onChange={setLineZonaDestino}
                      allLabel={null}
                      placeholder="Elige la zona"
                      options={zonasDestinoPermitidas.map((z) => ({
                        value: String(z),
                        label: getZonaLabel(z),
                      }))}
                    />
                  )}

                  {esTraslado && (
                    <SelectField
                      label="Tamaño de destino"
                      description="Déjalo en «Mismo tamaño» si no se repota."
                      value={lineTamanoDestino}
                      onChange={setLineTamanoDestino}
                      allLabel="Mismo tamaño"
                      options={tamanosDestinoTraslado.map((t) => ({ value: t, label: t }))}
                    />
                  )}

                  {esEntrada &&
                    tamanosEntrada.map((t) => (
                      <CantidadInput
                        key={t}
                        label={t}
                        allowDecimals={allowDecimals}
                        value={sizeQty[t]}
                        onChange={(v) => setSizeQty((prev) => ({ ...prev, [t]: v }))}
                      />
                    ))}

                  {esTraslado &&
                    tamanosTraslado.map((r) => (
                      <CantidadInput
                        key={r.tamano}
                        label={`${r.tamano} — ${formatCantidad(r.disponible)} disponibles`}
                        max={r.disponible}
                        allowDecimals={allowDecimals}
                        value={sizeQty[r.tamano]}
                        invalid={Number(sizeQty[r.tamano] || 0) > r.disponible}
                        onChange={(v) => setSizeQty((prev) => ({ ...prev, [r.tamano]: v }))}
                      />
                    ))}

                  {esSalida &&
                    zonasSalida.map((r) => {
                      const rk = `${r.zonaLower}__${r.tamano}`;
                      return (
                        <CantidadInput
                          key={rk}
                          label={`${getZonaLabel(r.zona)} · ${r.tamano} — ${formatCantidad(r.disponible)} disponibles`}
                          max={r.disponible}
                          allowDecimals={allowDecimals}
                          value={zonaQty[rk]}
                          invalid={Number(zonaQty[rk] || 0) > r.disponible}
                          onChange={(v) => setZonaQty((prev) => ({ ...prev, [rk]: v }))}
                        />
                      );
                    })}

                  <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                    <span className="text-body-sm text-muted-foreground">
                      Seleccionado:{" "}
                      <span className="tabular font-[var(--font-weight-medium)] text-foreground">
                        {formatCantidad(totalSeleccionado)}
                      </span>
                    </span>
                    <Button type="button" variant="secondary" onClick={addToCart}>
                      <Plus aria-hidden="true" className="size-4" />
                      Añadir a la cesta
                    </Button>
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* ── Cesta ───────────────────────────────────────────────────── */}
          <section aria-labelledby="cesta-lineas" className="flex flex-col gap-2">
            <h3 id="cesta-lineas" className="text-h5 font-[var(--font-weight-semibold)]">
              Cesta{" "}
              <span className="tabular text-body-sm font-[var(--font-weight-regular)] text-muted-foreground">
                ({cart.length} línea{cart.length === 1 ? "" : "s"} · {formatCantidad(totalUds)} ud.)
              </span>
            </h3>

            {cart.length === 0 ? (
              <p className="text-body-sm text-muted-foreground">
                Todavía no has añadido nada. Elige un producto e indica las cantidades.
              </p>
            ) : (
              <ul className="flex flex-col rounded-[var(--radius-md)] border border-border">
                {cart.map((c) => (
                  <li
                    key={c.key}
                    className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-sm">{c.nombre}</span>
                      <span className="block truncate text-caption text-muted-foreground">
                        {c.tipo === "entrada" &&
                          `Entrada · ${c.tamano_destino} → ${getZonaLabel(c.zona_destino)}`}
                        {c.tipo === "traslado_interno" &&
                          `Traslado · ${getZonaLabel(c.zona_origen)} ${c.tamano_origen} → ${getZonaLabel(
                            c.zona_destino
                          )} ${c.tamano_destino}`}
                        {c.tipo === "salida" &&
                          `Salida · ${getZonaLabel(c.zona_origen)} · ${c.tamano_origen}`}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-body-sm font-[var(--font-weight-medium)]">
                      {formatCantidad(c.cantidad)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      label={`Quitar ${c.nombre} de la cesta`}
                      onClick={() => removeCart(c.key)}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Datos compartidos ───────────────────────────────────────── */}
          {esEntrada && (
            <section aria-labelledby="cesta-origen" className="flex flex-col gap-3">
              <h3 id="cesta-origen" className="text-h5 font-[var(--font-weight-semibold)]">
                Origen de la entrada
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SelectField
                  label="Procedencia"
                  required
                  value={entradaOrigen}
                  onChange={setEntradaOrigen}
                  allLabel={null}
                  placeholder="¿De dónde llega?"
                  options={ENTRADA_ORIGENES.map((o) => ({ value: o, label: o }))}
                />
                {entradaOrigen === ENTRADA_ORIGEN_OTROS && (
                  <Field label="Especifica la procedencia" required description="Máximo 30 caracteres.">
                    <Input
                      value={entradaOtros}
                      maxLength={30}
                      onChange={(e) => setEntradaOtros(e.target.value)}
                    />
                  </Field>
                )}
              </div>
            </section>
          )}

          {esSalida && (
            <section aria-labelledby="cesta-destino" className="flex flex-col gap-3">
              <h3 id="cesta-destino" className="text-h5 font-[var(--font-weight-semibold)]">
                Destino de la salida
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SelectField
                  label="Destino"
                  required
                  value={destinoTipo}
                  onChange={setDestinoTipo}
                  allLabel={null}
                  placeholder="¿A dónde va?"
                  options={SALIDA_DESTINOS.map((d) => ({ value: d, label: d }))}
                />
                {esExterno && (
                  <>
                    <SelectField
                      label="Distrito"
                      required
                      value={distrito}
                      onChange={cambiarDistrito}
                      allLabel={null}
                      placeholder="Elige distrito"
                      options={DISTRITOS.map((d) => ({ value: d, label: d }))}
                    />
                    <SelectField
                      label="Barrio"
                      required
                      value={barrio}
                      onChange={setBarrio}
                      allLabel={null}
                      placeholder={distrito ? "Elige barrio" : "Elige antes un distrito"}
                      options={barriosDisp.map((b) => ({ value: b, label: b }))}
                    />
                    <Field label="Dirección" required className="sm:col-span-2">
                      <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
                    </Field>
                  </>
                )}
              </div>
            </section>
          )}

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end sm:gap-3">
        <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button type="button" variant="primary" onClick={submit} disabled={!canSubmit} loading={saving}>
          {ctaLabel}
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent
        title="Nuevo movimiento"
        description="Añade uno o varios productos y regístralos juntos."
        closeLabel="Cerrar"
        size="lg"
        className="max-w-[var(--modal-width-xl)]"
      >
        {/* Tres vistas excluyentes: es lo que un grupo de pestañas comunica.
            Antes eran tres píldoras con un degradado distinto cada una. */}
        <Tabs value={tipo} onValueChange={cambiarTipo}>
          <TabsList>
            {TIPOS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {/* Radix solo monta el panel activo, así que `cuerpo()` se evalúa una
              vez; los tres declarados garantizan que cada trigger tenga panel. */}
          {TIPOS.map((t) => (
            <TabsContent key={t.value} value={t.value}>
              {tipo === t.value && cuerpo()}
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
