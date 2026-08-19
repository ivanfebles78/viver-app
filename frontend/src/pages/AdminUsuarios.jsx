import React, { useEffect, useMemo, useState } from "react";
import { KeyRound, Mail, Pencil, Trash2, Unlock, UserPlus, Download, Upload } from "lucide-react";

import {
  adminListUsers,
  adminCreateUser,
  adminUpdateUser,
  adminDeleteUser,
  adminResendInvitation,
  adminResetPassword,
  adminUnlockUser,
  descargarBackup,
  restaurarBackup,
  adminEmailConfig,
  adminEmailTest,
  getClientes,
} from "../api/api";

import {
  Button,
  buttonVariants,
  Card,
  DataTable,
  Dialog,
  DialogContent,
  Field,
  Input,
  PageHeader,
  Select,
  StatusBadge,
  EmptyState,
  cn,
} from "../ui";
import { Alert, Truncated } from "../components/ui/feedback";
import { FilterBar, FormActions, SectionHeader } from "../components/ui/layout";
import Pagination from "../components/ui/Pagination";
import RowActions from "../components/ui/RowActions";
import SearchField from "../components/ui/SearchField";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { useReturnFocus } from "../components/ui/useReturnFocus";
import { useToast } from "../components/ui/toast-context";
import { estadoUsuario } from "../app/estado";
import { ROLES, rolesParaUsuario, ESTADOS_USUARIO } from "./AdminUsuarios.roles";

/*
 * GESTIÓN DE USUARIOS — pantalla piloto de la Fase 2.
 *
 * Se ha migrado la PRESENTACIÓN a las primitivas de DevCon8. La lógica de
 * negocio es la misma línea por línea: las mismas validaciones, los mismos
 * payloads, el mismo orden de la lista, el mismo tamaño de página y las mismas
 * condiciones de visibilidad por rol.
 *
 * Los cuatro `window.confirm()` pasan a `AlertDialog`. Ese cambio NO es
 * cosmético y merece atención al leerlo: `window.confirm` bloquea y devuelve
 * un booleano, mientras que un diálogo de React no. `useConfirm()` devuelve una
 * promesa para que la guarda siga escribiéndose —y leyéndose— igual que antes,
 * pero esperando de verdad la respuesta.
 */

// Nombre corto de la institución: quita el prefijo "Ayuntamiento de/del ".
function shortInst(nombre) {
  if (!nombre) return "";
  return nombre.replace(/^Ayuntamiento\s+(de\s+la\s+|de\s+|del\s+|de\s+las\s+|de\s+los\s+)?/i, "").trim() || nombre;
}

const PAGE_SIZE = 10;

function extractError(err, fallback) {
  const detail = err?.response?.data?.detail;
  if (detail && typeof detail === "object") return detail.message || JSON.stringify(detail);
  if (typeof detail === "string") return detail;
  return err?.message || fallback;
}

/** Etiquetas de la tabla de datos, en español y en un solo sitio. */
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

/* ── Formularios ────────────────────────────────────────────────────────── */

function NewUserForm({ onCancel, onCreated, onError, esSuperadmin, clientes }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState("tecnico");
  const [clienteId, setClienteId] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const rolesDisp = rolesParaUsuario(esSuperadmin);
  const esRolSuperadmin = rol === "superadmin";

  const submit = async (e) => {
    e.preventDefault();
    if (username.trim().length < 3) {
      onError("El username debe tener al menos 3 caracteres.");
      return;
    }
    if (!email.includes("@")) {
      onError("Email inválido.");
      return;
    }
    // El superadmin debe indicar el ayuntamiento salvo que cree otro superadmin.
    if (esSuperadmin && !esRolSuperadmin && !clienteId) {
      onError("Selecciona la institución (ayuntamiento) del usuario.");
      return;
    }
    if (password && password.length < 8) {
      onError("La contraseña directa debe tener al menos 8 caracteres.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        username: username.trim(),
        email: email.trim(),
        rol,
        status: password ? "activo" : "pendiente",
      };
      if (esSuperadmin && !esRolSuperadmin && clienteId) payload.cliente_id = Number(clienteId);
      if (password) payload.password = password;
      await adminCreateUser(payload);
      onCreated();
    } catch (err) {
      onError(extractError(err, "No se pudo crear el usuario."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-[var(--form-field-gap)]">
      <p className="text-body-sm text-muted-foreground">
        Si no indicas contraseña, el usuario quedará <strong>pendiente</strong> y recibirá un email
        para activarse. Si indicas una contraseña, se crea <strong>activo</strong> y puede entrar ya.
      </p>

      <Field label="Nombre de usuario" required description="Al menos 3 caracteres.">
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="p. ej. juan.perez"
          minLength={3}
          autoFocus
        />
      </Field>

      <Field label="Email" required>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="juan.perez@santacruzdetenerife.es"
        />
      </Field>

      <Field label="Rol" required>
        <Select value={rol} onValueChange={setRol} options={rolesDisp.map((r) => ({ value: r.value, label: r.label }))} />
      </Field>

      {esSuperadmin && !esRolSuperadmin && (
        <Field label="Institución (ayuntamiento)" required>
          <Select
            value={clienteId}
            onValueChange={setClienteId}
            placeholder="Elige un ayuntamiento"
            options={(clientes || []).map((c) => ({ value: String(c.id), label: shortInst(c.nombre) }))}
          />
        </Field>
      )}

      <Field
        label="Contraseña"
        optionalLabel="(opcional)"
        description="Déjala vacía para enviar una invitación por email. Mínimo 8 caracteres."
      >
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </Field>

      <FormActions>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={submitting}>
          {password ? "Crear usuario" : "Crear y enviar invitación"}
        </Button>
      </FormActions>
    </form>
  );
}

function EditUserForm({ user, onCancel, onUpdated, onError, esSuperadmin, clientes }) {
  const [email, setEmail] = useState(user.email || "");
  const [rol, setRol] = useState(user.rol || "tecnico");
  const [status, setStatus] = useState(user.status || "activo");
  const [clienteId, setClienteId] = useState(user.cliente_id != null ? String(user.cliente_id) : "");
  const [submitting, setSubmitting] = useState(false);

  const rolesDisp = rolesParaUsuario(esSuperadmin);
  const esRolSuperadmin = rol === "superadmin";

  const submit = async (e) => {
    e.preventDefault();
    if (email && !email.includes("@")) {
      onError("Email inválido.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = { email: email.trim(), rol, status };
      // Solo el superadmin puede reasignar la institución del usuario.
      if (esSuperadmin) {
        payload.set_cliente = true;
        payload.cliente_id = esRolSuperadmin || !clienteId ? null : Number(clienteId);
      }
      await adminUpdateUser(user.id, payload);
      onUpdated();
    } catch (err) {
      onError(extractError(err, "No se pudo actualizar el usuario."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-[var(--form-field-gap)]">
      <p className="text-body-sm text-muted-foreground">
        Usuario: <strong className="text-foreground">{user.username}</strong>
      </p>

      <Field label="Email" required>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>

      <Field label="Rol" required>
        <Select value={rol} onValueChange={setRol} options={rolesDisp.map((r) => ({ value: r.value, label: r.label }))} />
      </Field>

      {esSuperadmin && (
        <Field
          label="Institución (ayuntamiento)"
          disabled={esRolSuperadmin}
          description={esRolSuperadmin ? "Un superadmin no pertenece a ningún ayuntamiento." : undefined}
        >
          <Select
            value={esRolSuperadmin ? "" : clienteId}
            onValueChange={setClienteId}
            placeholder={esRolSuperadmin ? "Ninguno (plataforma)" : "Elige un ayuntamiento"}
            options={(clientes || []).map((c) => ({ value: String(c.id), label: shortInst(c.nombre) }))}
          />
        </Field>
      )}

      <Field
        label="Estado"
        required
        description="«Inactivo» revoca el acceso conservando el histórico. Para eliminar al usuario definitivamente, usa «Borrar» en la lista."
      >
        <Select value={status} onValueChange={setStatus} options={ESTADOS_USUARIO} />
      </Field>

      <FormActions>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={submitting}>
          Guardar cambios
        </Button>
      </FormActions>
    </form>
  );
}

/* ── Herramientas de plataforma (solo superadmin) ───────────────────────── */

function HerramientasPlataforma({
  backupBusy, restoreBusy, emailBusy, emailCfg, testTo, setTestTo,
  onBackup, onRestore, onEmailConfig, onEmailTest,
}) {
  const driverDegradado = emailCfg?.driver === "console" || emailCfg?.driver === "disabled";

  return (
    <div className="flex flex-col gap-[var(--card-gap)]">
      <Card className="flex flex-col gap-4 p-[var(--card-padding)]">
        <SectionHeader
          title="Copia de seguridad"
          description="Guarda toda la base de datos en un fichero o restaura desde uno."
          actions={
            <>
              <Button variant="secondary" onClick={onBackup} loading={backupBusy} disabled={restoreBusy}>
                <Download aria-hidden="true" className="size-4" />
                Descargar copia
              </Button>
              {/*
                Restaurar es la acción más destructiva de la aplicación: reemplaza
                TODOS los datos. Sigue siendo un <input type="file"> envuelto en
                <label> porque abrir el selector de ficheros requiere el gesto
                nativo; lo que cambia es que ahora, tras elegir fichero, hay una
                confirmación explícita antes de tocar nada.

                Se usa `buttonVariants` sobre el <label> en lugar de
                `<Button asChild>`: `Button` renderiza siempre
                `{loading && <spinner/>}` antes de sus hijos, así que con
                `asChild` el `Slot` de Radix recibe DOS hijos —`false` y la
                etiqueta— y falla. Aplicar las clases directamente evita el
                problema y deja el <label> como el elemento real, que es lo que
                hace que al pulsarlo se abra el selector de ficheros.
              */}
              <label
                className={cn(
                  buttonVariants({ variant: "outline", size: "md" }),
                  restoreBusy || backupBusy ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                )}
              >
                <Upload aria-hidden="true" className="size-4" />
                {restoreBusy ? "Restaurando…" : "Restaurar copia"}
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={onRestore}
                  disabled={restoreBusy || backupBusy}
                  className="sr-only"
                />
              </label>
            </>
          }
        />
      </Card>

      <Card className="flex flex-col gap-4 p-[var(--card-padding)]">
        <SectionHeader
          title="Diagnóstico de correo"
          description="Comprueba qué proveedor de correo está activo y envía un email de prueba."
          actions={
            <Button variant="secondary" onClick={onEmailConfig} loading={emailBusy}>
              Ver configuración
            </Button>
          }
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Email de destino para la prueba" className="sm:max-w-sm sm:flex-1">
            <Input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="persona@ayuntamiento.es"
            />
          </Field>
          <Button variant="primary" onClick={onEmailTest} loading={emailBusy}>
            <Mail aria-hidden="true" className="size-4" />
            Enviar prueba
          </Button>
        </div>

        {emailCfg && (
          <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-[var(--surface-sunken)] p-3">
            <p className="flex flex-wrap items-center gap-2 text-body-sm">
              <span className="font-[var(--font-weight-semibold)]">Proveedor:</span>
              <StatusBadge
                status={driverDegradado ? "rejected" : "active"}
                label={emailCfg.driver}
              />
              <span className="text-muted-foreground">
                Remitente: <strong className="text-foreground">{emailCfg.email_from}</strong>
              </span>
            </p>

            {emailCfg.aviso && <Alert tone="warning">{emailCfg.aviso}</Alert>}

            <dl className="grid grid-cols-1 gap-1 text-body-sm sm:grid-cols-2">
              {[
                ["Clave de Resend", emailCfg.resend_api_key_set ? "Configurada" : "—"],
                ["Clave de Brevo", emailCfg.brevo_api_key_set ? "Configurada" : "—"],
                ["Servidor SMTP", `${emailCfg.smtp_host || "—"} · puerto ${emailCfg.smtp_port} · TLS ${emailCfg.smtp_use_tls} · SSL ${emailCfg.smtp_use_ssl}`],
                ["Credenciales SMTP", `usuario ${emailCfg.smtp_username_set ? "sí" : "—"} · contraseña ${emailCfg.smtp_password_set ? "sí" : "—"}`],
                ["URL del frontend", emailCfg.frontend_url],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-wrap gap-x-2">
                  <dt className="text-muted-foreground">{k}:</dt>
                  <dd className="min-w-0 font-[var(--font-weight-medium)]">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ── Pantalla ───────────────────────────────────────────────────────────── */

export default function AdminUsuarios() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const [modal, setModal] = useState(null); // { type: "new" | "edit", user? }

  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [emailCfg, setEmailCfg] = useState(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [testTo, setTestTo] = useState("");

  const toast = useToast();
  const { confirmar, dialogo } = useConfirm();

  // Los diálogos de esta pantalla son controlados por estado y no tienen
  // DialogTrigger, así que Radix no sabe a dónde devolver el foco al cerrar.
  useReturnFocus(modal != null);

  // ¿El usuario actual es el superadmin de la plataforma? Las herramientas
  // globales (copia de seguridad de TODA la BD y config de correo) son solo
  // suyas; un admin de un ayuntamiento no debe verlas.
  const esSuperadmin = useMemo(() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "null");
      return (
        !!(u?.es_superadmin || u?.es_admin_global) ||
        (u?.rol || "").toLowerCase() === "superadmin"
      );
    } catch {
      return false;
    }
  }, []);

  const [clientes, setClientes] = useState([]);

  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminListUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(extractError(err, "No se pudo cargar el listado de usuarios."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    getClientes().then((cs) => setClientes(Array.isArray(cs) ? cs : [])).catch(() => {});
  }, []);

  /* Antes `flash()` con un temporizador de 4s. Ahora un aviso efímero que
     además se anuncia a los lectores de pantalla y se puede pausar al pasar
     el puntero. */
  const flash = (msg) => toast.success(msg);

  const handleBackup = async () => {
    setBackupBusy(true);
    setError("");
    try {
      const filename = await descargarBackup();
      if (filename) flash(`Copia de seguridad guardada (${filename}).`);
    } catch (err) {
      setError(extractError(err, "No se pudo generar la copia de seguridad."));
    } finally {
      setBackupBusy(false);
    }
  };

  const handleEmailConfig = async () => {
    setEmailBusy(true);
    setError("");
    try {
      const cfg = await adminEmailConfig();
      setEmailCfg(cfg);
    } catch (err) {
      setError(extractError(err, "No se pudo leer la configuración de correo."));
    } finally {
      setEmailBusy(false);
    }
  };

  const handleEmailTest = async () => {
    const dest = (testTo || "").trim();
    if (!dest) { setError("Indica un email de destino para la prueba."); return; }
    setEmailBusy(true);
    setError("");
    try {
      const res = await adminEmailTest(dest);
      flash(`Correo de prueba enviado a ${res.to} (proveedor: ${res.driver}). Revisa la bandeja y el spam.`);
    } catch (err) {
      setError(extractError(err, "No se pudo enviar el correo de prueba."));
    } finally {
      setEmailBusy(false);
    }
  };

  const handleRestore = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // permite volver a elegir el mismo fichero
    if (!file) return;
    const ok = await confirmar({
      title: "Vas a reemplazar todos los datos",
      description:
        `Restaurar «${file.name}» sustituye TODOS los datos actuales — productos, movimientos, ` +
        "pedidos, usuarios — por los del fichero. Esta acción no se puede deshacer.",
      confirmLabel: "Restaurar y reemplazar",
      destructive: true,
    });
    if (!ok) return;
    setRestoreBusy(true);
    setError("");
    try {
      await restaurarBackup(file);
      // El original avisaba con un alert() bloqueante antes de recargar. Se
      // conserva la recarga, que es lo funcional; el aviso ya no bloquea.
      toast.success("Restauración completada. La página se va a recargar.");
      window.location.reload();
    } catch (err) {
      setError(extractError(err, "No se pudo restaurar la copia de seguridad."));
      setRestoreBusy(false);
    }
  };

  const handleResend = async (user) => {
    setBusyId(user.id);
    setError("");
    try {
      await adminResendInvitation(user.id);
      flash(`Invitación reenviada a ${user.email}.`);
    } catch (err) {
      setError(extractError(err, "No se pudo reenviar la invitación."));
    } finally {
      setBusyId(null);
    }
  };

  const handleReset = async (user) => {
    const ok = await confirmar({
      title: "Restablecer la contraseña",
      description: `Se enviará un email a ${user.email} con un enlace para definir una contraseña nueva. La actual dejará de funcionar cuando la persona use el enlace.`,
      confirmLabel: "Enviar email",
    });
    if (!ok) return;
    setBusyId(user.id);
    setError("");
    try {
      await adminResetPassword(user.id);
      flash(`Email de restablecimiento enviado a ${user.email}.`);
    } catch (err) {
      setError(extractError(err, "No se pudo enviar el restablecimiento."));
    } finally {
      setBusyId(null);
    }
  };

  const handleUnlock = async (user) => {
    const ok = await confirmar({
      title: "Desbloquear la cuenta",
      description: `Se enviará un email a ${user.email} para que vuelva a tener acceso definiendo una contraseña nueva.`,
      confirmLabel: "Enviar email",
    });
    if (!ok) return;
    setBusyId(user.id);
    setError("");
    try {
      await adminUnlockUser(user.id);
      flash(`Email de desbloqueo enviado a ${user.email}.`);
    } catch (err) {
      setError(extractError(err, "No se pudo desbloquear al usuario."));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (user) => {
    const ok = await confirmar({
      title: `Borrar a «${user.username}»`,
      description:
        "El usuario se elimina definitivamente y la acción no se puede deshacer. " +
        "Si solo quieres revocarle el acceso, edítalo y márcalo como Inactivo.",
      confirmLabel: "Borrar definitivamente",
      destructive: true,
    });
    if (!ok) return;
    setBusyId(user.id);
    setError("");
    try {
      await adminDeleteUser(user.id);
      flash(`Usuario «${user.username}» borrado.`);
      reload();
    } catch (err) {
      setError(extractError(err, "No se pudo borrar al usuario."));
    } finally {
      setBusyId(null);
    }
  };

  const filteredUsers = useMemo(() => {
    const order = { pendiente: 0, bloqueado: 1, activo: 2, inactivo: 3 };
    const needle = searchTerm.trim().toLowerCase();

    return [...users]
      .filter((u) => {
        if (roleFilter && (u.rol || "").toLowerCase() !== roleFilter) return false;
        if (statusFilter && (u.status || "").toLowerCase() !== statusFilter) return false;
        if (needle) {
          const haystack = `${u.username || ""} ${u.email || ""}`.toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const oa = order[a.status] ?? 99;
        const ob = order[b.status] ?? 99;
        if (oa !== ob) return oa - ob;
        return (a.username || "").localeCompare(b.username || "");
      });
  }, [users, searchTerm, roleFilter, statusFilter]);

  const hasActiveFilters = Boolean(searchTerm || roleFilter || statusFilter);
  const clearFilters = () => {
    setSearchTerm("");
    setRoleFilter("");
    setStatusFilter("");
  };

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pagedUsers = filteredUsers.slice(pageStart, pageStart + PAGE_SIZE);

  // Si los filtros reducen la lista por debajo de la página actual, vuelve a 1.
  useEffect(() => {
    setPage(1);
  }, [searchTerm, roleFilter, statusFilter]);

  /*
   * Columnas de la tabla.
   *
   * El ORDEN de este array es el orden visible. Está declarado en un solo
   * sitio a propósito: es el contrato que una futura exportación tendría que
   * respetar (ver `docs/data-table-contract.md`).
   */
  const columnas = useMemo(
    () => [
      {
        key: "username",
        header: "Usuario",
        cell: (u) => <span className="font-[var(--font-weight-medium)]">{u.username}</span>,
      },
      {
        key: "email",
        header: "Email",
        cell: (u) =>
          u.email ? <Truncated>{u.email}</Truncated> : <span className="text-muted-foreground">—</span>,
      },
      {
        key: "rol",
        header: "Rol",
        cell: (u) => ROLES.find((r) => r.value === u.rol)?.label || u.rol,
        hideOnMobile: true,
      },
      {
        key: "institucion",
        header: "Institución",
        cell: (u) =>
          u.cliente_nombre ? (
            <Truncated>{shortInst(u.cliente_nombre)}</Truncated>
          ) : (
            // Sin ayuntamiento = cuenta de plataforma. Antes iba en verde, que
            // en este sistema significa "éxito"; aquí es una etiqueta neutra.
            <span className="text-muted-foreground">Plataforma</span>
          ),
        hideOnMobile: true,
      },
      {
        key: "status",
        header: "Estado",
        cell: (u) => {
          const { status, label } = estadoUsuario(u.status);
          return <StatusBadge status={status} label={label} />;
        },
      },
      {
        key: "failed_login_attempts",
        header: "Fallos",
        numeric: true,
        hideOnMobile: true,
        cell: (u) => (
          <span className={u.failed_login_attempts ? "text-[var(--destructive-emphasis)]" : "text-muted-foreground"}>
            {u.failed_login_attempts || 0}
          </span>
        ),
      },
      {
        key: "acciones",
        header: "Acciones",
        cell: (u) => {
          const status = (u.status || "").toLowerCase();
          return (
            <div className="flex justify-end">
              <RowActions
                row={u}
                disabled={busyId === u.id}
                label={`Acciones para ${u.username}`}
                items={[
                  { label: "Reenviar invitación", icon: Mail, when: () => status === "pendiente", onSelect: handleResend },
                  { label: "Restablecer contraseña", icon: KeyRound, when: () => status === "activo", onSelect: handleReset },
                  { label: "Desbloquear", icon: Unlock, when: () => status === "bloqueado", onSelect: handleUnlock },
                  { label: "Editar", icon: Pencil, onSelect: (row) => setModal({ type: "edit", user: row }) },
                  { label: "Borrar", icon: Trash2, destructive: true, onSelect: handleDelete },
                ]}
              />
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- los manejadores son estables dentro de un render; `busyId` es lo único que cambia el estado deshabilitado del menú
    [busyId]
  );

  return (
    <div className="flex flex-col gap-[var(--section-gap)]">
      <PageHeader
        title="Gestión de usuarios"
        description="Crea cuentas, reenvía invitaciones, restablece contraseñas y desbloquea cuentas."
        actions={
          <Button variant="primary" onClick={() => setModal({ type: "new" })}>
            <UserPlus aria-hidden="true" className="size-4" />
            Nuevo usuario
          </Button>
        }
      />

      {error && (
        <Alert tone="error" title="No se ha podido completar la operación" onDismiss={() => setError("")}>
          {error}
        </Alert>
      )}

      {/* Herramientas GLOBALES de plataforma: SOLO el superadmin. Un admin de
          ayuntamiento no debe verlas. */}
      {esSuperadmin && (
        <HerramientasPlataforma
          backupBusy={backupBusy}
          restoreBusy={restoreBusy}
          emailBusy={emailBusy}
          emailCfg={emailCfg}
          testTo={testTo}
          setTestTo={setTestTo}
          onBackup={handleBackup}
          onRestore={handleRestore}
          onEmailConfig={handleEmailConfig}
          onEmailTest={handleEmailTest}
        />
      )}

      <div className="flex flex-col gap-4">
        <FilterBar
          label="Filtros de usuarios"
          actions={
            hasActiveFilters ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            ) : null
          }
        >
          {/* La etiqueta va visible como en los otros dos filtros: si se
              oculta, este control queda más alto que los demás y la fila se ve
              desalineada. */}
          <SearchField
            label="Buscar"
            hideLabel={false}
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Usuario o email…"
          />
          <Field label="Rol">
            <Select
              value={roleFilter}
              onValueChange={setRoleFilter}
              placeholder="Todos los roles"
              options={ROLES.map((r) => ({ value: r.value, label: r.label }))}
            />
          </Field>
          <Field label="Estado">
            <Select
              value={statusFilter}
              onValueChange={setStatusFilter}
              placeholder="Todos los estados"
              options={ESTADOS_USUARIO}
            />
          </Field>
        </FilterBar>

        <DataTable
          caption="Listado de cuentas de usuario del ayuntamiento"
          columns={columnas}
          rows={pagedUsers}
          rowKey={(u) => String(u.id)}
          labels={TABLE_LABELS}
          loading={loading}
          empty={
            <EmptyState
              title={hasActiveFilters ? "Ningún usuario coincide con los filtros" : "Todavía no hay usuarios"}
              description={
                hasActiveFilters
                  ? "Prueba a quitar algún filtro o a buscar otro término."
                  : "Crea la primera cuenta con el botón «Nuevo usuario»."
              }
              action={
                hasActiveFilters ? (
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Limpiar filtros
                  </Button>
                ) : null
              }
            />
          }
        />

        <Pagination
          page={safePage}
          pageCount={totalPages}
          onPageChange={setPage}
          totalItems={filteredUsers.length}
          itemNoun="usuario"
          itemNounPlural="usuarios"
        />
      </div>

      <Dialog open={modal?.type === "new"} onOpenChange={(abierto) => !abierto && setModal(null)}>
        <DialogContent
          title="Nuevo usuario"
          description="La cuenta se crea en el ayuntamiento activo salvo que indiques otro."
          closeLabel="Cerrar"
        >
          <NewUserForm
            esSuperadmin={esSuperadmin}
            clientes={clientes}
            onCancel={() => setModal(null)}
            onCreated={() => {
              setModal(null);
              flash("Usuario creado.");
              reload();
            }}
            onError={(msg) => setError(msg)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={modal?.type === "edit"} onOpenChange={(abierto) => !abierto && setModal(null)}>
        <DialogContent title="Editar usuario" closeLabel="Cerrar">
          {modal?.user && (
            <EditUserForm
              user={modal.user}
              esSuperadmin={esSuperadmin}
              clientes={clientes}
              onCancel={() => setModal(null)}
              onUpdated={() => {
                setModal(null);
                flash("Usuario actualizado.");
                reload();
              }}
              onError={(msg) => setError(msg)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* El diálogo de confirmación se monta una sola vez y lo controla el hook. */}
      {dialogo}
    </div>
  );
}
