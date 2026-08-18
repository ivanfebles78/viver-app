import React, { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";

import { aprobarPedido, decidirPedido, denegarPedido, descargarPedidoPdf, getPedidos } from "../api/api";
import { formatCantidad } from "../utils/numero";
import { Button, Dialog, DialogContent, StatusBadge } from "../ui";
import { Alert } from "../components/ui/feedback";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { estadoPedido } from "../app/estado";
import {
  agruparPorDestino,
  construirPayloadDecisiones,
  destinoDePedido,
  estadoLabel,
  filtrarPedidos,
  fmtFechaES,
  itemEstado,
  mensajeConAvisos,
  progresoDecision,
  puedeAtajoDeFila,
  puedeDecidir,
  puedeVerPdf,
  resumenDecisiones,
  safeArray,
  solicitanteFromPedido,
  tieneVariosDestinos,
} from "./aprobaciones.logic";

/*
 * Aprobaciones — decisión sobre los pedidos del vivero.
 *
 * Toda la lógica de negocio vive en `aprobaciones.logic.js` y está fijada por
 * `aprobaciones.equivalence.test.js` contra una copia literal de main. Este
 * fichero es SOLO presentación.
 *
 * Comportamiento documentado en `docs/aprobaciones-behaviour.md`.
 */

const ESTADO_FILTERS = [
  { value: "TODOS", label: "Todos" },
  { value: "PENDIENTES", label: "Pendientes (Reserva + Parcial)" },
  { value: "RESERVA", label: "Reserva" },
  { value: "APROBADO_PARCIAL", label: "Aprobado parcial" },
  { value: "APROBADO", label: "Aprobado" },
  { value: "DENEGADO", label: "Denegado" },
  { value: "SERVIDO", label: "Servido" },
  { value: "CANCELADO", label: "Cancelado" },
  { value: "CADUCADO", label: "Caducado" },
];

/*
 * El estado de LÍNEA solo admite tres valores; se traduce al vocabulario del
 * sistema de diseño para no inventar una segunda paleta. `pending` es el ámbar
 * de «falta decidir», que es exactamente lo que significa RESERVA en una línea.
 */
const ESTADO_ITEM_STATUS = {
  APROBADO: "approved",
  SERVIDO: "completed",
  DENEGADO: "rejected",
  RESERVA: "pending",
};

const ESTADO_ITEM_LABEL = {
  APROBADO: "Aprobado",
  SERVIDO: "Servido",
  DENEGADO: "Denegado",
  RESERVA: "Pendiente",
};

/** Reposición y salida son TIPOS, no estados: por eso van en un `Badge` neutro. */
function TipoPedido({ tipo }) {
  const esReposicion = tipo === "reposicion";
  return (
    <span className="inline-flex items-center rounded-[var(--radius-full)] border border-[var(--border)] bg-[var(--muted)] px-2 py-0.5 text-caption font-[var(--font-weight-medium)] text-muted-foreground">
      {esReposicion ? "Reposición" : "Salida"}
    </span>
  );
}

function EstadoPedidoBadge({ estado }) {
  const def = estadoPedido(estado);
  return <StatusBadge status={def.status} label={estadoLabel(estado)} />;
}

/* ── Modal de detalle ──────────────────────────────────────────────────── */

function DetallePedidoModal({ pedido, onClose, canApprove = false, onPedidoUpdated, onMessage }) {
  // Las decisiones viven SOLO aquí: nada llega al backend hasta «Confirmar».
  // Cerrar el modal las descarta, que es el comportamiento de main.
  const [pendingDecisions, setPendingDecisions] = useState({});
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [colapsados, setColapsados] = useState({});

  const toggleColapsado = (dst) => setColapsados((p) => ({ ...p, [dst]: !p[dst] }));

  useEffect(() => {
    setPendingDecisions({});
    setMotivo("");
  }, [pedido?.id]);

  if (!pedido) return null;

  const fmtFechaHora = (v) => {
    if (!v) return "—";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(d);
  };

  const items = safeArray(pedido.items);
  const { pendingCount, decidedLocalCount, allDecided, anyDenied } = progresoDecision(pedido, pendingDecisions);
  const canShowPdf = puedeVerPdf(pedido);
  const variosDestinos = tieneVariosDestinos(pedido);
  const gruposDestino = agruparPorDestino(pedido);
  const destino = destinoDePedido(pedido);
  const destinosUnicos = gruposDestino.length;
  const solicitante = solicitanteFromPedido(pedido);

  const setDecision = (itemId, decision) =>
    setPendingDecisions((prev) => ({ ...prev, [itemId]: decision }));

  const submitDecisions = async () => {
    if (!allDecided || submitting) return;
    const payload = construirPayloadDecisiones(pedido, pendingDecisions, motivo);
    setSubmitting(true);
    try {
      const updated = await decidirPedido(pedido.id, payload);
      if (onPedidoUpdated) onPedidoUpdated(updated);
      if (onMessage) onMessage(mensajeConAvisos(resumenDecisiones(pedido.id, payload), updated));
      setPendingDecisions({});
      setMotivo("");
    } catch (e) {
      if (onMessage) onMessage(e?.response?.data?.detail || e?.message || "Error aplicando las decisiones");
    } finally {
      setSubmitting(false);
    }
  };

  const downloadPdf = async () => {
    try {
      await descargarPedidoPdf(pedido.id);
    } catch (e) {
      if (onMessage) onMessage(e?.response?.data?.detail || e?.message || "Error descargando el PDF");
    }
  };

  const motivoId = "aprobaciones-motivo-denegacion";

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent
        title={`Detalle del pedido #${pedido.id}`}
        description="Líneas del pedido y decisión de aprobación."
        closeLabel="Cerrar"
        size="lg"
        className="max-w-[min(1100px,96vw)]"
      >
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <TipoPedido tipo={pedido.tipo} />
            <EstadoPedidoBadge estado={pedido.estado} />
          </div>

          {/* Ficha de cabecera. `auto-fit` para que a 320 px se apile sola. */}
          <dl
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}
          >
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-3">
              <dt className="text-caption uppercase text-muted-foreground">Fecha creación</dt>
              <dd className="mt-1 break-words [overflow-wrap:anywhere] font-[var(--font-weight-medium)]">{fmtFechaHora(pedido.created_at)}</dd>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-3">
              <dt className="text-caption uppercase text-muted-foreground">Solicitante</dt>
              <dd className="mt-1 break-words [overflow-wrap:anywhere] font-[var(--font-weight-medium)]">{solicitante}</dd>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-3 sm:col-span-full">
              <dt className="text-caption uppercase text-muted-foreground">Destino</dt>
              <dd className="mt-1 break-words [overflow-wrap:anywhere] font-[var(--font-weight-medium)]">
                {variosDestinos ? `${destinosUnicos} destinos (productos agrupados abajo)` : destino}
              </dd>
            </div>
          </dl>

          {pedido.nota ? <Alert tone="info">{pedido.nota}</Alert> : null}

          <h3 className="text-body font-[var(--font-weight-semibold)]">
            Productos del pedido ({items.length})
          </h3>

          {items.length === 0 ? (
            <p className="text-muted-foreground">Este pedido no tiene líneas.</p>
          ) : (
            /*
             * `min-width` para que la tabla pueda EXCEDER al contenedor y el
             * scroll horizontal se active de verdad. Sin él, las celdas se
             * comprimen y los botones de decisión se salen de su columna: es
             * exactamente el defecto que se corrigió en Productos.
             */
            <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)]">
              <table className="w-full border-collapse" style={{ minWidth: canApprove ? 780 : 620 }}>
                <caption className="sr-only">
                  Líneas del pedido, agrupadas por destino, con su estado y la decisión pendiente.
                </caption>
                <thead>
                  <tr className="bg-[var(--muted)]">
                    <th scope="col" className="p-3 text-left text-caption font-[var(--font-weight-semibold)]">Producto</th>
                    <th scope="col" className="p-3 text-left text-caption font-[var(--font-weight-semibold)]">Tamaño</th>
                    <th scope="col" className="p-3 text-left text-caption font-[var(--font-weight-semibold)]">Cantidad</th>
                    <th scope="col" className="p-3 text-left text-caption font-[var(--font-weight-semibold)]">Servido</th>
                    <th scope="col" className="p-3 text-left text-caption font-[var(--font-weight-semibold)]">Pendiente</th>
                    <th scope="col" className="p-3 text-left text-caption font-[var(--font-weight-semibold)]">Estado</th>
                    {canApprove ? (
                      <th scope="col" className="p-3 text-left text-caption font-[var(--font-weight-semibold)]">Decisión</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {gruposDestino.map((grupo) => {
                    const colapsado = !!colapsados[grupo.destino];
                    const panelId = `destino-${grupo.destino.replace(/\W+/g, "-")}`;
                    return (
                      <React.Fragment key={grupo.destino}>
                        <tr>
                          <th
                            scope="colgroup"
                            colSpan={canApprove ? 7 : 6}
                            className="border-t border-[var(--border)] bg-[var(--muted)] p-0 text-left"
                          >
                            {/*
                             * Antes era un `td` con `onClick`: no se podía
                             * alcanzar con el teclado y no anunciaba si el
                             * grupo estaba plegado. Ahora es un botón real con
                             * `aria-expanded`.
                             *
                             * Cada destino se distinguía además con uno de diez
                             * colores intensos codificados a mano. El nombre del
                             * destino ya está escrito al lado: el color no
                             * añadía información y era el único canal para quien
                             * no lo percibe (SC 1.4.1).
                             */}
                            <button
                              type="button"
                              onClick={() => toggleColapsado(grupo.destino)}
                              aria-expanded={!colapsado}
                              aria-controls={panelId}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left font-[var(--font-weight-semibold)] outline-none focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-[-2px]"
                            >
                              <span aria-hidden="true">{colapsado ? "▶" : "▼"}</span>
                              <span className="min-w-0 break-words">{grupo.destino}</span>
                              <span className="text-muted-foreground">({grupo.items.length})</span>
                            </button>
                          </th>
                        </tr>
                        {!colapsado &&
                          grupo.items.map((it, idx) => {
                            const cantidad = Number(it.cantidad || 0);
                            const servida = Number(it.cantidad_servida || 0);
                            const pendiente = Math.max(cantidad - servida, 0);
                            const estIt = itemEstado(it);
                            const isReserva = estIt === "RESERVA";
                            const decision = pendingDecisions[it.id];
                            const productoLabel =
                              it.producto_nombre_cientifico ||
                              it.producto_nombre ||
                              it.producto_nombre_natural ||
                              `Producto #${it.producto_id}`;
                            return (
                              <tr
                                key={it.id || `${grupo.destino}-${idx}`}
                                id={panelId}
                                className="border-t border-[var(--border)]"
                              >
                                <td className="p-3 align-top">
                                  <span className={estIt === "DENEGADO" ? "line-through" : undefined}>
                                    {productoLabel}
                                  </span>
                                </td>
                                <td className="p-3 align-top">{it.tamano || "—"}</td>
                                <td className="tabular p-3 align-top font-[var(--font-weight-medium)]">
                                  {formatCantidad(cantidad) || "0"}
                                </td>
                                <td className="tabular p-3 align-top">{formatCantidad(servida) || "0"}</td>
                                <td className="tabular p-3 align-top">{formatCantidad(pendiente) || "0"}</td>
                                <td className="p-3 align-top">
                                  <StatusBadge
                                    status={ESTADO_ITEM_STATUS[estIt] || "draft"}
                                    label={ESTADO_ITEM_LABEL[estIt] || estIt}
                                  />
                                </td>
                                {canApprove ? (
                                  <td className="p-3 align-top">
                                    {isReserva ? (
                                      /*
                                       * `aria-pressed` es lo que faltaba: la
                                       * decisión elegida se señalaba SOLO con
                                       * color y sombra, así que con un lector de
                                       * pantalla no había manera de saber qué se
                                       * había marcado antes de confirmar.
                                       */
                                      <div className="flex flex-wrap gap-2">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant={decision === "aprobar" ? "primary" : "secondary"}
                                          aria-pressed={decision === "aprobar"}
                                          disabled={submitting}
                                          onClick={() => setDecision(it.id, "aprobar")}
                                          title="Marcar esta línea como aprobada (no se aplica hasta confirmar)"
                                        >
                                          Aprobar
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant={decision === "denegar" ? "destructive" : "secondary"}
                                          aria-pressed={decision === "denegar"}
                                          disabled={submitting}
                                          onClick={() => setDecision(it.id, "denegar")}
                                          title="Marcar esta línea como denegada (no se aplica hasta confirmar)"
                                        >
                                          Denegar
                                        </Button>
                                      </div>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </td>
                                ) : null}
                              </tr>
                            );
                          })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pie: o se decide, o se descarga el PDF. */}
          {canApprove && pendingCount > 0 ? (
            <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-4">
              {/* `role=status` para que el progreso se anuncie al ir decidiendo. */}
              <p role="status" className="text-body-sm text-muted-foreground">
                {allDecided
                  ? `Listo: ${decidedLocalCount} de ${pendingCount} líneas decididas. Pulsa «Confirmar decisiones» para aplicar.`
                  : `Decide TODAS las líneas antes de confirmar (${decidedLocalCount}/${pendingCount} hechas).`}
              </p>

              <div className="flex flex-wrap items-end gap-3">
                {anyDenied ? (
                  <div className="flex min-w-0 flex-1 flex-col gap-1" style={{ flexBasis: "min(260px, 100%)" }}>
                    <label htmlFor={motivoId} className="text-caption text-muted-foreground">
                      Motivo de denegación (opcional)
                    </label>
                    <input
                      id={motivoId}
                      type="text"
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      disabled={submitting}
                      className="h-[var(--control-height-md)] w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 outline-none focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-solid focus-visible:outline-ring"
                    />
                  </div>
                ) : null}

                <Button type="button" variant="primary" disabled={!allDecided || submitting} onClick={submitDecisions}>
                  {submitting ? "Aplicando…" : "Confirmar decisiones"}
                </Button>

                {canShowPdf ? (
                  <Button type="button" variant="secondary" onClick={downloadPdf}>
                    Descargar PDF
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
              <p className="text-body-sm text-muted-foreground">
                {String(pedido.estado || "").toUpperCase() === "DENEGADO"
                  ? "Pedido denegado. El PDF contiene el detalle y el motivo de denegación."
                  : canShowPdf
                    ? "Hay líneas aprobadas disponibles en el PDF."
                    : "Sin decisión registrada todavía."}
              </p>
              {canShowPdf ? (
                <Button type="button" variant="secondary" onClick={downloadPdf}>
                  Descargar PDF
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Pantalla ──────────────────────────────────────────────────────────── */

export default function Aprobaciones() {
  const { me } = useOutletContext();
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [estadoFiltro, setEstadoFiltro] = useState("TODOS");
  const [idFiltro, setIdFiltro] = useState("");
  const [fechaFiltro, setFechaFiltro] = useState("");
  const [solicitanteFiltro, setSolicitanteFiltro] = useState("");
  const [textoFiltro, setTextoFiltro] = useState("");
  const [detallePedido, setDetallePedido] = useState(null);

  const { confirmar, dialogo: dialogoConfirmacion } = useConfirm();

  const msgTimerRef = useRef(null);

  const clearMsgTimer = () => {
    if (msgTimerRef.current) {
      clearTimeout(msgTimerRef.current);
      msgTimerRef.current = null;
    }
  };

  const closeMessage = () => {
    clearMsgTimer();
    setMsg("");
  };

  const showTimedMessage = (text) => {
    clearMsgTimer();
    setMsg(text);
    msgTimerRef.current = setTimeout(() => {
      setMsg("");
      msgTimerRef.current = null;
    }, 3000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await getPedidos();
      setPedidos(safeArray(data));
    } catch (e) {
      showTimedMessage(e?.response?.data?.detail || e?.message || "Error cargando aprobaciones");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    return () => clearMsgTimer();
  }, []);

  const pedidosFiltrados = useMemo(
    () => filtrarPedidos(pedidos, { estadoFiltro, idFiltro, fechaFiltro, solicitanteFiltro, textoFiltro }),
    [pedidos, estadoFiltro, idFiltro, fechaFiltro, solicitanteFiltro, textoFiltro]
  );

  /*
   * DEFECTO CORREGIDO: «Aprobar» y «Denegar» disparaban la decisión de
   * inmediato, sin confirmación de ninguna clase. Aprobar o denegar un pedido
   * es irreversible desde la interfaz.
   *
   * La confirmación se ESPERA antes de llamar al backend: `useConfirm`
   * devuelve una promesa, así que no hay inversión de control como la que
   * provoca `window.confirm`. Si el usuario cancela, no se llama a nada.
   */
  const decidirPedidoCompleto = async (pedido, accion) => {
    const esAprobar = accion === "aprobar";
    const ok = await confirmar({
      title: esAprobar ? `¿Aprobar el pedido #${pedido.id}?` : `¿Denegar el pedido #${pedido.id}?`,
      description: `Se ${esAprobar ? "aprobará" : "denegará"} el pedido completo de ${solicitanteFromPedido(pedido)}. La decisión no se puede deshacer desde la aplicación.`,
      confirmLabel: esAprobar ? "Aprobar" : "Denegar",
      destructive: !esAprobar,
    });
    if (!ok) return;

    try {
      const updated = esAprobar ? await aprobarPedido(pedido.id, {}) : await denegarPedido(pedido.id, {});
      await load();
      showTimedMessage(
        mensajeConAvisos(`Pedido #${pedido.id} ${esAprobar ? "aprobado" : "denegado"}.`, updated)
      );
    } catch (e) {
      showTimedMessage(
        e?.response?.data?.detail || e?.message || `Error ${esAprobar ? "aprobando" : "denegando"} pedido`
      );
    }
  };

  const canApprove = puedeDecidir(me);

  const campoFiltro = (id, label, control) => (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-caption uppercase text-muted-foreground">
        {label}
      </label>
      {control}
    </div>
  );

  const claseControl =
    "h-[var(--control-height-md)] w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 outline-none focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-solid focus-visible:outline-ring";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-h2 font-[var(--font-weight-semibold)]">Aprobaciones</h1>
          <p className="text-body-sm text-muted-foreground">
            Decisión sobre los pedidos pendientes del vivero.
          </p>
        </div>
      </div>

      {/* `Alert` lleva el rol ARIA; el aviso anterior solo se pintaba. */}
      {msg ? (
        <Alert tone="success" onDismiss={closeMessage}>
          {msg}
        </Alert>
      ) : null}

      <section className="mt-4">
        <h2 className="sr-only">Lista de aprobaciones</h2>

        {/*
         * Antes: cinco columnas con anchos fijos en `minmax(...)` que sumaban
         * más de 900 px. Por debajo de esa anchura los campos se comprimían
         * hasta cortarse. `auto-fit` los reparte y los apila cuando no caben.
         */}
        <div
          className="mb-4 grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}
        >
          {campoFiltro(
            "filtro-id",
            "ID",
            <input
              id="filtro-id"
              placeholder="Filtrar por ID"
              value={idFiltro}
              onChange={(e) => setIdFiltro(e.target.value)}
              className={claseControl}
            />
          )}
          {campoFiltro(
            "filtro-estado",
            "Tipo de reserva",
            <select
              id="filtro-estado"
              value={estadoFiltro}
              onChange={(e) => setEstadoFiltro(e.target.value)}
              className={claseControl}
            >
              {ESTADO_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          )}
          {campoFiltro(
            "filtro-fecha",
            "Fecha",
            <input
              id="filtro-fecha"
              type="date"
              value={fechaFiltro}
              onChange={(e) => setFechaFiltro(e.target.value)}
              className={claseControl}
            />
          )}
          {campoFiltro(
            "filtro-solicitante",
            "Solicitante",
            <input
              id="filtro-solicitante"
              placeholder="Solicitante"
              value={solicitanteFiltro}
              onChange={(e) => setSolicitanteFiltro(e.target.value)}
              className={claseControl}
            />
          )}
          {campoFiltro(
            "filtro-texto",
            "Texto",
            <input
              id="filtro-texto"
              placeholder="Buscar en detalle, estado, ID…"
              value={textoFiltro}
              onChange={(e) => setTextoFiltro(e.target.value)}
              className={claseControl}
            />
          )}
        </div>

        {loading ? (
          <p className="text-muted-foreground">Cargando…</p>
        ) : pedidosFiltrados.length === 0 ? (
          <p className="text-muted-foreground">No hay pedidos para los filtros seleccionados.</p>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)]">
            <table className="w-full border-collapse" style={{ minWidth: 820 }}>
              <caption className="sr-only">
                Pedidos filtrados, con su estado y las acciones disponibles.
              </caption>
              <thead>
                <tr className="bg-[var(--muted)]">
                  <th scope="col" className="p-3 text-left text-caption font-[var(--font-weight-semibold)]">ID</th>
                  <th scope="col" className="p-3 text-left text-caption font-[var(--font-weight-semibold)]">Tipo</th>
                  <th scope="col" className="p-3 text-left text-caption font-[var(--font-weight-semibold)]">Fecha</th>
                  <th scope="col" className="p-3 text-left text-caption font-[var(--font-weight-semibold)]">Solicitante</th>
                  <th scope="col" className="p-3 text-left text-caption font-[var(--font-weight-semibold)]">Estado</th>
                  <th scope="col" className="p-3 text-left text-caption font-[var(--font-weight-semibold)]">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pedidosFiltrados.map((p) => {
                  const atajo = puedeAtajoDeFila(p, me);
                  return (
                    <tr key={p.id} className="border-t border-[var(--border)]">
                      <td className="tabular p-3 align-top font-[var(--font-weight-medium)]">#{p.id}</td>
                      <td className="p-3 align-top">
                        <TipoPedido tipo={p.tipo} />
                      </td>
                      <td className="p-3 align-top">{fmtFechaES(p.created_at)}</td>
                      <td className="p-3 align-top break-words [overflow-wrap:anywhere]">{solicitanteFromPedido(p)}</td>
                      <td className="p-3 align-top">
                        <EstadoPedidoBadge estado={p.estado || "RESERVA"} />
                      </td>
                      <td className="p-3 align-top">
                        <div className="flex flex-wrap gap-2">
                          {atajo ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="primary"
                                onClick={() => decidirPedidoCompleto(p, "aprobar")}
                              >
                                Aprobar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() => decidirPedidoCompleto(p, "denegar")}
                              >
                                Denegar
                              </Button>
                            </>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => setDetallePedido(p)}
                            title="Ver detalle del pedido"
                          >
                            Detalle
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detallePedido ? (
        <DetallePedidoModal
          pedido={detallePedido}
          canApprove={canApprove}
          onClose={() => setDetallePedido(null)}
          onPedidoUpdated={async () => {
            await load();
            setDetallePedido(null);
          }}
          onMessage={showTimedMessage}
        />
      ) : null}

      {dialogoConfirmacion}
    </div>
  );
}

