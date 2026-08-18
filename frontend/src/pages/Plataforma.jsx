import { useEffect, useMemo, useState } from "react";

import {
  enrollAyuntamiento,
  getSuperadminStats,
  importClienteData,
  setActiveClienteId,
  updateCliente,
} from "../api/api";
import { Badge, Button, Card, CardContent, PageHeader, StatusBadge } from "../ui";
import { Alert } from "../components/ui/feedback";
import { useConfirm } from "../components/ui/ConfirmDialog";
import {
  CHART,
  CONFIRMAR_IMPORT_TEXTO,
  CONFIRMAR_IMPORT_TITULO,
  aplicarNombre,
  construirKpis,
  construirPayloadCuota,
  construirPayloadEnroll,
  geometriaEvolucion,
  mensajeAlta,
  money,
  parsearCuota,
  resumenImportacion,
} from "./plataforma.logic";

/*
 * Panel de plataforma — el dueño del SaaS da de alta ayuntamientos, fija lo que
 * paga cada uno y puede volcar una copia de seguridad sobre sus datos.
 *
 * La lógica vive en `plataforma.logic.js`, fijada por
 * `plataforma.equivalence.test.js` contra una copia literal de main; el flujo
 * de control de los diálogos, por `plataforma.flujo.test.jsx`.
 *
 * Comportamiento documentado en `docs/plataforma-behaviour.md`.
 */

const EMPTY_FORM = {
  nombre: "",
  slug: "",
  cif: "",
  direccion: "",
  email_contacto: "",
  telefono: "",
  admin_username: "",
  admin_email: "",
  admin_rol: "admin",
};

const CLASE_CONTROL =
  "h-[var(--control-height-md)] w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 outline-none focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-solid focus-visible:outline-ring";

/* ── Gráfica ───────────────────────────────────────────────────────────── */

function EvolucionChart({ data }) {
  const g = geometriaEvolucion(data);
  const { W, H, P } = CHART;

  if (!g) {
    return <p className="text-muted-foreground">Aún no hay altas registradas.</p>;
  }

  return (
    <div className="overflow-x-auto">
      {/*
       * `role="img"` con nombre: sin él, el SVG llega al lector de pantalla
       * como un montón de trazados sin significado.
       */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`Altas acumuladas de ayuntamientos por mes. Último valor: ${g.pts[g.pts.length - 1].y}.`}
        className="max-w-[640px] min-w-[320px]"
      >
        {[0, 0.5, 1].map((f, i) => {
          const y = H - P - f * (H - 2 * P);
          return (
            <g key={i}>
              <line x1={P} y1={y} x2={W - P} y2={y} stroke="var(--border)" strokeWidth="1" />
              <text x={8} y={y + 4} fontSize="11" fill="var(--muted-foreground)">
                {Math.round(f * g.maxY)}
              </text>
            </g>
          );
        })}
        {/* El área se pintaba con un degradado a mano; ahora es el color del
            sistema con opacidad, sin introducir ningún valor en crudo. */}
        <path d={g.areaPath} fill="var(--primary)" fillOpacity="0.12" />
        <path d={g.linePath} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" />
        {g.pts.map((p, i) => (
          <g key={p.x}>
            <circle cx={g.px(i)} cy={g.py(p.y)} r="4" fill="var(--primary)" />
            <text
              x={g.px(i)}
              y={H - P + 16}
              fontSize="10"
              fill="var(--muted-foreground)"
              textAnchor="middle"
            >
              {p.x}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ── Campo del formulario de alta ──────────────────────────────────────── */

function Campo({ id, label, value, onChange, placeholder, requerido }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-caption uppercase text-muted-foreground">
        {label}
        {requerido ? " *" : null}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={CLASE_CONTROL}
      />
    </div>
  );
}

/* ── Pantalla ──────────────────────────────────────────────────────────── */

export default function Plataforma() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [enrollMsg, setEnrollMsg] = useState(null);

  const [editCuota, setEditCuota] = useState(null);
  const [cuotaBusy, setCuotaBusy] = useState(false);
  const [cuotaError, setCuotaError] = useState("");

  const [importBusyId, setImportBusyId] = useState(null);
  const [importMsg, setImportMsg] = useState(null);

  const { confirmar, dialogo: dialogoConfirmacion } = useConfirm();

  const cargar = async () => {
    setLoading(true);
    setError("");
    try {
      setStats(await getSuperadminStats());
    } catch (e) {
      setError(e?.response?.data?.detail || "No se pudieron cargar las estadísticas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const resumen = stats?.resumen;
  const fact = stats?.facturacion;
  const kpis = useMemo(() => construirKpis(resumen), [resumen]);

  const submitEnroll = async (e) => {
    e.preventDefault();
    setEnrollBusy(true);
    setEnrollMsg(null);
    try {
      const res = await enrollAyuntamiento(construirPayloadEnroll(form));
      setEnrollMsg({ ok: true, text: mensajeAlta(res) });
      setForm(EMPTY_FORM);
      cargar();
    } catch (err) {
      setEnrollMsg({
        ok: false,
        text: err?.response?.data?.detail || "No se pudo crear el ayuntamiento.",
      });
    } finally {
      setEnrollBusy(false);
    }
  };

  const entrarComo = (cid) => {
    // El superadmin «entra» en un ayuntamiento: fija el X-Cliente-Id y recarga.
    // La recarga completa es deliberada: la cabecera debe aplicarse a TODAS las
    // peticiones siguientes.
    setActiveClienteId(cid);
    window.location.assign("/dashboard");
  };

  /*
   * DEFECTO CORREGIDO — el `window.confirm` que autorizaba sobrescribir los
   * datos de un ayuntamiento entero.
   *
   * Tres detalles que la sustitución no puede romper, y que están fijados en
   * `plataforma.flujo.test.jsx`:
   *
   *   1. El fichero llega por ARGUMENTO, capturado antes de vaciar el input.
   *      Leerlo del input después del `await` daría `undefined`.
   *   2. El input se vacía SIEMPRE, se confirme o no; si conservara el valor,
   *      reelegir el mismo fichero no dispararía `change`.
   *   3. La confirmación se ESPERA. `window.confirm` bloqueaba y devolvía un
   *      booleano; `useConfirm` devuelve una promesa, así que sin el `await` la
   *      importación se ejecutaría antes de que el usuario decidiera.
   */
  const importarDatos = async (cliente, file) => {
    if (!file) return;

    const ok = await confirmar({
      title: CONFIRMAR_IMPORT_TITULO,
      description: `${CONFIRMAR_IMPORT_TEXTO} Ayuntamiento afectado: ${cliente.nombre}.`,
      confirmLabel: "Importar",
      destructive: true,
    });
    if (!ok) return;

    setImportBusyId(cliente.id);
    setImportMsg(null);
    try {
      const res = await importClienteData(cliente.id, file);
      setImportMsg({ ok: true, lineas: resumenImportacion(res) });
      cargar();
    } catch (err) {
      setImportMsg({
        ok: false,
        lineas: [err?.response?.data?.detail || "No se pudo importar."],
      });
    } finally {
      setImportBusyId(null);
    }
  };

  const guardarCuota = async (clienteId, value) => {
    const { valida, num, error: errCuota } = parsearCuota(value);
    if (!valida) {
      // No se llama al backend y el editor sigue abierto con lo escrito.
      setCuotaError(errCuota);
      return;
    }
    setCuotaError("");
    setCuotaBusy(true);
    try {
      await updateCliente(clienteId, construirPayloadCuota(num));
      setEditCuota(null);
    } catch (err) {
      setCuotaError(err?.response?.data?.detail || "No se pudo actualizar la cuota.");
    } finally {
      setCuotaBusy(false);
      cargar();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Panel de plataforma"
        description="Gestión SaaS de ViverApp — ayuntamientos, uso y facturación."
      />

      {error ? <Alert tone="error">{error}</Alert> : null}
      {loading ? <p className="text-muted-foreground">Cargando estadísticas…</p> : null}

      {importMsg ? (
        <Alert tone={importMsg.ok ? "success" : "error"} onDismiss={() => setImportMsg(null)}>
          {importMsg.ok ? (
            <>
              Importación completada.
              <ul className="mt-1 list-disc ps-5">
                {importMsg.lineas.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </>
          ) : (
            importMsg.lineas[0]
          )}
        </Alert>
      ) : null}

      {stats ? (
        <>
          <section aria-labelledby="kpis-titulo">
            <h2 id="kpis-titulo" className="sr-only">
              Resumen de la plataforma
            </h2>
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))" }}
            >
              {kpis.map((k) => (
                <Card key={k.k}>
                  <CardContent className="p-4">
                    <div className="text-caption uppercase text-muted-foreground">{k.k}</div>
                    <div className="tabular text-h3 font-[var(--font-weight-semibold)]">{k.v ?? 0}</div>
                    {k.sub ? <div className="text-body-sm text-muted-foreground">{k.sub}</div> : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))" }}
            aria-labelledby="facturacion-titulo"
          >
            <Card>
              <CardContent className="p-4">
                <h2 id="facturacion-titulo" className="text-caption uppercase text-muted-foreground">
                  Facturación estimada
                </h2>
                {/* Antes: tarjeta con degradado verde y texto claro encima. */}
                <p className="tabular mt-1 text-h3 font-[var(--font-weight-semibold)]">
                  {money(fact?.ingreso_mensual_estimado)}
                  <span className="text-body-sm text-muted-foreground"> /mes</span>
                </p>
                <p className="tabular text-body-sm text-muted-foreground">
                  {money(fact?.ingreso_anual_estimado)} / año
                </p>
                <p className="mt-2 text-body-sm text-muted-foreground">
                  {fact?.ayuntamientos_facturables} ayuntamientos facturables · cuota por defecto{" "}
                  {money(fact?.cuota_mensual_por_defecto)}/mes
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <h2 className="mb-2 text-caption uppercase text-muted-foreground">
                  Evolución de altas (acumulado)
                </h2>
                <EvolucionChart data={stats.evolucion_altas} />
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="uso-titulo">
            <h2 id="uso-titulo" className="mb-2 text-caption uppercase text-muted-foreground">
              Uso por ayuntamiento
            </h2>

            {cuotaError ? <Alert tone="error">{cuotaError}</Alert> : null}

            <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)]">
              <table
                className="w-full border-collapse [&_td]:p-3 [&_td]:align-top [&_th]:p-3 [&_tbody_tr]:border-t [&_tbody_tr]:border-[var(--border)]"
                style={{ minWidth: 860 }}
              >
                <caption className="sr-only">
                  Ayuntamientos dados de alta, su uso, su cuota y las acciones disponibles.
                </caption>
                <thead>
                  <tr className="bg-[var(--muted)]">
                    <th scope="col" className="text-left text-caption font-[var(--font-weight-semibold)]">Ayuntamiento</th>
                    <th scope="col" className="text-left text-caption font-[var(--font-weight-semibold)]">Estado</th>
                    <th scope="col" className="text-left text-caption font-[var(--font-weight-semibold)]">Usuarios</th>
                    <th scope="col" className="text-left text-caption font-[var(--font-weight-semibold)]">Productos</th>
                    <th scope="col" className="text-left text-caption font-[var(--font-weight-semibold)]">Pedidos</th>
                    <th scope="col" className="text-left text-caption font-[var(--font-weight-semibold)]">Movimientos</th>
                    <th scope="col" className="text-left text-caption font-[var(--font-weight-semibold)]">Cuota</th>
                    <th scope="col" className="text-left text-caption font-[var(--font-weight-semibold)]">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.por_cliente.map((c) => {
                    const editando = editCuota && editCuota.id === c.id;
                    const cuotaInputId = `cuota-${c.id}`;
                    const importInputId = `importar-${c.id}`;
                    return (
                      <tr key={c.id}>
                        <td className="break-words [overflow-wrap:anywhere]">
                          <div className="font-[var(--font-weight-medium)]">{c.nombre}</div>
                          <div className="text-caption text-muted-foreground">
                            {c.slug} · id {c.id}
                          </div>
                        </td>
                        <td>
                          <StatusBadge
                            status={c.activo ? "active" : "inactive"}
                            label={c.activo ? "Activo" : "Inactivo"}
                          />
                        </td>
                        <td className="tabular">{c.usuarios}</td>
                        <td className="tabular">{c.productos}</td>
                        <td className="tabular">{c.pedidos}</td>
                        <td className="tabular">{c.movimientos}</td>
                        <td>
                          {editando ? (
                            <div className="flex flex-wrap items-end gap-2">
                              <div className="flex min-w-0 flex-col gap-1">
                                <label htmlFor={cuotaInputId} className="text-caption text-muted-foreground">
                                  Cuota mensual (€)
                                </label>
                                <input
                                  id={cuotaInputId}
                                  type="number"
                                  min="0"
                                  step="1"
                                  autoFocus
                                  value={editCuota.value}
                                  onChange={(e) => setEditCuota({ id: c.id, value: e.target.value })}
                                  placeholder="por defecto"
                                  className={`${CLASE_CONTROL} w-28`}
                                />
                              </div>
                              {/* Antes eran «✓» y «✕» sin nombre accesible. */}
                              <Button
                                type="button"
                                size="sm"
                                variant="primary"
                                onClick={() => guardarCuota(c.id, editCuota.value)}
                                disabled={cuotaBusy}
                              >
                                Guardar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setEditCuota(null);
                                  setCuotaError("");
                                }}
                                disabled={cuotaBusy}
                              >
                                Cancelar
                              </Button>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                aria-label={`Editar cuota de ${c.nombre}`}
                                onClick={() =>
                                  setEditCuota({
                                    id: c.id,
                                    value: c.cuota_personalizada ? c.cuota_mensual : "",
                                  })
                                }
                              >
                                {money(c.cuota_mensual)}
                              </Button>
                              {c.cuota_personalizada ? <Badge tone="info">Personalizada</Badge> : null}
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" variant="secondary" onClick={() => entrarComo(c.id)}>
                              Entrar
                            </Button>

                            {/*
                             * El input va etiquetado y visible al foco en vez de
                             * escondido dentro de un `label` sin `htmlFor`: así
                             * se alcanza con el teclado y tiene nombre.
                             */}
                            <div className="flex min-w-0 flex-col gap-1">
                              <label htmlFor={importInputId} className="text-caption text-muted-foreground">
                                {importBusyId === c.id ? "Importando…" : "Importar copia"}
                              </label>
                              <input
                                id={importInputId}
                                type="file"
                                accept="application/json,.json"
                                onChange={(e) => {
                                  // El fichero se captura ANTES de vaciar el input.
                                  const f = e.target.files?.[0];
                                  e.target.value = "";
                                  importarDatos(c, f);
                                }}
                                disabled={importBusyId === c.id}
                                className="max-w-[190px] text-body-sm"
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="alta-titulo">
            <Card>
              <CardContent className="p-4">
                <h2 id="alta-titulo" className="mb-3 text-caption uppercase text-muted-foreground">
                  Dar de alta un ayuntamiento
                </h2>

                <form onSubmit={submitEnroll} className="flex flex-col gap-3">
                  <div
                    className="grid gap-3"
                    style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}
                  >
                    <Campo
                      id="alta-nombre"
                      label="Nombre del ayuntamiento"
                      requerido
                      value={form.nombre}
                      onChange={(v) => setForm((f) => aplicarNombre(f, v))}
                      placeholder="Ayuntamiento de La Laguna"
                    />
                    <Campo
                      id="alta-slug"
                      label="Slug (identificador)"
                      requerido
                      value={form.slug}
                      onChange={(v) => setForm((f) => ({ ...f, slug: v }))}
                      placeholder="la-laguna"
                    />
                    <Campo id="alta-cif" label="CIF" value={form.cif} onChange={(v) => setForm((f) => ({ ...f, cif: v }))} />
                    <Campo
                      id="alta-telefono"
                      label="Teléfono"
                      value={form.telefono}
                      onChange={(v) => setForm((f) => ({ ...f, telefono: v }))}
                    />
                    <Campo
                      id="alta-email"
                      label="Email de contacto"
                      value={form.email_contacto}
                      onChange={(v) => setForm((f) => ({ ...f, email_contacto: v }))}
                    />
                    <Campo
                      id="alta-direccion"
                      label="Dirección"
                      value={form.direccion}
                      onChange={(v) => setForm((f) => ({ ...f, direccion: v }))}
                    />
                  </div>

                  <h3 className="mt-1 text-caption uppercase text-muted-foreground">
                    Administrador inicial de ese ayuntamiento
                  </h3>

                  <div
                    className="grid gap-3"
                    style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}
                  >
                    <Campo
                      id="alta-admin-usuario"
                      label="Usuario admin"
                      requerido
                      value={form.admin_username}
                      onChange={(v) => setForm((f) => ({ ...f, admin_username: v }))}
                      placeholder="admin_laguna"
                    />
                    <Campo
                      id="alta-admin-email"
                      label="Email del admin"
                      requerido
                      value={form.admin_email}
                      onChange={(v) => setForm((f) => ({ ...f, admin_email: v }))}
                      placeholder="admin@laguna.es"
                    />
                    <div className="flex min-w-0 flex-col gap-1">
                      <label htmlFor="alta-admin-rol" className="text-caption uppercase text-muted-foreground">
                        Rol
                      </label>
                      <select
                        id="alta-admin-rol"
                        value={form.admin_rol}
                        onChange={(e) => setForm((f) => ({ ...f, admin_rol: e.target.value }))}
                        className={CLASE_CONTROL}
                      >
                        <option value="admin">admin (administrador del ayuntamiento)</option>
                        <option value="admin_vivero">admin_vivero (admin del vivero)</option>
                      </select>
                    </div>
                  </div>

                  {enrollMsg ? (
                    <Alert tone={enrollMsg.ok ? "success" : "error"}>{enrollMsg.text}</Alert>
                  ) : null}

                  <div>
                    <Button type="submit" variant="primary" disabled={enrollBusy}>
                      {enrollBusy ? "Creando…" : "Dar de alta ayuntamiento"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </section>
        </>
      ) : null}

      {dialogoConfirmacion}
    </div>
  );
}
