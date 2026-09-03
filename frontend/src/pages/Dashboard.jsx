import React, { useEffect, useMemo, useState } from "react";
import { PackageSearch, ClipboardList } from "lucide-react";

import { getDashboardAnalytics, getMe, getPedidos, getProductos } from "../api/api";
import {
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  StatusBadge,
} from "../ui";
import { Alert, LoadingState, Truncated } from "../components/ui/feedback";
import { SectionHeader } from "../components/ui/layout";
import { KpiRow, KpiCell } from "../components/ui/KpiRow";
import ProportionBar from "../components/ui/ProportionBar";
import RankingList from "../components/ui/RankingList";
import WeekdayChart from "../components/ui/WeekdayChart";
import LinkButton from "../components/ui/LinkButton";
import { estadoPedido, estadoCaducidad } from "../app/estado";
import { formatFechaCanaria } from "../utils/fecha";
import { ROUTES, canSeeAnalitica } from "../app/permissions";

/*
 * PANEL DE CONTROL.
 *
 * Rediseño de la Fase 3. Ningún dato nuevo se inventa y ninguno de los que se
 * mostraban desaparece; lo que cambia es la jerarquía y la forma.
 *
 * Tres decisiones que conviene leer antes que el código:
 *
 * 1. SE SACA A LA SUPERFICIE EL DETALLE DE CADUCIDAD.
 *    `buildCaducidadItems` ya calculaba producto, zona, tamaño, fecha,
 *    cantidad y días restantes de cada lote — y la pantalla solo pintaba el
 *    recuento agregado en un anillo. Es decir, la aplicación tenía la
 *    respuesta a «¿qué requiere atención hoy?» y la tiraba. Ahora esa lista es
 *    lo primero que se ve cuando hay algo que atender.
 *
 * 2. LOS TRES ANILLOS PASAN A BARRAS DE PROPORCIÓN.
 *    Un anillo para tres o cuatro valores gasta 180px de alto en lo que una
 *    lista resuelve en 24px por fila, obliga a comparar ángulos y se
 *    distinguía SOLO por color. Los números mostrados son exactamente los
 *    mismos. Ver `components/ui/ProportionBar.jsx`.
 *
 * 3. LOS INDICADORES DEJAN DE SER CUATRO TARJETAS FLOTANTES.
 *    Regla explícita del sistema de diseño (§10, contradicción C8): los KPI
 *    son superficies sin borde separadas por reglas, no tarjetas.
 *
 * Se elimina además `ZonaMapModal`: `setMapOpen` nunca se llamaba con `true`,
 * así que era inalcanzable — ~485 líneas de modal montadas para nada. El mapa
 * del vivero sigue disponible desde el menú de cuenta del shell (Fase 1).
 */

/* ── Cálculos de negocio — SIN CAMBIOS respecto a la versión anterior ───── */

function getErrorMessage(reason) {
  return reason?.response?.data?.detail || reason?.message || "Error cargando datos";
}

function estadoNormalizado(value) {
  return String(value || "").trim().toUpperCase();
}

function pedidoGroupLabel(value) {
  const e = estadoNormalizado(value);
  if (e === "RESERVA" || e === "PENDIENTE") return "RESERVA";
  // Los pedidos parcialmente aprobados cuentan en el grupo APROBADO porque ya
  // tienen líneas servibles. Regla de negocio previa: se conserva.
  if (e === "APROBADO" || e === "APROBADO_PARCIAL") return "APROBADO";
  if (e === "SERVIDO") return "SERVIDO";
  if (e === "DENEGADO") return "DENEGADO";
  if (e === "CANCELADO" || e === "CADUCADO") return "CANCELADO";
  return "OTROS";
}

function toStartOfDay(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getCaducidadEstado(fechaCaducidad) {
  const objetivo = toStartOfDay(fechaCaducidad);
  if (!objetivo) return null;
  const hoy = toStartOfDay(new Date());
  const diasRestantes = Math.floor((objetivo.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
  if (diasRestantes < 0) return { estado: "Caducado", diasRestantes };
  if (diasRestantes <= 7) return { estado: "Próximo a caducar", diasRestantes };
  return { estado: "Vigente", diasRestantes };
}

function buildCaducidadKey({ producto, loteUuid, zona, tamano, fechaCaducidad, cantidad, estado }) {
  // Sin `id` ni `source`, para que alertas_caducidad y lotes que apuntan al
  // mismo inventario se fusionen en una sola entrada.
  return [
    producto?.id ?? "sin-producto",
    loteUuid || "sin-lote",
    zona || "sin-zona",
    tamano || "sin-tamano",
    fechaCaducidad || "sin-fecha",
    Number(cantidad || 0),
    estado || "sin-estado",
  ].join("::");
}

function buildCaducidadItems(productos) {
  const items = [];
  const seen = new Set();

  const pushItemFactory = (producto) => ({ zona, tamano, fechaCaducidad, cantidad, loteUuid }) => {
    const cad = getCaducidadEstado(fechaCaducidad);
    const estado = cad?.estado || "Sin fecha";
    const diasRestantes = cad?.diasRestantes ?? null;
    const dedupeKey = buildCaducidadKey({
      producto, loteUuid, zona, tamano, fechaCaducidad, cantidad,
      estado: cad?.estado || null,
    });

    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    items.push({
      id: dedupeKey,
      productoId: producto?.id ?? null,
      nombre:
        producto?.nombre_natural ||
        producto?.nombre ||
        producto?.nombre_cientifico ||
        `Producto #${producto?.id ?? "—"}`,
      categoria: String(producto?.categoria || "Sin categoría").trim() || "Sin categoría",
      subcategoria: String(producto?.subcategoria || "Sin subcategoría").trim() || "Sin subcategoría",
      zona: zona || "—",
      tamano: tamano || "—",
      fechaCaducidad: fechaCaducidad || null,
      cantidad: Number(cantidad || 0),
      loteUuid: loteUuid || "—",
      estado,
      diasRestantes,
    });
  };

  (Array.isArray(productos) ? productos : []).forEach((producto) => {
    const pushItem = pushItemFactory(producto);

    const alertas = Array.isArray(producto?.alertas_caducidad)
      ? producto.alertas_caducidad
      : Array.isArray(producto?.caducidad_alertas)
      ? producto.caducidad_alertas
      : [];

    alertas.forEach((a) =>
      pushItem({
        zona: a?.zona || a?.zone || a?.zona_id,
        tamano: a?.tamano || a?.size,
        fechaCaducidad: a?.fecha_caducidad || a?.caducidad || a?.fecha || null,
        cantidad: a?.cantidad,
        loteUuid: a?.uuid_lote || a?.lote_uuid,
      })
    );

    const lotes = Array.isArray(producto?.lotes)
      ? producto.lotes
      : Array.isArray(producto?.batches)
      ? producto.batches
      : [];

    lotes.forEach((l) =>
      pushItem({
        zona: l?.zona || l?.zone || l?.zona_id,
        tamano: l?.tamano || l?.size,
        fechaCaducidad: l?.fecha_caducidad || l?.caducidad || l?.expiry_date || null,
        cantidad: l?.cantidad,
        loteUuid: l?.uuid_lote || l?.uuid,
      })
    );
  });

  return items;
}

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

/** Formato local para cantidades. Las cifras se alinean con `tabular`. */
const numero = (n) => new Intl.NumberFormat("es-ES").format(Number(n || 0));

/* ── Pantalla ───────────────────────────────────────────────────────────── */

export default function Dashboard() {
  const [productos, setProductos] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    (async () => {
      // `allSettled`: si falla una fuente, la pantalla muestra el resto y avisa
      // de lo que falta, en lugar de quedarse en blanco. Comportamiento previo.
      const results = await Promise.allSettled([getMe(), getProductos(), getPedidos()]);
      const nextWarnings = [];
      const [meRes, productosRes, pedidosRes] = results;

      // `getMe` ya se pedía; antes se descartaba. Ahora decide si esta persona
      // puede ver la analítica agregada.
      if (meRes.status === "fulfilled") setMe(meRes.value);

      if (productosRes.status === "fulfilled") {
        setProductos(Array.isArray(productosRes.value) ? productosRes.value : []);
      } else {
        nextWarnings.push(`Productos: ${getErrorMessage(productosRes.reason)}`);
        setProductos([]);
      }

      if (pedidosRes.status === "fulfilled") {
        setPedidos(Array.isArray(pedidosRes.value) ? pedidosRes.value : []);
      } else {
        nextWarnings.push(`Pedidos: ${getErrorMessage(pedidosRes.reason)}`);
        setPedidos([]);
      }

      setWarnings(nextWarnings);
      setLoading(false);
    })();
  }, []);

  const puedeVerAnalitica = canSeeAnalitica(me);

  /*
   * La analítica se pide aparte, y solo si el rol la tiene permitida.
   *
   * Aparte, porque no debe retrasar el panel: es información de contexto, no
   * lo que se necesita para operar. Y condicionada, porque pedirla sin permiso
   * sería provocar un 403 en cada carga a propósito.
   */
  useEffect(() => {
    if (!puedeVerAnalitica) return;

    let cancelado = false;
    (async () => {
      try {
        const data = await getDashboardAnalytics();
        if (!cancelado) setAnalytics(data);
      } catch (error) {
        if (cancelado) return;
        // Un fallo aquí no puede dejar el panel en blanco: se avisa y el resto
        // de la pantalla sigue funcionando.
        setAnalytics(null);
        setWarnings((previas) => [...previas, `Analítica: ${getErrorMessage(error)}`]);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [puedeVerAnalitica]);

  const caducidadItems = useMemo(() => buildCaducidadItems(productos), [productos]);

  const metrics = useMemo(() => {
    const prods = productos || [];
    const peds = pedidos || [];
    return {
      totalProductos: prods.length,
      stockTotal: prods.reduce((acc, p) => acc + Number(p?.stock ?? p?.stock_real ?? 0), 0),
      bajoMinimo: prods.filter((p) => {
        const stock = Number(p?.stock ?? p?.stock_real ?? 0);
        const min = Number(p?.stock_minimo ?? 0);
        return Number.isFinite(min) && min > 0 && stock < min;
      }).length,
      reserva: peds.filter((p) => pedidoGroupLabel(p?.estado) === "RESERVA").length,
      aprobados: peds.filter((p) => pedidoGroupLabel(p?.estado) === "APROBADO").length,
      totalPedidos: peds.length,
    };
  }, [productos, pedidos]);

  /**
   * Productos por debajo de su mínimo.
   *
   * El mismo predicado que alimenta el indicador `bajoMinimo`: antes solo
   * existía el recuento, y saber que hay «2» sin saber cuáles no permite
   * actuar.
   */
  const bajoMinimoItems = useMemo(
    () =>
      (productos || [])
        // El índice como último recurso para la clave: `Math.random()` daría
        // una clave distinta en cada render y React remontaría todas las filas.
        .map((p, i) => ({
          id: String(p?.id ?? p?.nombre_cientifico ?? `sin-id-${i}`),
          nombre: p?.nombre_natural || p?.nombre || p?.nombre_cientifico || `Producto #${p?.id ?? "—"}`,
          categoria: String(p?.categoria || "Sin categoría").trim() || "Sin categoría",
          stock: Number(p?.stock ?? p?.stock_real ?? 0),
          minimo: Number(p?.stock_minimo ?? 0),
        }))
        .filter((p) => Number.isFinite(p.minimo) && p.minimo > 0 && p.stock < p.minimo)
        .sort((a, b) => a.stock - b.stock),
    [productos]
  );

  /**
   * Lotes que exigen actuar: caducados primero, luego los próximos a caducar,
   * y dentro de cada grupo los de menos días restantes.
   */
  const atencionCaducidad = useMemo(
    () =>
      caducidadItems
        .filter((i) => i.estado === "Caducado" || i.estado === "Próximo a caducar")
        .sort((a, b) => (a.diasRestantes ?? 0) - (b.diasRestantes ?? 0)),
    [caducidadItems]
  );

  const categoriasDist = useMemo(() => {
    const map = new Map();
    for (const p of productos || []) {
      const cat = p?.categoria || "Sin categoría";
      map.set(cat, (map.get(cat) || 0) + 1);
    }
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [productos]);

  const pedidosDist = useMemo(() => {
    const groups = new Map();
    for (const p of pedidos || []) {
      const label = pedidoGroupLabel(p?.estado);
      groups.set(label, (groups.get(label) || 0) + 1);
    }
    // Mismo orden y mismos grupos que antes; el color ya no se elige aquí.
    return ["RESERVA", "APROBADO", "SERVIDO", "DENEGADO", "CANCELADO", "OTROS"]
      .map((label) => ({ label: estadoPedido(label).label, value: groups.get(label) || 0 }))
      .filter((x) => x.value > 0);
  }, [pedidos]);

  const caducidadDist = useMemo(() => {
    const conFecha = caducidadItems.filter((i) => i.fechaCaducidad !== null);
    const cuenta = (estado) => conFecha.filter((i) => i.estado === estado).length;
    return {
      sinFecha: caducidadItems.filter((i) => i.fechaCaducidad === null).length,
      items: [
        { label: "Vigentes", value: cuenta("Vigente") },
        { label: "Próximos a caducar", value: cuenta("Próximo a caducar") },
        { label: "Caducados", value: cuenta("Caducado") },
      ].filter((i) => i.value > 0),
    };
  }, [caducidadItems]);

  const hayAtencion = atencionCaducidad.length > 0 || bajoMinimoItems.length > 0;

  /* ── Columnas ─────────────────────────────────────────────────────────── */

  const columnasCaducidad = useMemo(
    () => [
      {
        key: "nombre",
        header: "Producto",
        cell: (i) => (
          <div className="flex min-w-0 flex-col">
            <Truncated className="font-[var(--font-weight-medium)]">{i.nombre}</Truncated>
            <span className="text-caption text-muted-foreground">{i.categoria}</span>
          </div>
        ),
      },
      { key: "zona", header: "Zona", cell: (i) => i.zona, hideOnMobile: true },
      { key: "tamano", header: "Tamaño", cell: (i) => i.tamano, hideOnMobile: true },
      { key: "cantidad", header: "Cantidad", numeric: true, cell: (i) => numero(i.cantidad) },
      {
        key: "fechaCaducidad",
        header: "Caduca",
        cell: (i) => (i.fechaCaducidad ? formatFechaCanaria(i.fechaCaducidad) : "—"),
      },
      {
        key: "estado",
        header: "Estado",
        cell: (i) => {
          const { status, label } = estadoCaducidad(
            i.estado === "Caducado" ? "caducado" : "proximo_a_caducar"
          );
          const dias = i.diasRestantes;
          return (
            <div className="flex flex-col items-start gap-1">
              <StatusBadge status={status} label={label} />
              {typeof dias === "number" && (
                <span className="text-caption text-muted-foreground">
                  {dias < 0
                    ? `Hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"}`
                    : dias === 0
                    ? "Hoy"
                    : `En ${dias} día${dias === 1 ? "" : "s"}`}
                </span>
              )}
            </div>
          );
        },
      },
    ],
    []
  );

  const columnasBajoMinimo = useMemo(
    () => [
      {
        key: "nombre",
        header: "Producto",
        cell: (p) => (
          <div className="flex min-w-0 flex-col">
            <Truncated className="font-[var(--font-weight-medium)]">{p.nombre}</Truncated>
            <span className="text-caption text-muted-foreground">{p.categoria}</span>
          </div>
        ),
      },
      { key: "stock", header: "Stock", numeric: true, cell: (p) => numero(p.stock) },
      { key: "minimo", header: "Mínimo", numeric: true, cell: (p) => numero(p.minimo) },
      {
        key: "falta",
        header: "Faltan",
        numeric: true,
        cell: (p) => (
          <span className="font-[var(--font-weight-medium)] text-[var(--destructive-emphasis)]">
            {numero(p.minimo - p.stock)}
          </span>
        ),
      },
    ],
    []
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-[var(--section-gap)]">
        <PageHeader title="Panel de control" description="Estado del vivero de un vistazo." />
        <LoadingState rows={6} label="Cargando el estado del vivero…" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--section-gap)]">
      <PageHeader
        title="Panel de control"
        description="Estado operativo del vivero: existencias, caducidades y pedidos."
      />

      {/* Datos parciales: se dice QUÉ falta, no se oculta el resto. */}
      {warnings.length > 0 && (
        <Alert tone="warning" title="Algunos datos no se han podido cargar">
          <ul className="list-inside list-disc">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Alert>
      )}

      {/* ── Indicadores ──────────────────────────────────────────────────── */}
      <KpiRow>
        <KpiCell label="Productos" value={numero(metrics.totalProductos)} hint="En catálogo" />
        <KpiCell label="Stock total" value={numero(metrics.stockTotal)} hint="Unidades en existencias" />
        <KpiCell
          label="Bajo mínimo"
          value={numero(metrics.bajoMinimo)}
          hint="Productos por reponer"
          // El estado solo aparece cuando significa algo: un 0 aquí es lo
          // normal y teñirlo de verde sería celebrar la ausencia de problemas.
          status={metrics.bajoMinimo > 0 ? { status: "pending", label: "Requiere reposición" } : undefined}
        />
        <KpiCell
          label="Pedidos activos"
          value={numero(metrics.reserva + metrics.aprobados)}
          hint={`${numero(metrics.reserva)} en reserva · ${numero(metrics.aprobados)} aprobados`}
        />
      </KpiRow>

      {/* ── Lo que requiere atención ─────────────────────────────────────── */}
      <section className="flex flex-col gap-4" aria-labelledby="atencion">
        <SectionHeader
          id="atencion"
          title="Requiere atención"
          description={
            hayAtencion
              ? "Lotes con la caducidad vencida o cercana y productos por debajo de su mínimo."
              : undefined
          }
        />

        {!hayAtencion ? (
          <Card className="p-[var(--card-padding)]">
            <EmptyState
              title="No hay nada pendiente de atención"
              description="Ningún lote está caducado ni próximo a caducar, y todos los productos están por encima de su stock mínimo."
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-[var(--card-gap)] xl:grid-cols-2">
            {atencionCaducidad.length > 0 && (
              <div className="flex min-w-0 flex-col gap-3">
                <SectionHeader
                  as="h3"
                  title="Caducidades"
                  actions={
                    <LinkButton to={ROUTES.INFORMES} variant="ghost" size="sm">
                      Ver informes
                    </LinkButton>
                  }
                />
                <DataTable
                  caption="Lotes caducados o próximos a caducar, ordenados por urgencia"
                  columns={columnasCaducidad}
                  rows={atencionCaducidad}
                  rowKey={(i) => i.id}
                  labels={TABLE_LABELS}
                />
              </div>
            )}

            {bajoMinimoItems.length > 0 && (
              <div className="flex min-w-0 flex-col gap-3">
                <SectionHeader
                  as="h3"
                  title="Bajo mínimo"
                  actions={
                    <LinkButton to={ROUTES.PRODUCTOS} variant="ghost" size="sm">
                      Ver productos
                    </LinkButton>
                  }
                />
                <DataTable
                  caption="Productos por debajo de su stock mínimo, de menor a mayor existencia"
                  columns={columnasBajoMinimo}
                  rows={bajoMinimoItems}
                  rowKey={(p) => p.id}
                  labels={TABLE_LABELS}
                />
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Distribución ─────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4" aria-labelledby="distribucion">
        <SectionHeader
          id="distribucion"
          title="Distribución"
          description="Reparto del catálogo, de los pedidos y del estado de caducidad."
        />

        <div className="grid grid-cols-1 gap-[var(--card-gap)] md:grid-cols-2 xl:grid-cols-3">
          <Card className="p-[var(--card-padding)]">
            <ProportionBar
              title="Catálogo por categoría"
              items={categoriasDist}
              unit="productos"
              emptyLabel="Todavía no hay productos en el catálogo."
            />
          </Card>

          <Card className="p-[var(--card-padding)]">
            <ProportionBar
              title="Pedidos por estado"
              items={pedidosDist}
              unit="pedidos"
              emptyLabel="Todavía no hay pedidos registrados."
            />
          </Card>

          <Card className="p-[var(--card-padding)]">
            <ProportionBar
              title="Caducidad de lotes"
              items={caducidadDist.items}
              unit="lotes con fecha"
              emptyLabel="Ningún lote tiene fecha de caducidad registrada."
            />
            {caducidadDist.sinFecha > 0 && (
              <p className="mt-3 text-caption text-muted-foreground">
                Los porcentajes se calculan solo sobre lotes con fecha.{" "}
                <span className="tabular">{numero(caducidadDist.sinFecha)}</span>{" "}
                {caducidadDist.sinFecha === 1 ? "lote no la tiene" : "lotes no la tienen"}.
              </p>
            )}
          </Card>
        </div>
      </section>

      {/* ── Demanda ──────────────────────────────────────────────────────────
          Sección aparte de «Distribución» a propósito: aquélla describe lo que
          HAY en el vivero, ésta lo que se PIDE. Solo aparece cuando el rol
          puede verla y el servidor ha respondido; nunca se pinta un esqueleto
          de gráfico vacío que sugiera que no hay demanda.                    */}
      {puedeVerAnalitica && analytics && (
        <section className="flex flex-col gap-4" aria-labelledby="demanda">
          <SectionHeader
            id="demanda"
            title="Demanda"
            description="Qué se pide, a dónde se sirve y qué días entra el trabajo."
          />

          <div className="grid grid-cols-1 gap-[var(--card-gap)] md:grid-cols-2 xl:grid-cols-3">
            <Card className="flex flex-col gap-3 p-[var(--card-padding)]">
              <SectionHeader
                as="h3"
                title="Productos más demandados"
                description="Unidades pedidas en pedidos de salida."
              />
              <RankingList
                items={(analytics.productos_demandados?.items || []).map((p) => ({
                  id: p.producto_id,
                  label: p.nombre,
                  sublabel: `${numero(p.pedidos)} ${p.pedidos === 1 ? "pedido" : "pedidos"}`,
                  value: numero(p.unidades),
                  percent: p.porcentaje,
                }))}
                unit="uds."
                // Verde para la demanda y azul para los destinos: distingue
                // los dos rankings de un vistazo. El tono no dice nada de los
                // datos; dentro de cada lista todas las filas comparten color.
                tono="verde"
                emptyLabel="Todavía no hay pedidos de salida con los que calcular la demanda."
              />
              {(analytics.productos_demandados?.total_unidades || 0) > 0 && (
                <p className="text-caption text-muted-foreground">
                  <span className="tabular">
                    {numero(analytics.productos_demandados.total_unidades)}
                  </span>{" "}
                  unidades demandadas entre{" "}
                  <span className="tabular">
                    {numero(analytics.productos_demandados.productos_distintos)}
                  </span>{" "}
                  productos.
                </p>
              )}
            </Card>

            <Card className="flex flex-col gap-3 p-[var(--card-padding)]">
              <SectionHeader
                as="h3"
                title="Destinos más frecuentes"
                description="Pedidos de salida servidos a cada barrio."
              />
              <RankingList
                items={(analytics.destinos_frecuentes?.items || []).map((d, i) => ({
                  id: `${i}-${d.barrio}`,
                  label: d.barrio,
                  sublabel: d.distrito || null,
                  value: numero(d.envios),
                  percent: d.porcentaje,
                }))}
                unit="envíos"
                // Azul: es el destino, la geografía. Se mantiene el color con
                // el que ya se pintaban los envíos.
                tono="azul"
                emptyLabel="Todavía no hay pedidos de salida con un barrio de destino registrado."
              />
              {(analytics.destinos_frecuentes?.total_envios || 0) > 0 && (
                <p className="text-caption text-muted-foreground">
                  <span className="tabular">{numero(analytics.destinos_frecuentes.total_envios)}</span>{" "}
                  envíos hacia{" "}
                  <span className="tabular">
                    {numero(analytics.destinos_frecuentes.destinos_distintos)}
                  </span>{" "}
                  destinos.
                  {/* La cifra sin destino se dice, no se esconde: es la señal
                      de que hay pedidos mal cumplimentados en el origen. */}
                  {analytics.destinos_frecuentes.envios_sin_destino > 0 && (
                    <>
                      {" "}
                      <span className="tabular">
                        {numero(analytics.destinos_frecuentes.envios_sin_destino)}
                      </span>{" "}
                      sin barrio registrado, fuera del ranking.
                    </>
                  )}
                </p>
              )}
            </Card>

            <Card className="flex flex-col gap-3 p-[var(--card-padding)]">
              <SectionHeader
                as="h3"
                title="Pedidos por día de la semana"
                description="Media de pedidos recibidos, en hora canaria."
              />
              {(analytics.pedidos_por_dia?.total_pedidos || 0) > 0 ? (
                <WeekdayChart
                  dias={analytics.pedidos_por_dia.dias || []}
                  mas={analytics.pedidos_por_dia.dias_mas_pedidos || []}
                  menos={analytics.pedidos_por_dia.dias_menos_pedidos || []}
                  desde={analytics.pedidos_por_dia.desde}
                  hasta={analytics.pedidos_por_dia.hasta}
                />
              ) : (
                <p className="text-body-sm text-muted-foreground">
                  Todavía no hay pedidos recibidos de lunes a viernes.
                </p>
              )}
            </Card>
          </div>
        </section>
      )}

      {/* ── Accesos operativos ───────────────────────────────────────────── */}
      <section className="flex flex-col gap-4" aria-labelledby="accesos">
        <SectionHeader id="accesos" title="Accesos rápidos" />
        <div className="flex flex-wrap gap-2">
          <LinkButton to={ROUTES.PRODUCTOS}>
            <PackageSearch aria-hidden="true" className="size-4" />
            Catálogo de productos
          </LinkButton>
          <LinkButton to={ROUTES.PEDIDOS}>
            <ClipboardList aria-hidden="true" className="size-4" />
            Pedidos
          </LinkButton>
        </div>
      </section>
    </div>
  );
}
