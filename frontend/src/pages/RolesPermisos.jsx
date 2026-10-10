import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Plus, Trash2, Save } from "lucide-react";

import { getRoles, crearRol, actualizarRol, eliminarRol } from "../api/api";
import { Button, Card, Field, Input, PageHeader, StatusBadge, Status } from "../ui";
import { Alert } from "../components/ui/feedback";
import { useConfirm } from "../components/ui/ConfirmDialog";

/*
 * ROLES Y PERMISOS — editor de la matriz por AYUNTAMIENTO.
 *
 * Cada ayuntamiento tiene su propio juego de roles (sembrado de la matriz por
 * defecto) y es TOTALMENTE independiente: añadir, renombrar o borrar un rol aquí
 * solo afecta al ayuntamiento activo. El superadmin edita el de cualquiera (lo
 * elige con el selector de ayuntamiento). El rol `superadmin` no aparece: lo
 * puede todo y no se edita.
 *
 * Cada celda define el acceso de un rol a una funcionalidad: No / Solo lectura /
 * Sí. Las casillas de "alcance de datos" (abajo) filtran lo que ve el rol.
 */

const nivelesDe = (func) => (func.soporta_lectura ? ["none", "read", "full"] : ["none", "full"]);
const NIVEL_LABEL = { none: "No", read: "Solo lectura", full: "Sí" };

const selCtrl =
  "h-[var(--control-height-sm)] w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-body-sm outline-none focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-solid focus-visible:outline-ring";

export default function RolesPermisos() {
  const { me } = useOutletContext() || {};
  const [catalogo, setCatalogo] = useState(null);
  const [roles, setRoles] = useState([]);
  const [dirty, setDirty] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [creando, setCreando] = useState(false);
  const { confirmar, dialogo } = useConfirm();

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getRoles();
      setCatalogo(data.catalogo);
      setRoles(data.roles || []);
      setDirty({});
    } catch (e) {
      setError(e?.response?.data?.detail || "No se pudieron cargar los roles.");
      setCatalogo(null);
      setRoles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga única al montar
  }, []);

  const marcar = (id) => setDirty((d) => ({ ...d, [id]: true }));

  const setNivel = (rolId, func, nivel) => {
    setRoles((rs) => rs.map((r) => (r.id === rolId ? { ...r, permisos: { ...r.permisos, [func]: nivel } } : r)));
    marcar(rolId);
  };
  const setNombre = (rolId, nombre) => {
    setRoles((rs) => rs.map((r) => (r.id === rolId ? { ...r, nombre } : r)));
    marcar(rolId);
  };
  const setScope = (rolId, flag, val) => {
    setRoles((rs) => rs.map((r) => (r.id === rolId ? { ...r, scope: { ...r.scope, [flag]: val } } : r)));
    marcar(rolId);
  };

  const guardar = async (rol) => {
    setBusyId(rol.id);
    setError("");
    setMsg("");
    try {
      await actualizarRol(rol.id, {
        nombre: rol.nombre,
        permisos: rol.permisos,
        solo_sus_pedidos: !!rol.scope.solo_sus_pedidos,
        solo_reposiciones_aprobadas: !!rol.scope.solo_reposiciones_aprobadas,
        ocultar_internos: !!rol.scope.ocultar_internos,
      });
      setDirty((d) => {
        const n = { ...d };
        delete n[rol.id];
        return n;
      });
      setMsg(`Rol «${rol.nombre}» guardado.`);
    } catch (e) {
      setError(e?.response?.data?.detail || "No se pudo guardar el rol.");
    } finally {
      setBusyId(null);
    }
  };

  const borrar = async (rol) => {
    const ok = await confirmar({
      title: `¿Borrar el rol «${rol.nombre}»?`,
      description: "Solo afecta a este ayuntamiento. No se puede deshacer.",
      confirmLabel: "Borrar",
      destructive: true,
    });
    if (!ok) return;
    setBusyId(rol.id);
    setError("");
    setMsg("");
    try {
      await eliminarRol(rol.id);
      await load();
      setMsg(`Rol «${rol.nombre}» borrado.`);
    } catch (e) {
      setError(e?.response?.data?.detail || "No se pudo borrar el rol.");
    } finally {
      setBusyId(null);
    }
  };

  const crear = async () => {
    const nombre = nuevoNombre.trim();
    if (nombre.length < 2) {
      setError("Escribe un nombre para el rol (mínimo 2 caracteres).");
      return;
    }
    setCreando(true);
    setError("");
    setMsg("");
    try {
      await crearRol({ nombre });
      setNuevoNombre("");
      await load();
      setMsg(`Rol «${nombre}» creado.`);
    } catch (e) {
      setError(e?.response?.data?.detail || "No se pudo crear el rol.");
    } finally {
      setCreando(false);
    }
  };

  const grupos = catalogo?.grupos || [];
  const funcs = catalogo?.funcionalidades || [];
  const scopeFlags = catalogo?.scope_flags || [];
  const funcsByGrupo = useMemo(() => {
    const m = {};
    for (const f of funcs) (m[f.grupo] = m[f.grupo] || []).push(f);
    return m;
  }, [funcs]);

  const thSticky =
    "sticky left-0 z-10 bg-[var(--muted)] p-2 text-left align-bottom text-caption font-[var(--font-weight-semibold)] min-w-[220px]";
  const tdSticky =
    "sticky left-0 z-10 bg-[var(--card)] p-2 text-body-sm min-w-[220px] border-t border-[var(--border)]";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Roles y permisos"
        description="Define qué puede hacer cada rol en ESTE ayuntamiento. Los cambios no afectan a otros ayuntamientos."
      />

      {msg ? (
        <Alert tone="success" onDismiss={() => setMsg("")}>
          {msg}
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="error" onDismiss={() => setError("")}>
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : !catalogo ? (
        <p className="text-muted-foreground">No hay datos de roles para mostrar.</p>
      ) : (
        <>
          <Card className="flex flex-wrap items-end gap-3 p-[var(--card-padding)]">
            <Field label="Nuevo rol" className="min-w-[220px] flex-1">
              <Input
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                placeholder="Ej.: Jardinero, Encargado de riego…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    crear();
                  }
                }}
              />
            </Field>
            <Button type="button" variant="primary" onClick={crear} loading={creando}>
              <Plus className="size-4" aria-hidden="true" />
              Crear rol
            </Button>
          </Card>

          <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)]">
            <table className="w-full border-collapse">
              <caption className="sr-only">
                Matriz de permisos: filas = funcionalidades, columnas = roles del ayuntamiento.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={thSticky}>
                    Funcionalidad
                  </th>
                  {roles.map((r) => (
                    <th key={r.id} scope="col" className="min-w-[180px] bg-[var(--muted)] p-2 align-bottom">
                      <div className="flex flex-col gap-1.5">
                        <input
                          value={r.nombre}
                          onChange={(e) => setNombre(r.id, e.target.value)}
                          aria-label={`Nombre del rol ${r.nombre}`}
                          className={selCtrl}
                        />
                        <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
                          {r.es_sistema ? <StatusBadge status={Status.ACTIVE} label="Sistema" /> : null}
                          <span>
                            {r.usuarios_asignados} usuario{r.usuarios_asignados === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="primary"
                            onClick={() => guardar(r)}
                            disabled={!dirty[r.id] || busyId === r.id}
                            loading={busyId === r.id}
                          >
                            <Save className="size-3.5" aria-hidden="true" />
                            Guardar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => borrar(r)}
                            disabled={busyId === r.id || r.usuarios_asignados > 0}
                            title={r.usuarios_asignados > 0 ? "Reasigna sus usuarios antes de borrar" : "Borrar rol"}
                          >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grupos.map((g) => (
                  <React.Fragment key={g.clave}>
                    <tr>
                      <th
                        scope="colgroup"
                        colSpan={roles.length + 1}
                        className="sticky left-0 bg-[var(--muted)] p-2 text-left text-caption font-[var(--font-weight-semibold)] uppercase text-muted-foreground"
                      >
                        {g.etiqueta}
                      </th>
                    </tr>
                    {(funcsByGrupo[g.clave] || []).map((f) => (
                      <tr key={f.clave}>
                        <th scope="row" className={tdSticky + " font-[var(--font-weight-medium)]"}>
                          {f.etiqueta}
                          {f.solo_superadmin ? (
                            <span className="mt-0.5 block text-caption text-muted-foreground">
                              Gestionado por el superadmin (plataforma)
                            </span>
                          ) : null}
                        </th>
                        {roles.map((r) => {
                          const nivel = r.permisos[f.clave] || "none";
                          return (
                            <td key={r.id} className="border-t border-[var(--border)] p-2">
                              <select
                                value={nivel}
                                disabled={f.solo_superadmin}
                                onChange={(e) => setNivel(r.id, f.clave, e.target.value)}
                                aria-label={`${f.etiqueta} para ${r.nombre}`}
                                className={selCtrl + (f.solo_superadmin ? " opacity-50" : "")}
                              >
                                {nivelesDe(f).map((n) => (
                                  <option key={n} value={n}>
                                    {NIVEL_LABEL[n]}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}

                {/* Casillas de ALCANCE de datos (filtran lo que ve el rol). */}
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={roles.length + 1}
                    className="sticky left-0 bg-[var(--muted)] p-2 text-left text-caption font-[var(--font-weight-semibold)] uppercase text-muted-foreground"
                  >
                    Alcance de datos
                  </th>
                </tr>
                {scopeFlags.map((flag) => (
                  <tr key={flag.clave}>
                    <th scope="row" className={tdSticky}>
                      <span className="font-[var(--font-weight-medium)]">{flag.etiqueta}</span>
                      <span className="mt-0.5 block text-caption text-muted-foreground">{flag.descripcion}</span>
                    </th>
                    {roles.map((r) => (
                      <td key={r.id} className="border-t border-[var(--border)] p-2 text-center">
                        <input
                          type="checkbox"
                          checked={!!r.scope[flag.clave]}
                          onChange={(e) => setScope(r.id, flag.clave, e.target.checked)}
                          aria-label={`${flag.etiqueta} para ${r.nombre}`}
                          className="size-4 accent-[var(--primary)]"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-body-sm text-muted-foreground">
            Recuerda pulsar «Guardar» en cada rol que cambies. El rol superadmin no aparece: tiene acceso total y no se
            edita.
          </p>
        </>
      )}

      {dialogo}
    </div>
  );
}
