import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Check, Plus, ClipboardList } from "lucide-react";

import { getMovimientos, getProductos, getPedidos, createMovimiento } from "../api/api";
import { loadZonasFromServer } from "../components/vivero/zonesStorage";
import { formatUsername } from "../utils/format";
import { getUnidadMovimiento } from "../utils/formato";
import { formatCantidadConUnidad } from "../utils/numero";
import { getZonaLabel } from "../utils/zonas";
import { formatFechaCanaria } from "../utils/fecha";

import { Button, Card, DataTable, EmptyState, PageHeader, StatusBadge } from "../ui";
import { Alert, Truncated } from "../components/ui/feedback";
import { FilterBar } from "../components/ui/layout";
import SearchField from "../components/ui/SearchField";
import SelectField from "../components/ui/SelectField";

import {
  DEFAULT_ZONAS,
  ensureZonasEspeciales,
  ORIGENES,
  DESTINOS_SALIDA_VIVERO,
  TIPOS_MOVIMIENTO,
} from "./movimientos.constants";
import {
  buildLabelDestino,
  buildLabelOrigen,
  filtrarMovimientos,
  filtrarPedidosAprobados,
  getMovimientoTipo,
  getPrestamoKind,
  getTipoDisplayLabel,
  safeArray,
} from "./movimientos.logic";
import MovimientoModal from "./movimientos/MovimientoModal";
import MovimientoCestaModal from "./movimientos/MovimientoCestaModal";
import MovimientoDetalleModal from "./movimientos/MovimientoDetalleModal";

/*
 * MOVIMIENTOS.
 *
 * La pantalla de uso diario del vivero, y la que más deuda visual acumulaba:
 * once columnas con anchos fijos en píxeles, `borderSpacing: "0 10px"` con
 * bordes por celda para fingir filas-tarjeta, y una rejilla de filtros de siete
 * columnas fijas. Por debajo de ~1 200 px se desbordaba.
 *
 * TODA la lógica de negocio se ha extraído sin tocarla a `movimientos.logic.js`
 * y está protegida por `movimientos.equivalence.test.js`, que la compara con
 * una copia literal de main sobre datos generados. Aquí solo queda
 * presentación y estado de interfaz.
 *
 * Lo que NO cambia: las siete reglas de filtrado, el orden y el contenido de
 * las once columnas, el `Promise.all` de la carga —que falla entero si falla
 * una fuente, igual que antes—, el alta que se detiene en el primer error y
 * avisa «Guardados N/M», y los 3 000 ms del mensaje.
 */

/** Etiquetas de la tabla, en un solo sitio. */
const TABLE_LABELS = {
  selectAll: "Seleccionar todo",
  selectRow: "Seleccionar fila",
  actions: "Acciones",
  sortAscending: "Orden ascendente",
  sortDescending: "Orden descendente",
  loading: "Cargando…",
  previous: "Anterior",
  next: "Siguiente",
  selectedCount: (n) => `${n} seleccionado${n === 1 ? "" : "s"}`,
};

/**
 * Estado semántico de cada tipo de movimiento.
 *
 * La versión anterior lo resolvía con `fontWeight: 900` y un color a mano por
 * tipo. Aquí se usa el sistema de estados, que además garantiza que el tipo se
 * lee como TEXTO y no solo como color.
 */
const TONO_TIPO = {
  entrada: "success",
  salida: "danger",
  devolucion: "warning",
  traslado_interno: "info",
};

const MENSAJE_MS = 3000;
const UUID_COPIADO_MS = 1800;

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
  const msgTimerRef = useRef(null);

  const [copiedUuid, setCopiedUuid] = useState("");
  const copiaTimerRef = useRef(null);

  const [zonasDisponibles, setZonasDisponibles] = useState(() => ensureZonasEspeciales(DEFAULT_ZONAS));

  const [filtros, setFiltros] = useState({
    producto: "",
    tipo: "",
    zona: "",
    uuid: "",
    origen: "",
    destino: "",
    fecha: "",
  });

  const setFiltro = useCallback((clave, valor) => {
    setFiltros((prev) => ({ ...prev, [clave]: valor }));
  }, []);

  const limpiarFiltros = () =>
    setFiltros({ producto: "", tipo: "", zona: "", uuid: "", origen: "", destino: "", fecha: "" });

  const hayFiltros = Object.values(filtros).some(Boolean);

  /* ── Zonas ─────────────────────────────────────────────────────────────
     Carga aparte y tolerante a fallos: si el servidor no responde, se
     mantiene el fallback estático. Comportamiento previo, sin cambios.     */
  useEffect(() => {
    let cancelled = false;
    loadZonasFromServer()
      .then((data) => {
        if (cancelled) return;
        if (!Array.isArray(data) || data.length === 0) return;
        const ids = data
          .map((z) => z.apiId || z.id)
          .filter(Boolean)
          // Acepta "zona-3a", "zona3a", "ZONA-3A" y "3a"; normaliza a "3a".
          .map((id) => String(id).trim().toLowerCase().replace(/^zona[-_]?/i, ""));
        const seen = new Set();
        const unique = ids.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
        if (unique.length > 0) setZonasDisponibles(ensureZonasEspeciales(unique));
      })
      .catch(() => {
        /* Se mantiene el fallback estático. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* ── Mensajes ──────────────────────────────────────────────────────── */

  const clearMsgTimer = () => {
    if (msgTimerRef.current) {
      clearTimeout(msgTimerRef.current);
      msgTimerRef.current = null;
    }
  };

  const showTimedMessage = useCallback((text, type = "success") => {
    clearMsgTimer();
    setMsg(text);
    setMsgType(type);
    msgTimerRef.current = setTimeout(() => setMsg(""), MENSAJE_MS);
  }, []);

  /* ── Carga ─────────────────────────────────────────────────────────────
     `Promise.all`, NO `allSettled`: si una fuente falla no hay datos y se
     avisa. Es el comportamiento anterior y cambiarlo sería un cambio
     funcional, no una mejora visual.                                       */
  const load = useCallback(async () => {
    setLoading(true);
    clearMsgTimer();
    setMsg("");
    try {
      const [movs, prods, peds] = await Promise.all([getMovimientos(), getProductos(), getPedidos()]);
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
  }, [showTimedMessage]);

  useEffect(() => {
    load();
    return () => {
      clearMsgTimer();
      if (copiaTimerRef.current) clearTimeout(copiaTimerRef.current);
    };
  }, [load]);

  /* ── Derivados ─────────────────────────────────────────────────────── */

  const pedidosAprobados = useMemo(() => filtrarPedidosAprobados(pedidos), [pedidos]);

  const movimientosFiltrados = useMemo(
    () => filtrarMovimientos(movimientos, filtros),
    [movimientos, filtros]
  );

  /** Zonas que aparecen en el selector: las del servidor más las ya usadas. */
  const zonasFiltro = useMemo(() => {
    const vistas = new Set(zonasDisponibles.map((z) => String(z)));
    for (const m of movimientos) {
      for (const z of [m?.zona_origen, m?.zona_destino]) {
        if (z) vistas.add(String(z));
      }
    }
    return [...vistas];
  }, [zonasDisponibles, movimientos]);

  /* ── Acciones ──────────────────────────────────────────────────────── */

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
          break; // Se detiene en el primer fallo. Comportamiento previo.
        }
      }
      if (errorMsg) {
        await load();
        showTimedMessage(`Guardados ${creados}/${payloads.length}. ${errorMsg}`, "error");
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

  const copyUuid = useCallback(async (uuid) => {
    const value = String(uuid || "").trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedUuid(value);
      showTimedMessage(`UUID copiado: ${value}`, "success");
      if (copiaTimerRef.current) clearTimeout(copiaTimerRef.current);
      copiaTimerRef.current = setTimeout(
        () => setCopiedUuid((prev) => (prev === value ? "" : prev)),
        UUID_COPIADO_MS
      );
    } catch {
      showTimedMessage("No se pudo copiar el UUID.", "error");
    }
  }, [showTimedMessage]);

  /* ── Columnas ──────────────────────────────────────────────────────────
     MISMO ORDEN Y MISMO CONTENIDO que la tabla anterior. Lo único que cambia
     es que las secundarias se ocultan en pantallas estrechas en vez de
     provocar desbordamiento horizontal.                                    */
  const columnas = useMemo(
    () => [
      {
        key: "fecha",
        header: "Fecha",
        cell: (m) => (
          <span className="tabular whitespace-nowrap">{formatFechaCanaria(m.fecha_movimiento)}</span>
        ),
      },
      {
        key: "tipo",
        header: "Tipo",
        cell: (m) => {
          const tipo = m.tipo_movimiento || getMovimientoTipo(m);
          return <StatusBadge status={TONO_TIPO[String(tipo).toLowerCase()] || "info"} label={getTipoDisplayLabel(tipo)} />;
        },
      },
      {
        key: "producto",
        header: "Nombre científico",
        cell: (m) => (
          <Truncated>
            {m.producto_nombre_cientifico || m.nombre_cientifico || `Producto #${m.producto_id}`}
          </Truncated>
        ),
      },
      {
        key: "cantidad",
        header: "Cant.",
        numeric: true,
        cell: (m) => formatCantidadConUnidad(m.cantidad, getUnidadMovimiento(m)),
      },
      {
        key: "origen",
        header: "Origen",
        cell: (m) => <Truncated>{buildLabelOrigen(m)}</Truncated>,
      },
      {
        key: "destino",
        header: "Destino",
        cell: (m) => <Truncated>{buildLabelDestino(m)}</Truncated>,
      },
      {
        key: "prestamo",
        header: "Préstamo",
        hideOnMobile: true,
        cell: (m) => {
          const kind = getPrestamoKind(m);
          if (kind === "prestamo") return <StatusBadge status="info" label="Préstamo" />;
          if (kind === "devolucion") return <StatusBadge status="warning" label="Devolución" />;
          return <span className="text-muted-foreground">—</span>;
        },
      },
      {
        key: "usuario",
        header: "Usuario",
        hideOnMobile: true,
        cell: (m) => <Truncated>{formatUsername(m.created_by) || "—"}</Truncated>,
      },
      {
        key: "uuid",
        header: "UUID lote",
        hideOnMobile: true,
        cell: (m) => {
          if (!m.uuid_lote) return <span className="text-muted-foreground">—</span>;
          const copiado = copiedUuid === m.uuid_lote;
          return (
            <div className="flex min-w-0 items-center gap-2">
              {/*
                Un solo botón, no un botón MÁS un div clicable con el mismo
                efecto: el div no era enfocable ni accionable con teclado, así
                que la mitad de la interacción no existía para quien no usa
                ratón. El UUID va dentro del botón.
              */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => copyUuid(m.uuid_lote)}
                className="min-w-0 max-w-full justify-start gap-1.5"
                aria-label={`Copiar el UUID del lote ${m.uuid_lote}`}
              >
                {copiado ? (
                  <Check aria-hidden="true" className="size-3.5 shrink-0" />
                ) : (
                  <Copy aria-hidden="true" className="size-3.5 shrink-0" />
                )}
                <span className="mono truncate text-caption">{m.uuid_lote}</span>
              </Button>
            </div>
          );
        },
      },
      {
        key: "pedido",
        header: "Pedido",
        hideOnMobile: true,
        cell: (m) => (
          <span className="tabular whitespace-nowrap">{m.pedido_id ? `#${m.pedido_id}` : "—"}</span>
        ),
      },
      {
        key: "detalles",
        header: "Detalles",
        cell: (m) => (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setDetalleMovimiento(m)}
            aria-label={`Ver el detalle del movimiento ${m.id}`}
          >
            Ver
          </Button>
        ),
      },
    ],
    // `copyUuid` es estable (useCallback), pero la regla no puede saberlo si no
    // se declara; declararlo evita que un cambio futuro la deje obsoleta.
    [copiedUuid, copyUuid]
  );

  return (
    <div className="flex flex-col gap-[var(--section-gap)]">
      <PageHeader
        title="Movimientos"
        description="Registra y consulta entradas, salidas, préstamos, devoluciones y traslados del vivero."
        /*
          `max-w-[calc(100vw-2rem)]` no es un apaño: es lo que rompe una
          circularidad real.

          `PageHeader` mete las acciones en un contenedor `flex-wrap shrink-0`.
          Al no poder encogerse, su ancho se resuelve por el CONTENIDO, así que
          los hijos nunca «necesitan» partirse: los dos botones sumaban 400 px
          y a 320 px el primario quedaba cortado por el borde —medido en
          navegador—. Un `w-full` no ayuda, porque el 100 % se calcula contra
          ese mismo ancho por contenido.

          Anclar el máximo al VIEWPORT rompe el bucle: a 320 px el tope son
          288 px, los botones no caben en una línea y la fila se parte sola.
        */
        actions={
          <div className="flex max-w-[calc(100vw-2rem)] flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowModal(true)}>
              <ClipboardList aria-hidden="true" className="size-4" />
              Servir pedido / Devolución
            </Button>
            <Button variant="primary" onClick={() => setShowSalidaModal(true)}>
              <Plus aria-hidden="true" className="size-4" />
              Nuevo movimiento
            </Button>
          </div>
        }
      />

      {/* El banner anterior era un div con color de fondo; `Alert` ya lleva
          role="alert"/"status" según el tono, así que el aviso se anuncia. */}
      {msg && (
        <Alert
          tone={msgType === "error" ? "error" : "success"}
          onDismiss={() => {
            clearMsgTimer();
            setMsg("");
          }}
        >
          {msg}
        </Alert>
      )}

      <Card className="p-[var(--card-padding)]">
        <FilterBar
          label="Filtros de movimientos"
          minColumn="190px"
          actions={
            hayFiltros ? (
              <Button variant="ghost" size="sm" onClick={limpiarFiltros}>
                Limpiar filtros
              </Button>
            ) : null
          }
        >
          <SearchField
            label="Producto"
            hideLabel={false}
            value={filtros.producto}
            onChange={(v) => setFiltro("producto", v)}
            placeholder="Nombre científico o común"
          />
          <SelectField
            label="Tipo"
            value={filtros.tipo}
            onChange={(v) => setFiltro("tipo", v)}
            options={TIPOS_MOVIMIENTO}
          />
          <SelectField
            label="Zona"
            value={filtros.zona}
            onChange={(v) => setFiltro("zona", v)}
            options={zonasFiltro.map((z) => ({ value: String(z), label: getZonaLabel(z) }))}
          />
          <SearchField
            label="UUID de lote"
            hideLabel={false}
            value={filtros.uuid}
            onChange={(v) => setFiltro("uuid", v)}
            placeholder="Fragmento del UUID"
          />
          <SelectField
            label="Origen"
            value={filtros.origen}
            onChange={(v) => setFiltro("origen", v)}
            options={ORIGENES.map((o) => ({ value: o, label: o }))}
          />
          <SelectField
            label="Destino"
            value={filtros.destino}
            onChange={(v) => setFiltro("destino", v)}
            options={DESTINOS_SALIDA_VIVERO.map((d) => ({ value: d, label: d }))}
          />
          {/* Campo de fecha nativo: el filtro compara el día natural local. */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="filtro-fecha" className="text-body-sm font-[var(--font-weight-medium)]">
              Fecha
            </label>
            <input
              id="filtro-fecha"
              type="date"
              value={filtros.fecha}
              onChange={(e) => setFiltro("fecha", e.target.value)}
              className="h-[var(--input-height)] w-full rounded-[var(--radius-md)] border border-input bg-background px-3 text-body-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
        </FilterBar>
      </Card>

      <DataTable
        caption={
          hayFiltros
            ? `Movimientos filtrados: ${movimientosFiltrados.length} de ${movimientos.length}`
            : `Movimientos registrados: ${movimientos.length}`
        }
        columns={columnas}
        rows={movimientosFiltrados}
        rowKey={(m) => String(m.id)}
        labels={TABLE_LABELS}
        loading={loading}
        empty={
          <EmptyState
            title={hayFiltros ? "Ningún movimiento coincide con los filtros" : "Todavía no hay movimientos"}
            description={
              hayFiltros
                ? "Prueba a quitar alguno de los filtros aplicados."
                : "Registra el primero con «Nuevo movimiento»."
            }
          />
        }
      />

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
