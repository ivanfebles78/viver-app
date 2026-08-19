import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  getProductos,
  createPedido,
  updateProductoInterno,
  createProducto,
  updateProducto,
  deleteProducto,
  importarProductos,
} from "../api/api";
import { formatCantidad, formatCantidadConUnidad, formatEnteroConUnidad } from "../utils/numero";
import { rolEfectivo } from "../utils/roles";
import {
  Button,
  Dialog,
  DialogContent,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../ui";
import { Alert } from "../components/ui/feedback";
import { useConfirm } from "../components/ui/ConfirmDialog";
import {
  CSV_FILENAME,
  construirCsvProductos,
  construirPayloadNuevo,
  fmtErr,
  norm,
  productCommonName,
  productScientificName,
  puedeGestionar as puedeGestionarLogica,
  puedeMarcarInterno as puedeMarcarInternoLogica,
  puedePedirMas as puedePedirMasLogica,
  validarNuevoProducto,
} from "./productos.logic";
import {
  getUnidadProducto,
  getProductFormatoConfig,
  getFormatoOptions,
} from "../utils/formato";
import VerPlanta from "../components/VerPlanta";
import { usePlantsWithImage } from "../utils/plantImages";

const TAMANOS = ["Semillero", "M12", "M20", "M35"];

// Fila memoizada de producto: solo se re-renderiza cuando cambia su producto
// o alguna de sus props funcionales. Sin memoización, al pulsar "Pedir más"
// React re-renderiza las cientos de filas porque el padre cambia de estado.
// Con memo + handlers estables (useCallback) cada fila se queda intacta, lo
// que hace que el modal aparezca instantáneamente.
const ProductoRow = memo(function ProductoRow({
  p,
  esEmpresaExterna,
  puedeMarcarInterno,
  puedePedirMas,
  onToggleInterno,
  onPedirMas,
}) {
  const stock = Number(p.stock ?? 0);
  const min = p.stock_minimo;
  const low =
    !esEmpresaExterna &&
    min !== null &&
    min !== undefined &&
    Number.isFinite(Number(min)) &&
    stock < Number(min);
  // Cacheamos la unidad por fila — antes se llamaba dos veces (stock y mínimo).
  const unidad = getUnidadProducto(p);

  return (
    /*
      La fila entera se teñía de `crimson` cuando el stock estaba bajo mínimo.
      Dos problemas: el color era el ÚNICO canal (SC 1.4.1), y teñir el nombre
      del producto de rojo hace leer «producto erróneo» en vez de «hay que
      reponer». Ahora el aviso va donde está el dato —la cifra de stock— y con
      una insignia que lleva texto.
    */
    <tr>
      <td>
        <div style={{ fontWeight: "var(--font-weight-semibold)" }}>
          <VerPlanta nombreCientifico={p.nombre_cientifico} nombreNatural={p.nombre_natural} variant="link" stopPropagation={false}>
            {productScientificName(p)}
          </VerPlanta>
        </div>
      </td>
      <td>
        <div style={{ color: "var(--muted-foreground)", fontWeight: "var(--font-weight-medium)" }}>{productCommonName(p)}</div>
      </td>
      <td>{p.categoria ?? "-"}</td>
      <td>{p.subcategoria ?? "-"}</td>
      <td style={{ textAlign: "center" }}>
        <span className="inline-flex items-center justify-center gap-2">
          <span className="tabular font-[var(--font-weight-medium)]">
            {formatEnteroConUnidad(stock, unidad) || "0"}
          </span>
          {low && <StatusBadge status="pending" label="Bajo mínimo" />}
        </span>
      </td>
      {!esEmpresaExterna && (
        <td style={{ textAlign: "center" }}>
          {p.stock_minimo === null || p.stock_minimo === undefined
            ? "-"
            : formatCantidadConUnidad(p.stock_minimo, unidad)}
        </td>
      )}
      {puedeMarcarInterno && (
        <td style={{ textAlign: "center" }}>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              fontWeight: "var(--font-weight-medium)",
              color: p.es_interno ? "var(--warning-subtle-foreground)" : "var(--muted-foreground)",
            }}
            title={
              p.es_interno
                ? "Interno: oculto para Empresa Externa"
                : "Visible para todos los roles"
            }
          >
            <input
              type="checkbox"
              checked={!!p.es_interno}
              onChange={() => onToggleInterno(p)}
              style={{ width: 16, height: 16, cursor: "pointer" }}
            />
            {p.es_interno ? "Sí" : "No"}
          </label>
        </td>
      )}
      {puedePedirMas && (
        <td style={{ textAlign: "center" }}>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => onPedirMas(p)}
            title="Añadir este producto a la cesta de reposición"
          >
            Pedir más
          </Button>
        </td>
      )}
    </tr>
  );
});


function PedirMasModal({ open, producto, onClose, onAddToCart, saving }) {
  // El modal "pedir más" usa la lógica de formato/cantidad por categoría
  // (la misma que en Movimientos) para que fitosanitarios pidan formato
  // (Líquido/Polvo/…) en lugar de "M12", y áridos/ferretería rellenen su
  // unidad automáticamente.
  const formatoConfig = useMemo(
    () => getProductFormatoConfig(producto),
    [producto]
  );
  const opcionesFormato = useMemo(
    () => getFormatoOptions(formatoConfig),
    [formatoConfig]
  );

  const valorPorDefectoFormato = () => {
    if (formatoConfig.kind === "formato_fijo") return formatoConfig.value;
    return ""; // que el usuario elija explícitamente
  };

  const [tamano, setTamano] = useState(valorPorDefectoFormato());
  const [cantidad, setCantidad] = useState("");
  const [nota, setNota] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (open) {
      setTamano(valorPorDefectoFormato());
      setCantidad("");
      setNota("");
      setErr("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, producto?.id]);

  if (!open || !producto) return null;

  // Etiqueta dinámica de cantidad (Líquido → "Litros"; resto fito → "Kg";
  // áridos → "Cantidad (m³)", etc.).
  const cantidadLabel =
    formatoConfig.kind === "formato_dropdown" && typeof formatoConfig.getCantidadLabel === "function"
      ? formatoConfig.getCantidadLabel(tamano)
      : formatoConfig.cantidadLabel || "Cantidad";

  const submit = async () => {
    setErr("");
    const q = Number(cantidad);
    if (!q || q <= 0) {
      setErr("La cantidad debe ser mayor que 0.");
      return;
    }
    if (!tamano && formatoConfig.kind !== "formato_fijo") {
      setErr(`Selecciona ${formatoConfig.label.toLowerCase()}.`);
      return;
    }
    const tamanoEfectivo = tamano || formatoConfig.value || "";
    try {
      await onAddToCart({
        producto_id: producto.id,
        producto_nombre: producto.nombre_cientifico || producto.nombre_natural || `Producto #${producto.id}`,
        producto_categoria: producto.categoria,
        tamano: tamanoEfectivo,
        cantidad: q,
        nota,
      });
    } catch (e) {
      setErr(fmtErr(e));
    }
  };

  /*
   * DEFECTO CORREGIDO EN LA AUDITORÍA FINAL. Era un `div` con
   * `position: fixed`: sin `role="dialog"`, sin trampa de foco, sin cierre con
   * Escape y sin devolver el foco al cerrarse. Un usuario de teclado quedaba
   * tabulando por detrás del modal sin saberlo. axe no lo detecta —el
   * atrapamiento del foco no se ve en una foto del DOM—, así que sobrevivió a
   * las revisiones anteriores.
   */
  return (
    <Dialog open={open} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent
        title="Añadir a la cesta"
        description="Selecciona formato y cantidad. Podrás añadir más productos antes de finalizar el pedido de reposición."
        closeLabel="Cerrar"
        size="md"
      >
      <div className="flex min-w-0 flex-col">

        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: "var(--radius-md)",
            background: "var(--muted)",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>
            {productScientificName(producto)}
          </div>
          <div style={{ marginTop: 4, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)", fontSize: 13 }}>
            Nombre común: {productCommonName(producto)}
          </div>
          <div style={{ marginTop: 4, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-medium)", fontSize: 13 }}>
            {(producto.categoria || "—") + " · " + (producto.subcategoria || "—")}
          </div>
          <div style={{ marginTop: 4, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-medium)", fontSize: 13 }}>
            Origen: Empresa Externa · Destino: Vivero
          </div>
        </div>

        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {formatoConfig.kind !== "formato_fijo" ? (
            <div>
              <div style={{ fontSize: 12, fontWeight: "var(--font-weight-semibold)", color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase" }}>
                {formatoConfig.label}
              </div>
              <select
                aria-label="Tamaño"
                value={tamano}
                onChange={(e) => setTamano(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border)",
                  fontWeight: "var(--font-weight-medium)",
                }}
              >
                <option value="">{`Seleccionar ${formatoConfig.label.toLowerCase()}`}</option>
                {opcionesFormato.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          ) : null}
          <div style={formatoConfig.kind === "formato_fijo" ? { gridColumn: "span 2" } : undefined}>
            {/*
             * DEFECTO CORREGIDO: «CANTIDAD» era un `div` suelto, no una
             * etiqueta. El campo llegaba al lector de pantalla sin nombre —y es
             * el único dato que el usuario teclea en este modal—, así que se
             * anunciaba solo como «editar número».
             */}
            <label
              htmlFor="pedir-mas-cantidad"
              style={{ display: "block", fontSize: 12, fontWeight: "var(--font-weight-semibold)", color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase" }}
            >
              {cantidadLabel}
            </label>
            <input
              id="pedir-mas-cantidad"
              type="number"
              min={formatoConfig.allowDecimals ? "0.001" : 1}
              step={formatoConfig.allowDecimals ? "0.001" : "1"}
              value={cantidad}
              onChange={(e) => setCantidad(formatoConfig.allowDecimals ? e.target.value : e.target.value.replace(/[^\d]/g, ""))}
              placeholder={formatoConfig.allowDecimals ? "0.00" : "0"}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)",
                fontWeight: "var(--font-weight-medium)",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label htmlFor="prod-nota-opcional" style={{ fontSize: 12, fontWeight: "var(--font-weight-semibold)", color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase" }}>
            Nota (opcional)
          </label>
          <textarea id="prod-nota-opcional"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Motivo de la reposición..."
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              fontWeight: "var(--font-weight-medium)",
              minHeight: 80,
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
        </div>

        {err ? (
          <div
            style={{
              marginTop: 12,
              padding: 10,
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

        <div style={{ marginTop: 16, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: "10px 16px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              background: "var(--card)",
              color: "var(--foreground)",
              fontWeight: "var(--font-weight-semibold)",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={saving}
            style={{
              padding: "10px 16px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              background: "var(--primary)",
              color: "var(--primary-foreground)",
              fontWeight: "var(--font-weight-semibold)",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Añadiendo..." : "Añadir a la cesta"}
          </button>
        </div>
      </div>
      </DialogContent>
    </Dialog>
  );
}


function CartModal({ open, cart, onClose, onRemove, onUpdate, onFinalizar, onAddMore, saving, errorMsg }) {
  // La nota arranca vacía en cada apertura porque el padre remonta el modal con
  // una `key`; antes era un efecto que hacía `setState` justo al abrirse.
  const [nota, setNota] = useState("");

  if (!open) return null;

  const total = cart.reduce((sum, it) => sum + Number(it.cantidad || 0), 0);
  const lineCount = cart.length;

  /*
   * Mismo defecto que en «Pedir más», corregido en la auditoría final: era un
   * `div` con `position: fixed`, sin rol, sin trampa de foco, sin Escape y sin
   * devolución del foco. Además su cierre al pulsar el fondo no distinguía un
   * clic de soltar una selección de texto, así que arrastrar para seleccionar
   * dentro de la cesta la cerraba y perdía el pedido a medio montar.
   */
  return (
    <Dialog open={open} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent
        title="Cesta de reposición"
        description={
          lineCount === 0
            ? "Aún no has añadido productos a la cesta."
            : `${lineCount} ${lineCount === 1 ? "línea" : "líneas"} · ${formatCantidad(total)} unidades totales`
        }
        closeLabel="Cerrar"
        size="lg"
      >
      <div className="flex max-h-[75dvh] min-w-0 flex-col overflow-y-auto">
        {/*
          El título, la bajada y el botón de cierre los pinta ya `DialogContent`.
          Aquí había una segunda cabecera con su propia «×»: dos controles de
          cierre distintos para lo mismo, el mismo defecto que se corrigió en
          «Gestionar productos» en la Fase 5.
        */}

        {/* Lista de items */}
        <div style={{ overflowY: "auto", marginTop: 8, marginBottom: 12, flex: 1 }}>
          {cart.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: "var(--muted-foreground)",
                fontWeight: "var(--font-weight-medium)",
                border: "1px dashed var(--border)",
                borderRadius: "var(--radius-lg)",
                background: "var(--muted)",
              }}
            >
              Pulsa "Pedir más" en cualquier producto del listado para empezar.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {cart.map((it, idx) => {
                const unidad = getUnidadProducto({ categoria: it.producto_categoria, nombre_cientifico: it.producto_nombre });
                const itemDecimales = getProductFormatoConfig({ categoria: it.producto_categoria, nombre_cientifico: it.producto_nombre }).allowDecimals;
                return (
                  <div
                    key={`${it.producto_id}-${it.tamano}-${idx}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 140px 90px 40px",
                      gap: 10,
                      alignItems: "center",
                      padding: "10px 14px",
                      borderRadius: "var(--radius-md)",
                      background: "var(--muted)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)" }}>{it.producto_nombre}</div>
                      <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-medium)", marginTop: 2 }}>
                        {it.producto_categoria || "—"} · Tamaño/Formato: <strong>{it.tamano || "—"}</strong>
                      </div>
                    </div>
                    <input
                      type="number"
                      min={itemDecimales ? 0.001 : 1}
                      step={itemDecimales ? "any" : "1"}
                      value={it.cantidad}
                      onChange={(e) => onUpdate(idx, { cantidad: itemDecimales ? e.target.value : e.target.value.replace(/[^\d]/g, "") })}
                      style={{
                        padding: "8px 10px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border)",
                        fontWeight: "var(--font-weight-semibold)",
                        textAlign: "right",
                      }}
                    />
                    <div style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--muted-foreground)", fontSize: 13 }}>{unidad}</div>
                    <button
                      type="button"
                      onClick={() => onRemove(idx)}
                      disabled={saving}
                      title="Quitar de la cesta"
                      style={{
                        padding: "6px 10px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border)",
                        background: "var(--danger-subtle)",
                        color: "var(--danger-subtle-foreground)",
                        fontWeight: "var(--font-weight-semibold)",
                        cursor: saving ? "not-allowed" : "pointer",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Nota general del pedido */}
        {cart.length > 0 ? (
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 12, fontWeight: "var(--font-weight-semibold)", color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase" }}>
              Nota del pedido (opcional)
            </div>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Motivo de la reposición, urgencia, observaciones..."
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)",
                fontWeight: "var(--font-weight-medium)",
                minHeight: 60,
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>
        ) : null}

        {/* Mensaje de error global */}
        {errorMsg ? (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: "var(--radius-md)",
              background: "var(--danger-subtle)",
              border: "1px solid var(--border)",
              color: "var(--danger-subtle-foreground)",
              fontWeight: "var(--font-weight-semibold)",
            }}
          >
            {errorMsg}
          </div>
        ) : null}

        {/* Botones */}
        <div style={{ marginTop: 16, display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onAddMore}
            disabled={saving}
            style={{
              padding: "10px 16px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              background: "var(--info-subtle)",
              color: "var(--info-subtle-foreground)",
              fontWeight: "var(--font-weight-semibold)",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            ＋ Añadir otro producto
          </button>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: "10px 16px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)",
                background: "var(--card)",
                color: "var(--foreground)",
                fontWeight: "var(--font-weight-semibold)",
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              Seguir comprando
            </button>
            <button
              type="button"
              onClick={() => onFinalizar(nota)}
              disabled={saving || cart.length === 0}
              style={{
                padding: "10px 18px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)",
                background: (saving || cart.length === 0) ? "var(--muted)" : "var(--primary)",
                color: (saving || cart.length === 0)
                  ? "var(--muted-foreground)"
                  : "var(--primary-foreground)",
                fontWeight: "var(--font-weight-semibold)",
                cursor: (saving || cart.length === 0) ? "not-allowed" : "pointer",
                minWidth: 180,
              }}
            >
              {saving ? "Enviando..." : "Finalizar pedido"}
            </button>
          </div>
        </div>
      </div>
      </DialogContent>
    </Dialog>
  );
}


function GestionProductosModal({ open, productos, onClose, onChanged }) {
  const [tab, setTab] = useState("listado");
  const [search, setSearch] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroSubcategoria, setFiltroSubcategoria] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  // Confirmación de acciones destructivas. Devuelve promesa: ver `removeProduct`.
  const { confirmar, dialogo: dialogoConfirmacion } = useConfirm();
  const [nuevo, setNuevo] = useState({
    nombre_cientifico: "",
    nombre_natural: "",
    categoria: "",
    subcategoria: "",
    stock_minimo: 0,
    es_interno: false,
    precio: "",
  });
  const [nuevoCategoriaSel, setNuevoCategoriaSel] = useState("");
  const [nuevoSubcategoriaSel, setNuevoSubcategoriaSel] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [file, setFile] = useState(null);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => {
    if (!open) {
      setTab("listado");
      setSearch("");
      setEditingId(null);
      setEditForm({});
      setNuevo({
        nombre_cientifico: "",
        nombre_natural: "",
        categoria: "",
        subcategoria: "",
        stock_minimo: 0,
        es_interno: false,
        precio: "",
      });
      setNuevoCategoriaSel("");
      setNuevoSubcategoriaSel("");
      setSaving(false);
      setMsg("");
      setErr("");
      setFile(null);
      setImportResult(null);
    }
  }, [open]);

  const showMsg = (text) => {
    setMsg(text);
    setErr("");
    setTimeout(() => setMsg(""), 3000);
  };
  const showErr = (text) => {
    setErr(text);
    setMsg("");
  };

  // Categorías y subcategorías presentes en el catálogo (para los desplegables).
  const categoriasDisponibles = useMemo(() => {
    const set = new Set();
    for (const p of Array.isArray(productos) ? productos : []) {
      const c = String(p?.categoria || "").trim();
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [productos]);

  const subcategoriasDisponibles = useMemo(() => {
    if (!filtroCategoria) return [];
    const set = new Set();
    for (const p of Array.isArray(productos) ? productos : []) {
      if (String(p?.categoria || "").trim() !== filtroCategoria) continue;
      const s = String(p?.subcategoria || "").trim();
      if (s) set.add(s);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [productos, filtroCategoria]);

  // Al cambiar de categoría, se limpia la subcategoría (dependen entre sí).
  useEffect(() => {
    setFiltroSubcategoria("");
  }, [filtroCategoria]);

  const productosFiltrados = useMemo(() => {
    const t = search.trim().toLowerCase();
    const base = Array.isArray(productos) ? productos : [];
    return base.filter((p) => {
      if (filtroCategoria && String(p.categoria || "").trim() !== filtroCategoria) return false;
      if (filtroSubcategoria && String(p.subcategoria || "").trim() !== filtroSubcategoria) return false;
      if (!t) return true;
      return (
        String(p.nombre_cientifico || "").toLowerCase().includes(t) ||
        String(p.nombre_natural || "").toLowerCase().includes(t) ||
        String(p.categoria || "").toLowerCase().includes(t) ||
        String(p.subcategoria || "").toLowerCase().includes(t)
      );
    });
  }, [productos, search, filtroCategoria, filtroSubcategoria]);

  // Exporta TODOS los productos del catálogo a CSV (lo abre Excel).
  const exportarProductosExcel = () => {
    // El contenido lo construye `productos.logic.js`, cuyo contrato fija
    // columnas, orden y formato en `productos.export.contract.test.js`.
    const csv = construirCsvProductos(productos);
    // El BOM hace que Excel reconozca UTF-8 y no destroce las tildes.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = CSV_FILENAME;
    a.click();
    URL.revokeObjectURL(url);
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditForm({
      nombre_cientifico: p.nombre_cientifico || "",
      nombre_natural: p.nombre_natural || "",
      categoria: p.categoria || "",
      subcategoria: p.subcategoria || "",
      stock_minimo: p.stock_minimo ?? 0,
      es_interno: !!p.es_interno,
      precio: p.precio ?? "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const payload = {
        ...editForm,
        precio: editForm.precio === "" || editForm.precio == null ? null : Number(editForm.precio),
      };
      await updateProducto(editingId, payload);
      showMsg("Producto actualizado.");
      cancelEdit();
      onChanged && (await onChanged());
    } catch (e) {
      showErr(fmtErr(e));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Eliminar un producto.
   *
   * Era el ÚNICO `window.confirm` que quedaba en Pedidos o Productos, y tenía
   * el problema de siempre: bloquea el hilo, no se puede estilar, y su
   * resultado síncrono invierte el control del flujo.
   *
   * `useConfirm` devuelve una promesa: la función espera de verdad, Escape y
   * «Cancelar» son NO, y el foco vuelve al botón que lo abrió. El diálogo
   * nombra el producto para que se vea CUÁL se va a borrar.
   */
  const removeProduct = async (p) => {
    const ok = await confirmar({
      title: "¿Eliminar el producto?",
      description: `${p.nombre_cientifico || "Sin nombre científico"}. Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      cancelLabel: "Cancelar",
      destructive: true,
    });
    if (!ok) return;

    setSaving(true);
    try {
      await deleteProducto(p.id);
      showMsg("Producto eliminado.");
      onChanged && (await onChanged());
    } catch (e) {
      showErr(fmtErr(e));
    } finally {
      setSaving(false);
    }
  };

  const submitNuevo = async () => {
    const errorValidacion = validarNuevoProducto(nuevo);
    if (errorValidacion) {
      showErr(errorValidacion);
      return;
    }
    setSaving(true);
    try {
      // El payload lo construye `productos.logic.js`; su forma exacta está
      // comparada con main en las pruebas de equivalencia.
      await createProducto(construirPayloadNuevo(nuevo));
      showMsg("Producto creado.");
      setNuevo({
        nombre_cientifico: "",
        nombre_natural: "",
        categoria: "",
        subcategoria: "",
        stock_minimo: 0,
        es_interno: false,
        precio: "",
      });
      setNuevoCategoriaSel("");
      setNuevoSubcategoriaSel("");
      onChanged && (await onChanged());
    } catch (e) {
      showErr(fmtErr(e));
    } finally {
      setSaving(false);
    }
  };

  const submitImport = async () => {
    if (!file) {
      showErr("Selecciona un archivo CSV o Excel primero.");
      return;
    }
    setSaving(true);
    setImportResult(null);
    try {
      const res = await importarProductos(file);
      setImportResult(res);
      showMsg(`Importación completada: ${res.insertados} nuevos, ${res.actualizados} actualizados.`);
      onChanged && (await onChanged());
    } catch (e) {
      showErr(fmtErr(e));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const inputS = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--border)",
    fontWeight: "var(--font-weight-medium)",
    boxSizing: "border-box",
  };
  /*
   * Se elimina `tabBtnS`. La pestaña activa se pintaba con
   * `background: var(--muted)` y `color: var(--primary-foreground)`, es decir,
   * gris muy claro con texto casi blanco: la pestaña seleccionada era la MENOS
   * legible de las tres. Es la misma confusión de tokens que dejó cuatro
   * botones en claro sobre claro, y aquí afectaba al indicador de posición.
   * `TabsTrigger` ya resuelve estado activo, foco y navegación por teclado.
   */

  return (
    /*
     * `Dialog` del sistema. El `div` fijo anterior no tenía trampa de foco ni
     * cierre con Escape, y su `onClick` de fondo cerraba el modal también al
     * soltar una selección de texto iniciada dentro — con un formulario de alta
     * a medio rellenar, eso perdía el trabajo.
     */
    <Dialog open={open} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent
        title="Gestionar productos"
        description="Alta, edición y baja del catálogo, e importación masiva."
        closeLabel="Cerrar"
        size="lg"
        className="max-w-[min(1100px,96vw)]"
      >
      {/*
       * DEFECTO CORREGIDO — cabecera duplicada.
       *
       * Aquí vivía una segunda cabecera propia («Gestionar productos» + bajada
       * + un botón «Cerrar») DENTRO de un `DialogContent` que ya pinta título,
       * descripción y botón de cierre. Se veían dos títulos iguales y dos
       * controles de cierre distintos, y el botón heredado usaba
       * `--warning-subtle-foreground` (un marrón pensado para TEXTO) como
       * FONDO, así que quedaba marrón sobre marrón.
       *
       * Además, esa cabecera y la fila de pestañas llevaban su propio
       * `padding: "18px 22px"` DENTRO del relleno de 24 px del diálogo: a
       * 375 px el contenido medía 330 px dentro de una caja de 278 px y se
       * salía por los lados, que es lo que se veía como controles encimados.
       */}
      <Tabs value={tab} onValueChange={setTab} className="flex min-w-0 flex-col gap-4">
        {/* `TabsList` ya reparte con `gap` y se ajusta; sin `flex-wrap` la
            tercera pestaña quedaba cortada por el borde del diálogo. */}
        <TabsList className="flex flex-wrap gap-2">
          <TabsTrigger value="listado">Listado</TabsTrigger>
          <TabsTrigger value="nuevo">Nuevo producto</TabsTrigger>
          <TabsTrigger value="importar">Importar CSV/Excel</TabsTrigger>
        </TabsList>

        {/* `Alert` lleva el rol ARIA: estos avisos solo se pintaban. */}
        {msg ? <Alert tone="success">{msg}</Alert> : null}
        {err ? <Alert tone="error">{err}</Alert> : null}

        <TabsContent value="listado">
            <div>
              <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  // El marcador de posición desaparece al teclear: no sirve como
                  // nombre accesible del campo.
                  aria-label="Buscar en el catálogo de productos"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar producto..."
                  style={{ ...inputS, flex: "1 1 220px", marginBottom: 0 }}
                />
                <select
                  aria-label="Filtrar el catálogo por categoría"
                  value={filtroCategoria}
                  onChange={(e) => setFiltroCategoria(e.target.value)}
                  style={{ ...inputS, flex: "0 1 200px", marginBottom: 0 }}
                >
                  <option value="">Todas las categorías</option>
                  {categoriasDisponibles.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <select
                  aria-label="Filtrar el catálogo por subcategoría"
                  value={filtroSubcategoria}
                  onChange={(e) => setFiltroSubcategoria(e.target.value)}
                  disabled={!filtroCategoria || subcategoriasDisponibles.length === 0}
                  style={{ ...inputS, flex: "0 1 200px", marginBottom: 0, opacity: filtroCategoria ? 1 : 0.55 }}
                >
                  <option value="">Todas las subcategorías</option>
                  {subcategoriasDisponibles.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {(search || filtroCategoria || filtroSubcategoria) && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => { setSearch(""); setFiltroCategoria(""); setFiltroSubcategoria(""); }}
                  >
                    Limpiar
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  className="ms-auto"
                  onClick={exportarProductosExcel}
                  disabled={!productos.length}
                  title="Exportar todos los productos a Excel"
                >
                  Exportar a Excel
                </Button>
              </div>
              <div style={{ marginBottom: 10, fontSize: 13, color: "var(--muted-foreground)", fontWeight: "var(--font-weight-medium)" }}>
                {productosFiltrados.length} {productosFiltrados.length === 1 ? "producto" : "productos"}
              </div>

              {/*
               * CAUSA RAÍZ DEL DEFECTO DE SOLAPE.
               *
               * La tabla era `width: 100%` + `table-layout: fixed` con anchos
               * en PORCENTAJE, así que nunca superaba el ancho del contenedor
               * y este `overflow-x: auto` no llegaba a activarse jamás. A 375 px
               * las columnas se comprimían a 16-24 px, pero los botones
               * «Editar»/«Eliminar» tienen un ancho mínimo intrínseco mayor y
               * `overflow: visible`: se salían de su celda y se pintaban ENCIMA
               * de la contigua.
               *
               * Con un `min-width` la tabla sí puede exceder al contenedor y el
               * scroll horizontal entra en funcionamiento, que es el
               * comportamiento correcto para una tabla densa en móvil. No es un
               * número por pantalla: es el ancho mínimo con el que las ocho
               * columnas siguen siendo legibles, y vale para todos los anchos.
               */}
              <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
                <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse", tableLayout: "fixed", wordBreak: "break-word" }}>
                  <colgroup>
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "15%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "7%" }} />
                    <col style={{ width: "19%" }} />
                  </colgroup>
                  <thead>
                    <tr style={{ background: "var(--muted)" }}>
                      <th style={{ padding: 10, textAlign: "left", fontWeight: "var(--font-weight-semibold)", fontSize: 12, color: "var(--foreground)" }}>Científico</th>
                      <th style={{ padding: 10, textAlign: "left", fontWeight: "var(--font-weight-semibold)", fontSize: 12, color: "var(--foreground)" }}>Común</th>
                      <th style={{ padding: 10, textAlign: "left", fontWeight: "var(--font-weight-semibold)", fontSize: 12, color: "var(--foreground)" }}>Categoría</th>
                      <th style={{ padding: 10, textAlign: "left", fontWeight: "var(--font-weight-semibold)", fontSize: 12, color: "var(--foreground)" }}>Subcategoría</th>
                      <th style={{ padding: 10, textAlign: "center", fontWeight: "var(--font-weight-semibold)", fontSize: 12, color: "var(--foreground)" }}>Precio (€)</th>
                      <th style={{ padding: 10, textAlign: "center", fontWeight: "var(--font-weight-semibold)", fontSize: 12, color: "var(--foreground)" }}>Stock min.</th>
                      <th style={{ padding: 10, textAlign: "center", fontWeight: "var(--font-weight-semibold)", fontSize: 12, color: "var(--foreground)" }}>Interno</th>
                      <th style={{ padding: 10, textAlign: "center", fontWeight: "var(--font-weight-semibold)", fontSize: 12, color: "var(--foreground)" }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosFiltrados.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ padding: 16, textAlign: "center", color: "var(--muted-foreground)" }}>
                          No hay productos.
                        </td>
                      </tr>
                    ) : (
                      productosFiltrados.map((p) => {
                        const isEditing = editingId === p.id;
                        return (
                          <tr key={p.id} style={{ borderTop: "1px solid var(--border)" }}>
                            {isEditing ? (
                              <>
                                <td style={{ padding: 6 }}>
                                  <input
                                    value={editForm.nombre_cientifico}
                                    onChange={(e) => setEditForm((f) => ({ ...f, nombre_cientifico: e.target.value }))}
                                    style={inputS}
                                  />
                                </td>
                                <td style={{ padding: 6 }}>
                                  <input
                                    value={editForm.nombre_natural || ""}
                                    onChange={(e) => setEditForm((f) => ({ ...f, nombre_natural: e.target.value }))}
                                    style={inputS}
                                  />
                                </td>
                                <td style={{ padding: 6 }}>
                                  <input
                                    value={editForm.categoria}
                                    onChange={(e) => setEditForm((f) => ({ ...f, categoria: e.target.value }))}
                                    style={inputS}
                                  />
                                </td>
                                <td style={{ padding: 6 }}>
                                  <input
                                    value={editForm.subcategoria}
                                    onChange={(e) => setEditForm((f) => ({ ...f, subcategoria: e.target.value }))}
                                    style={inputS}
                                  />
                                </td>
                                <td style={{ padding: 6 }}>
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    placeholder="—"
                                    value={editForm.precio ?? ""}
                                    onChange={(e) => setEditForm((f) => ({ ...f, precio: e.target.value }))}
                                    style={{ ...inputS, textAlign: "center" }}
                                  />
                                </td>
                                <td style={{ padding: 6 }}>
                                  <input
                                    type="number"
                                    min={0}
                                    value={editForm.stock_minimo}
                                    onChange={(e) => setEditForm((f) => ({ ...f, stock_minimo: e.target.value }))}
                                    style={{ ...inputS, textAlign: "center" }}
                                  />
                                </td>
                                <td style={{ padding: 6, textAlign: "center" }}>
                                  <input
                                    type="checkbox"
                                    checked={!!editForm.es_interno}
                                    onChange={(e) => setEditForm((f) => ({ ...f, es_interno: e.target.checked }))}
                                    style={{ width: 18, height: 18 }}
                                  />
                                </td>
                                <td style={{ padding: 6, textAlign: "center" }}>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
                                    <Button type="button" size="sm" variant="primary" onClick={saveEdit} disabled={saving}>Guardar</Button>
                                    <Button type="button" size="sm" variant="secondary" onClick={cancelEdit} disabled={saving}>Cancelar</Button>
                                  </div>
                                </td>
                              </>
                            ) : (
                              <>
                                <td style={{ padding: 10, fontWeight: "var(--font-weight-semibold)" }}>{p.nombre_cientifico}</td>
                                <td style={{ padding: 10 }}>{p.nombre_natural || "—"}</td>
                                <td style={{ padding: 10 }}>{p.categoria}</td>
                                <td style={{ padding: 10 }}>{p.subcategoria}</td>
                                <td style={{ padding: 10, textAlign: "center", fontWeight: "var(--font-weight-semibold)" }}>
                                  {p.precio === null || p.precio === undefined ? "—" : `${Number(p.precio).toFixed(2).replace(".", ",")} €`}
                                </td>
                                <td style={{ padding: 10, textAlign: "center", fontWeight: "var(--font-weight-semibold)" }}>{p.stock_minimo ?? 0}</td>
                                <td style={{ padding: 10, textAlign: "center" }}>
                                  <span style={{ padding: "2px 8px", borderRadius: "var(--radius-full)", background: p.es_interno ? "var(--warning-subtle)" : "var(--muted)", color: p.es_interno ? "var(--warning-subtle-foreground)" : "var(--muted-foreground)", fontWeight: "var(--font-weight-semibold)", fontSize: 12 }}>
                                    {p.es_interno ? "Sí" : "No"}
                                  </span>
                                </td>
                                <td style={{ padding: 10, textAlign: "center" }}>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
                                    <Button type="button" size="sm" variant="secondary" onClick={() => startEdit(p)} disabled={saving}>Editar</Button>
                                    <Button type="button" size="sm" variant="destructive" onClick={() => removeProduct(p)} disabled={saving}>Eliminar</Button>
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
        </TabsContent>

        <TabsContent value="nuevo">
          {(() => {
            const categoriasExistentes = [
              ...new Set(
                (Array.isArray(productos) ? productos : [])
                  .map((p) => String(p?.categoria || "").trim())
                  .filter(Boolean)
              ),
            ].sort((a, b) => a.localeCompare(b, "es"));

            const subcategoriasParaCategoria = [
              ...new Set(
                (Array.isArray(productos) ? productos : [])
                  .filter((p) => !nuevoCategoriaSel || String(p?.categoria || "").trim() === nuevoCategoriaSel)
                  .map((p) => String(p?.subcategoria || "").trim())
                  .filter(Boolean)
              ),
            ].sort((a, b) => a.localeCompare(b, "es"));

            return (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label htmlFor="prod-nombre-cientifico" style={{ fontSize: 12, fontWeight: "var(--font-weight-semibold)", color: "var(--muted-foreground)", textTransform: "uppercase", marginBottom: 6 }}>Nombre científico *</label>
                <input id="prod-nombre-cientifico" value={nuevo.nombre_cientifico} onChange={(e) => setNuevo((n) => ({ ...n, nombre_cientifico: e.target.value }))} style={inputS} placeholder="Ej: Phoenix canariensis" />
              </div>
              <div>
                <label htmlFor="prod-nombre-comun" style={{ fontSize: 12, fontWeight: "var(--font-weight-semibold)", color: "var(--muted-foreground)", textTransform: "uppercase", marginBottom: 6 }}>Nombre común</label>
                <input id="prod-nombre-comun" value={nuevo.nombre_natural} onChange={(e) => setNuevo((n) => ({ ...n, nombre_natural: e.target.value }))} style={inputS} placeholder="Ej: Palmera canaria" />
              </div>

              <div>
                <label htmlFor="prod-categoria" style={{ fontSize: 12, fontWeight: "var(--font-weight-semibold)", color: "var(--muted-foreground)", textTransform: "uppercase", marginBottom: 6 }}>Categoría *</label>
                <select id="prod-categoria"
                  value={nuevoCategoriaSel}
                  onChange={(e) => {
                    const v = e.target.value;
                    setNuevoCategoriaSel(v);
                    setNuevoSubcategoriaSel(""); // reset subcat al cambiar cat
                    setNuevo((n) => ({
                      ...n,
                      categoria: v === "__NUEVA__" ? "" : v,
                      subcategoria: "",
                    }));
                  }}
                  style={inputS}
                >
                  <option value="">Seleccionar categoría</option>
                  {categoriasExistentes.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="__NUEVA__">＋ Nueva categoría</option>
                </select>
                {nuevoCategoriaSel === "__NUEVA__" ? (
                  <input
                    autoFocus
                    value={nuevo.categoria}
                    onChange={(e) => setNuevo((n) => ({ ...n, categoria: e.target.value }))}
                    placeholder="Escribe el nombre de la nueva categoría"
                    style={{ ...inputS, marginTop: 6 }}
                  />
                ) : null}
              </div>

              <div>
                <label htmlFor="prod-subcategoria" style={{ fontSize: 12, fontWeight: "var(--font-weight-semibold)", color: "var(--muted-foreground)", textTransform: "uppercase", marginBottom: 6 }}>Subcategoría *</label>
                <select id="prod-subcategoria"
                  value={nuevoSubcategoriaSel}
                  onChange={(e) => {
                    const v = e.target.value;
                    setNuevoSubcategoriaSel(v);
                    setNuevo((n) => ({ ...n, subcategoria: v === "__NUEVA__" ? "" : v }));
                  }}
                  style={inputS}
                  disabled={!nuevoCategoriaSel}
                >
                  <option value="">
                    {nuevoCategoriaSel ? "Seleccionar subcategoría" : "Primero elige categoría"}
                  </option>
                  {subcategoriasParaCategoria.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                  <option value="__NUEVA__">＋ Nueva subcategoría</option>
                </select>
                {nuevoSubcategoriaSel === "__NUEVA__" ? (
                  <input
                    autoFocus
                    value={nuevo.subcategoria}
                    onChange={(e) => setNuevo((n) => ({ ...n, subcategoria: e.target.value }))}
                    placeholder="Escribe el nombre de la nueva subcategoría"
                    style={{ ...inputS, marginTop: 6 }}
                  />
                ) : null}
              </div>
              <div>
                <label htmlFor="prod-stock-minimo" style={{ fontSize: 12, fontWeight: "var(--font-weight-semibold)", color: "var(--muted-foreground)", textTransform: "uppercase", marginBottom: 6 }}>Stock mínimo</label>
                <input id="prod-stock-minimo" type="number" min={0} value={nuevo.stock_minimo} onChange={(e) => setNuevo((n) => ({ ...n, stock_minimo: e.target.value }))} style={inputS} />
              </div>
              <div>
                <label htmlFor="prod-precio-unitario" style={{ fontSize: 12, fontWeight: "var(--font-weight-semibold)", color: "var(--muted-foreground)", textTransform: "uppercase", marginBottom: 6 }}>Precio unitario (€)</label>
                <input id="prod-precio-unitario" type="number" min={0} step="0.01" value={nuevo.precio} onChange={(e) => setNuevo((n) => ({ ...n, precio: e.target.value }))} style={inputS} placeholder="Ej: 12,50" />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: nuevo.es_interno ? "var(--warning-subtle)" : "white", fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", cursor: "pointer", marginTop: 22 }}>
                <input type="checkbox" checked={nuevo.es_interno} onChange={(e) => setNuevo((n) => ({ ...n, es_interno: e.target.checked }))} style={{ width: 18, height: 18 }} />
                Producto interno (oculto a empresa externa)
              </label>

              <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                <Button type="button" variant="primary" onClick={submitNuevo} disabled={saving}>
                  {saving ? "Creando..." : "Crear producto"}
                </Button>
              </div>
            </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="importar">
            <div>
              <div style={{ padding: 14, borderRadius: "var(--radius-md)", background: "var(--muted)", border: "1px solid var(--border)", marginBottom: 14 }}>
                <div style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--foreground)", marginBottom: 6 }}>Formato del archivo</div>
                <div style={{ color: "var(--muted-foreground)", fontWeight: "var(--font-weight-medium)", fontSize: 14, lineHeight: 1.5 }}>
                  CSV o Excel (.xlsx). Columnas (no importa mayúsculas, acentos o guiones bajos):
                  <ul style={{ margin: "6px 0 0 18px" }}>
                    <li><b>nombre_cientifico</b> (obligatorio)</li>
                    <li>nombre_natural / nombre común</li>
                    <li><b>categoria</b> (obligatorio)</li>
                    <li><b>subcategoria</b> (obligatorio)</li>
                    <li>stock_minimo (opcional, entero ≥ 0)</li>
                    <li>es_interno (opcional, true / false)</li>
                  </ul>
                  <div style={{ marginTop: 6 }}>
                    Los productos existentes con el mismo nombre científico se <b>actualizan</b>. Los nuevos se insertan.
                  </div>
                </div>
              </div>

              {/*
                Un `input[type=file]` sin etiqueta se anuncia solo como
                «examinar»: no dice qué se sube ni en qué formato.
              */}
              <label htmlFor="prod-importar-fichero" className="mb-2 block text-body-sm font-[var(--font-weight-medium)]">
                Fichero de productos (CSV o Excel)
              </label>
              <input
                id="prod-importar-fichero"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setImportResult(null);
                }}
                style={{ marginBottom: 12 }}
              />

              <div>
                <button onClick={submitImport} disabled={saving || !file} style={{ padding: "10px 16px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: saving || !file ? "var(--muted)" : "var(--muted)", color: "var(--card)", fontWeight: "var(--font-weight-semibold)", cursor: saving || !file ? "not-allowed" : "pointer" }}>
                  {saving ? "Importando..." : "Importar"}
                </button>
              </div>

              {importResult ? (
                <div style={{ marginTop: 16, padding: 14, borderRadius: "var(--radius-md)", background: "var(--success-subtle)", border: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--success-subtle-foreground)", marginBottom: 6 }}>Resultado de la importación</div>
                  <div style={{ color: "var(--foreground)", fontWeight: "var(--font-weight-semibold)" }}>Insertados: {importResult.insertados}</div>
                  <div style={{ color: "var(--foreground)", fontWeight: "var(--font-weight-semibold)" }}>Actualizados: {importResult.actualizados}</div>
                  <div style={{ color: "var(--foreground)", fontWeight: "var(--font-weight-semibold)" }}>Saltados: {importResult.saltados}</div>
                  {importResult.errores?.length > 0 ? (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--danger-subtle-foreground)" }}>Errores:</div>
                      <ul style={{ margin: "4px 0 0 18px", color: "var(--danger-subtle-foreground)" }}>
                        {importResult.errores.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
        </TabsContent>

        {dialogoConfirmacion}
      </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default function Productos() {
  const { me } = useOutletContext();
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [categoriaSel, setCategoriaSel] = useState("ALL");
  const [subcategoriaSel, setSubcategoriaSel] = useState("ALL");
  const [soloConImagen, setSoloConImagen] = useState(false);

  const [pedirProducto, setPedirProducto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [gestionOpen, setGestionOpen] = useState(false);

  // Cesta de reposición: vive solo en memoria (al cerrar la pestaña se pierde).
  // Cada item lleva el producto_id, el formato/tamaño concreto, la cantidad y
  // metadatos para la previsualización (nombre y categoría).
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartError, setCartError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const prods = await getProductos();
      const normProds = (prods || []).map((p) => ({
        ...p,
        stock: Number(p.stock ?? 0),
      }));
      setProductos(normProds);
    } catch (e) {
      setError(fmtErr(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const categorias = useMemo(() => {
    const set = new Set();
    productos.forEach((p) => {
      const c = (p.categoria || "").trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [productos]);

  const subcategorias = useMemo(() => {
    const set = new Set();
    productos.forEach((p) => {
      const c = (p.categoria || "").trim();
      const s = (p.subcategoria || "").trim();
      if (!s) return;
      if (categoriaSel === "ALL" || c === categoriaSel) set.add(s);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [productos, categoriaSel]);

  useEffect(() => {
    setSubcategoriaSel("ALL");
  }, [categoriaSel]);

  // Ids de productos cuya imagen existe (sondeo asíncrono con caché).
  const idsConImagen = usePlantsWithImage(productos);

  const productosFiltrados = useMemo(() => {
    const qn = norm(q);

    return productos.filter((p) => {
      const c = (p.categoria || "").trim();
      const s = (p.subcategoria || "").trim();

      const okCat = categoriaSel === "ALL" || c === categoriaSel;
      const okSub = subcategoriaSel === "ALL" || s === subcategoriaSel;
      const okImg = !soloConImagen || idsConImagen.has(p.id);

      if (!okCat || !okSub || !okImg) return false;
      if (!qn) return true;

      const hay =
        norm(p.nombre_cientifico).includes(qn) ||
        norm(p.nombre_natural).includes(qn) ||
        norm(p.nombre).includes(qn) ||
        norm(p.categoria).includes(qn) ||
        norm(p.subcategoria).includes(qn);

      return hay;
    });
  }, [productos, q, categoriaSel, subcategoriaSel, soloConImagen, idsConImagen]);

  const rol = rolEfectivo(me);  // superadmin/admin_vivero cuentan como admin
  const esEmpresaExterna = rol === "empresa_externa";
  // Los permisos salen de `productos.logic.js`, comparados con main en
  // `productos.equivalence.test.js`.
  const puedePedirMas = puedePedirMasLogica(rol);
  const puedeMarcarInterno = puedeMarcarInternoLogica(rol);
  const puedeGestionar = puedeGestionarLogica(rol);

  // Memoizado para mantener la referencia estable y no romper el React.memo
  // de las filas de ProductoRow.
  const toggleEsInterno = useCallback(async (producto) => {
    const nuevoValor = !producto.es_interno;
    setProductos((prev) =>
      prev.map((p) => (p.id === producto.id ? { ...p, es_interno: nuevoValor } : p))
    );
    try {
      await updateProductoInterno(producto.id, nuevoValor);
      setMsg(`Producto ${nuevoValor ? "marcado como interno" : "hecho visible a todos"}.`);
      setTimeout(() => setMsg(""), 2500);
    } catch (e) {
      setProductos((prev) =>
        prev.map((p) => (p.id === producto.id ? { ...p, es_interno: !nuevoValor } : p))
      );
      setError(fmtErr(e));
    }
  }, []);

  // Handler estable para abrir el modal "Pedir más" desde cualquier fila.
  // Es importante que la referencia no cambie en cada render del padre,
  // porque las filas son memo y romperíamos la memoización si pasáramos
  // una arrow function nueva en cada render.
  const openPedirMas = useCallback((p) => {
    setPedirProducto(p);
  }, []);

  // Añadir un item a la cesta. Si ya existe el mismo producto+tamaño,
  // suma cantidades; si no, lo añade como nueva línea.
  const handleAnadirACesta = async (item) => {
    setCart((prev) => {
      const idx = prev.findIndex(
        (it) => it.producto_id === item.producto_id && it.tamano === item.tamano
      );
      if (idx >= 0) {
        const copia = [...prev];
        copia[idx] = {
          ...copia[idx],
          cantidad: Number(copia[idx].cantidad || 0) + Number(item.cantidad || 0),
        };
        return copia;
      }
      return [...prev, item];
    });
    setPedirProducto(null);
    setMsg("Producto añadido a la cesta.");
    setTimeout(() => setMsg(""), 2000);
  };

  const handleUpdateCartItem = (idx, patch) => {
    setCart((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const handleRemoveCartItem = (idx) => {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  };

  // Finalizar pedido: crea un único pedido de reposición con todos los
  // items de la cesta. Si va bien, vacía la cesta y muestra confirmación.
  const handleFinalizarPedido = async (nota) => {
    if (cart.length === 0) {
      setCartError("La cesta está vacía.");
      return;
    }
    // Validación local: todas las cantidades > 0 y con formato definido
    for (const it of cart) {
      if (!it.tamano) {
        setCartError(`Falta el formato/tamaño en "${it.producto_nombre}".`);
        return;
      }
      if (!it.cantidad || Number(it.cantidad) <= 0) {
        setCartError(`La cantidad de "${it.producto_nombre}" debe ser mayor que 0.`);
        return;
      }
    }
    setCartError("");
    setSaving(true);
    try {
      await createPedido({
        tipo: "reposicion",
        nota: nota || null,
        items: cart.map((it) => ({
          producto_id: it.producto_id,
          tamano: it.tamano,
          cantidad: Number(it.cantidad),
        })),
      });
      setCart([]);
      setCartOpen(false);
      setMsg("Pedido de reposición creado. Pendiente de aprobación por el manager.");
      setTimeout(() => setMsg(""), 4000);
    } catch (e) {
      setCartError(fmtErr(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-h2 font-[var(--font-weight-semibold)]">Productos</h1>
          <p className="text-body-sm text-muted-foreground">
            Catálogo del vivero con existencias, mínimos y clasificación.
          </p>
        </div>
        {/* Máximo anclado al viewport para que las acciones se partan a 320 px
            en vez de quedar cortadas: mismo hallazgo que en la Fase 4A. */}
        <div className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2">
          {puedePedirMas ? (
            <button
              onClick={() => setCartOpen(true)}
              title={cart.length === 0 ? "Cesta vacía" : "Abrir cesta de reposición"}
              style={{
                position: "relative",
                padding: "10px 16px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)",
                background: cart.length > 0
                  ? "var(--muted)"
                  : "var(--warning-subtle)",
                color: cart.length > 0 ? "var(--primary-foreground)" : "var(--warning-subtle-foreground)",
                fontWeight: "var(--font-weight-semibold)",
                cursor: "pointer",
                boxShadow: cart.length > 0 ? "var(--shadow-md)" : "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              🛒 Cesta
              {cart.length > 0 ? (
                <span
                  style={{
                    minWidth: 22,
                    height: 22,
                    padding: "0 6px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--card)",
                    color: "var(--warning-subtle-foreground)",
                    fontWeight: "var(--font-weight-semibold)",
                    fontSize: 12,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {cart.length}
                </span>
              ) : null}
            </button>
          ) : null}
          {puedeGestionar ? (
            <Button type="button" variant="secondary" onClick={() => setGestionOpen(true)}>
              Gestionar productos
            </Button>
          ) : null}
        </div>
      </div>

      {/* `Alert` lleva role="alert": un error solo pintado no se anuncia. */}
      {error && <Alert tone="error">{error}</Alert>}
      {loading && <p>Cargando...</p>}

      {msg && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 14px",
            borderRadius: "var(--radius-md)",
            background: "var(--success-subtle)",
            border: "1px solid var(--border)",
            color: "var(--success-subtle-foreground)",
            fontWeight: "var(--font-weight-semibold)",
          }}
        >
          {msg}
        </div>
      )}

      {!loading && (
        /*
          Rejilla que REFLOWA. Antes eran cuatro columnas fijas
          (`1.5fr 1fr 1fr auto`): a 320 px los dos selectores de categoría
          quedaban cortados por el borde, medido en navegador. `auto-fit` con
          tope al 100 % los apila cuando no caben.
        */
        <div
          className="mb-3 grid items-end gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}
        >
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Buscar</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre científico, nombre común, categoría, subcategoría..."
              style={{
                padding: 10,
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)",
                background: "var(--muted)",
                fontWeight: "var(--font-weight-medium)",
                color: "var(--foreground)",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Categoría</span>
            <select
              aria-label="Filtrar por categoría"
              value={categoriaSel}
              onChange={(e) => setCategoriaSel(e.target.value)}
              style={{
                padding: 10,
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)",
                background: "var(--muted)",
                fontWeight: "var(--font-weight-medium)",
                color: "var(--foreground)",
              }}
            >
              <option value="ALL">Todas</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Subcategoría</span>
            <select
              aria-label="Filtrar por subcategoría"
              value={subcategoriaSel}
              onChange={(e) => setSubcategoriaSel(e.target.value)}
              style={{
                padding: 10,
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)",
                background: "var(--muted)",
                fontWeight: "var(--font-weight-medium)",
                color: "var(--foreground)",
              }}
            >
              <option value="ALL">Todas</option>
              {subcategorias.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={() => {
              setQ("");
              setCategoriaSel("ALL");
              setSubcategoriaSel("ALL");
              setSoloConImagen(false);
            }}
            style={{
              padding: "10px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              background: "var(--card)",
              cursor: "pointer",
              fontWeight: "var(--font-weight-medium)",
              height: 42,
            }}
          >
            Limpiar
          </button>
        </div>
      )}

      {!loading && (
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
            padding: "8px 12px",
            borderRadius: "var(--radius-md)",
            border: soloConImagen ? "1px solid var(--border)" : "1px solid var(--border)",
            background: soloConImagen ? "var(--success-subtle)" : "var(--muted)",
            cursor: "pointer",
            fontWeight: "var(--font-weight-semibold)",
            color: soloConImagen ? "var(--success-subtle-foreground)" : "var(--foreground)",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={soloConImagen}
            onChange={(e) => setSoloConImagen(e.target.checked)}
            style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--primary)" }}
          />
          🖼️ Mostrar solo productos con imagen
        </label>
      )}

      {!loading && (
        <p style={{ color: "var(--muted-foreground)", marginTop: 0 }}>
          Mostrando <b>{productosFiltrados.length}</b> de <b>{productos.length}</b> productos
        </p>
      )}

      {!loading && (
        /*
         * CAUSA RAÍZ DEL SOLAPE DE «PEDIR MÁS».
         *
         * Esta tabla se maquetaba con los atributos de presentación de HTML4
         * `border="1" cellPadding="8"`. El reinicio de CSS de Tailwind declara
         * `padding: 0` sobre todos los elementos, y una regla CSS gana siempre
         * a un atributo de presentación: `cellPadding` quedaba MUERTO y las
         * celdas tenían 0 px de relleno.
         *
         * Sin relleno, la altura de la fila la fijaba su control más alto —el
         * botón, 28 px— así que la fila medía exactamente 28 px y el hueco
         * vertical entre botones de filas consecutivas era de 0 px: se veían
         * pegados, como un bloque azul continuo que invade la fila siguiente.
         * Medido en navegador: filaH 28, botonH 28, huecos [0,0,0,…].
         *
         * El arreglo es estructural: relleno real por CSS en cada celda. No hay
         * altura de fila fija, ni márgenes negativos, ni posicionamiento
         * absoluto, ni números por pantalla.
         */
        <div style={{ overflowX: "auto" }}>
          <table
            className="w-full border-collapse [&_td]:p-3 [&_td]:align-middle [&_th]:p-3 [&_tbody_tr]:border-t [&_tbody_tr]:border-[var(--border)]"
            style={{ minWidth: 720 }}
          >
            <caption className="sr-only">
              Catálogo de productos con existencias, mínimos y clasificación.
            </caption>
            <thead>
              <tr className="bg-[var(--muted)]">
                <th scope="col" className="text-left">Nombre científico</th>
                <th scope="col" className="text-left">Nombre común</th>
                <th scope="col" className="text-left">Categoría</th>
                <th scope="col" className="text-left">Subcategoría</th>
                <th scope="col" className="text-center">Stock</th>
                {!esEmpresaExterna && <th scope="col" className="text-center">Stock mínimo</th>}
                {puedeMarcarInterno && <th scope="col" className="text-center">Interno</th>}
                {puedePedirMas && <th scope="col" className="text-center">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      5 + (!esEmpresaExterna ? 1 : 0) + (puedeMarcarInterno ? 1 : 0) + (puedePedirMas ? 1 : 0)
                    }
                    style={{ textAlign: "center" }}
                  >
                    No hay resultados con esos filtros.
                  </td>
                </tr>
              ) : (
                productosFiltrados.map((p) => (
                  <ProductoRow
                    key={p.id}
                    p={p}
                    esEmpresaExterna={esEmpresaExterna}
                    puedeMarcarInterno={puedeMarcarInterno}
                    puedePedirMas={puedePedirMas}
                    onToggleInterno={toggleEsInterno}
                    onPedirMas={openPedirMas}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && (
        <div style={{ marginTop: 12 }}>
          <button onClick={load} style={{ padding: "8px 10px" }}>
            Refrescar
          </button>
        </div>
      )}

      <PedirMasModal
        open={!!pedirProducto}
        producto={pedirProducto}
        onClose={() => setPedirProducto(null)}
        onAddToCart={handleAnadirACesta}
        saving={saving}
      />

      {/* `key`: abrir la cesta monta una instancia nueva, así que la nota
          empieza vacía sin necesidad de un efecto que la limpie. */}
      <CartModal
        key={cartOpen ? "cesta-abierta" : "cesta-cerrada"}
        open={cartOpen}
        cart={cart}
        onClose={() => { setCartOpen(false); setCartError(""); }}
        onAddMore={() => { setCartOpen(false); setCartError(""); }}
        onRemove={handleRemoveCartItem}
        onUpdate={handleUpdateCartItem}
        onFinalizar={handleFinalizarPedido}
        saving={saving}
        errorMsg={cartError}
      />

      <GestionProductosModal
        open={gestionOpen}
        productos={productos}
        onClose={() => setGestionOpen(false)}
        onChanged={load}
      />
    </div>
  );
}
