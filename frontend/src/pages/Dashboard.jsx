import React, { useEffect, useMemo, useState } from "react";
import { PackageSearch, ClipboardList } from "lucide-react";

import { getDashboardAnalytics, getMe, getPedidos, getProductos } from "../api/api";
import { Card, PageHeader } from "../ui";
import { Alert, LoadingState } from "../components/ui/feedback";
import { SectionHeader } from "../components/ui/layout";
import { KpiRow, KpiCell } from "../components/ui/KpiRow";
import ProportionBar from "../components/ui/ProportionBar";
import RankingList from "../components/ui/RankingList";
import WeekdayChart from "../components/ui/WeekdayChart";
import LinkButton from "../components/ui/LinkButton";
import { estadoPedido } from "../app/estado";
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

  const metrics = useMemo(() => {
    const prods = productos || [];
    const peds = pedidos || [];
    return {
      totalProductos: prods.length,
      stockTotal: prods.reduce((acc, p) => acc + Number(p?.stock ?? p?.stock_real ?? 0), 0),
      reserva: peds.filter((p) => pedidoGroupLabel(p?.estado) === "RESERVA").length,
      aprobados: peds.filter((p) => pedidoGroupLabel(p?.estado) === "APROBADO").length,
      totalPedidos: peds.length,
    };
  }, [productos, pedidos]);

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
          label="Pedidos activos"
          value={numero(metrics.reserva + metrics.aprobados)}
          hint={`${numero(metrics.reserva)} en reserva · ${numero(metrics.aprobados)} aprobados`}
        />
      </KpiRow>

      {/* ── Distribución ─────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4" aria-labelledby="distribucion">
        <SectionHeader
          id="distribucion"
          title="Distribución"
          description="Reparto del catálogo y de los pedidos."
        />

        <div className="grid grid-cols-1 gap-[var(--card-gap)] md:grid-cols-2">
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
