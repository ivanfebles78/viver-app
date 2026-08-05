import React, { useEffect, useMemo, useState } from "react";
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
} from "../api/api";
import Modal from "../components/common/Modal";

const ROLES = [
  { value: "admin", label: "Administrador" },
  { value: "manager", label: "Manager" },
  { value: "gestor_vivero", label: "Gestor de vivero" },
  { value: "tecnico", label: "Técnico" },
  { value: "empresa_externa", label: "Empresa externa" },
];

const PAGE_SIZE = 10;

const STATUS_LABELS = {
  activo: "Activo",
  pendiente: "Pendiente",
  inactivo: "Inactivo",
  bloqueado: "Bloqueado",
};

const STATUS_STYLES = {
  activo: { bg: "#dcfce7", border: "#16a34a", color: "#166534" },
  pendiente: { bg: "#fef3c7", border: "#fbbf24", color: "#92400e" },
  inactivo: { bg: "#f1f5f9", border: "#cbd5e1", color: "#475569" },
  bloqueado: { bg: "#fee2e2", border: "#dc2626", color: "#991b1b" },
};

function extractError(err, fallback) {
  const detail = err?.response?.data?.detail;
  if (detail && typeof detail === "object") return detail.message || JSON.stringify(detail);
  if (typeof detail === "string") return detail;
  return err?.message || fallback;
}

function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.inactivo;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        background: style.bg,
        border: `1px solid ${style.border}`,
        color: style.color,
      }}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function NewUserForm({ onCancel, onCreated, onError }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState("tecnico");
  const [submitting, setSubmitting] = useState(false);

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
    setSubmitting(true);
    try {
      await adminCreateUser({
        username: username.trim(),
        email: email.trim(),
        rol,
        status: "pendiente",
      });
      onCreated();
    } catch (err) {
      onError(extractError(err, "No se pudo crear el usuario."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 style={{ margin: 0, color: "#10231a" }}>Nuevo usuario</h2>
      <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>
        El usuario quedará en estado <strong>pendiente</strong> hasta que active su cuenta desde el
        email que le enviaremos.
      </p>

      <label style={labelStyle}>
        Username
        <input
          style={inputStyle}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="p. ej. juan.perez"
          minLength={3}
          required
          autoFocus
        />
      </label>

      <label style={labelStyle}>
        Email
        <input
          style={inputStyle}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="juan.perez@santacruzdetenerife.es"
          required
        />
      </label>

      <label style={labelStyle}>
        Rol
        <select style={inputStyle} value={rol} onChange={(e) => setRol(e.target.value)}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
        <button type="button" onClick={onCancel} style={btnSecondary} disabled={submitting}>
          Cancelar
        </button>
        <button type="submit" style={btnPrimary} disabled={submitting}>
          {submitting ? "Creando…" : "Crear y enviar invitación"}
        </button>
      </div>
    </form>
  );
}

function EditUserForm({ user, onCancel, onUpdated, onError }) {
  const [email, setEmail] = useState(user.email || "");
  const [rol, setRol] = useState(user.rol || "tecnico");
  const [status, setStatus] = useState(user.status || "activo");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (email && !email.includes("@")) {
      onError("Email inválido.");
      return;
    }
    setSubmitting(true);
    try {
      await adminUpdateUser(user.id, { email: email.trim(), rol, status });
      onUpdated();
    } catch (err) {
      onError(extractError(err, "No se pudo actualizar el usuario."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 style={{ margin: 0, color: "#10231a" }}>Editar usuario</h2>
      <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>
        Username: <strong>{user.username}</strong>
      </p>

      <label style={labelStyle}>
        Email
        <input
          style={inputStyle}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>

      <label style={labelStyle}>
        Rol
        <select style={inputStyle} value={rol} onChange={(e) => setRol(e.target.value)}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <label style={labelStyle}>
        Estado
        <select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="activo">Activo</option>
          <option value="inactivo">Inactivo</option>
          <option value="pendiente">Pendiente</option>
          <option value="bloqueado">Bloqueado</option>
        </select>
      </label>

      <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>
        <strong>Inactivo</strong> revoca el acceso conservando el histórico. Para eliminar
        definitivamente al usuario usa el botón <strong>Borrar</strong> en la lista.
      </p>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
        <button type="button" onClick={onCancel} style={btnSecondary} disabled={submitting}>
          Cancelar
        </button>
        <button type="submit" style={btnPrimary} disabled={submitting}>
          {submitting ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}

export default function AdminUsuarios() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
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
  }, []);

  const flash = (msg) => {
    setInfo(msg);
    setTimeout(() => setInfo(""), 4000);
  };

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
      flash(`Correo de prueba enviado a ${res.to} (driver: ${res.driver}). Revisa la bandeja (y spam).`);
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
    const ok = window.confirm(
      "ATENCIÓN: la restauración REEMPLAZA TODOS los datos actuales (productos, " +
        "movimientos, pedidos, usuarios, etc.) por los del fichero.\n\nEsta acción no se " +
        "puede deshacer. ¿Continuar?"
    );
    if (!ok) return;
    setRestoreBusy(true);
    setError("");
    try {
      await restaurarBackup(file);
      window.alert("Restauración completada. La página se recargará.");
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
    if (!window.confirm(`¿Enviar email de reset password a ${user.email}?`)) return;
    setBusyId(user.id);
    setError("");
    try {
      await adminResetPassword(user.id);
      flash(`Email de reset password enviado a ${user.email}.`);
    } catch (err) {
      setError(extractError(err, "No se pudo enviar el reset."));
    } finally {
      setBusyId(null);
    }
  };

  const handleUnlock = async (user) => {
    if (!window.confirm(`¿Enviar email de desbloqueo a ${user.email}?`)) return;
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
    const confirmed = window.confirm(
      `¿Borrar definitivamente al usuario "${user.username}"?\n\n` +
        "Esta acción NO se puede deshacer. Si solo quieres revocarle el acceso, " +
        "edítalo y márcalo como Inactivo en su lugar."
    );
    if (!confirmed) return;
    setBusyId(user.id);
    setError("");
    try {
      await adminDeleteUser(user.id);
      flash(`Usuario "${user.username}" borrado.`);
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

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, color: "#10231a", fontSize: 28, fontWeight: 900 }}>Gestión de usuarios</h1>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontWeight: 600 }}>
            Crea cuentas, reenvía invitaciones, restablece contraseñas y desbloquea cuentas.
          </p>
        </div>
        <button style={btnPrimary} onClick={() => setModal({ type: "new" })}>
          + Nuevo usuario
        </button>
      </div>

      {info && (
        <div style={{ ...flashBox, background: "#dcfce7", borderColor: "#16a34a", color: "#166534" }}>
          {info}
        </div>
      )}

      {error && (
        <div style={{ ...flashBox, background: "#fee2e2", borderColor: "#dc2626", color: "#991b1b" }}>
          {error}
        </div>
      )}

      {/* Copia de seguridad / restauración — solo admin (esta página lo es) */}
      <div
        style={{
          marginTop: 18,
          padding: "16px 18px",
          borderRadius: 14,
          border: "1px solid rgba(15,23,42,0.10)",
          background: "#f8fafc",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontWeight: 900, color: "#0f172a", fontSize: 16 }}>🗄️ Copia de seguridad</div>
          <div style={{ color: "#64748b", fontWeight: 600, fontSize: 13, marginTop: 2 }}>
            Guarda toda la base de datos en un fichero (elige la carpeta al descargar) o restaura desde uno.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            style={{ ...btnPrimary, opacity: backupBusy ? 0.6 : 1 }}
            onClick={handleBackup}
            disabled={backupBusy || restoreBusy}
          >
            {backupBusy ? "Generando..." : "⬇ Copia de seguridad"}
          </button>
          <label
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid rgba(239,68,68,0.35)",
              background: restoreBusy ? "rgba(239,68,68,0.06)" : "#fff",
              color: "#991b1b",
              fontWeight: 900,
              cursor: restoreBusy ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {restoreBusy ? "Restaurando..." : "⬆ Restaurar"}
            <input
              type="file"
              accept="application/json,.json"
              onChange={handleRestore}
              disabled={restoreBusy || backupBusy}
              style={{ display: "none" }}
            />
          </label>
        </div>
      </div>

      {/* Diagnóstico de correo — verificar por qué no llegan los emails */}
      <div
        style={{
          marginTop: 18,
          padding: "16px 18px",
          borderRadius: 14,
          border: "1px solid rgba(15,23,42,0.10)",
          background: "#f8fafc",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 900, color: "#0f172a", fontSize: 16 }}>✉️ Diagnóstico de correo</div>
            <div style={{ color: "#64748b", fontWeight: 600, fontSize: 13, marginTop: 2 }}>
              Comprueba qué proveedor de correo está activo y envía un email de prueba.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button style={{ ...btnSecondary, opacity: emailBusy ? 0.6 : 1 }} onClick={handleEmailConfig} disabled={emailBusy}>
              {emailBusy ? "..." : "Ver configuración"}
            </button>
            <input
              type="email"
              placeholder="email de prueba"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(15,23,42,0.15)", minWidth: 200 }}
            />
            <button style={{ ...btnPrimary, opacity: emailBusy ? 0.6 : 1 }} onClick={handleEmailTest} disabled={emailBusy}>
              Enviar prueba
            </button>
          </div>
        </div>

        {emailCfg && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "#fff", border: "1px solid rgba(15,23,42,0.08)", fontSize: 13 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontWeight: 900 }}>Driver:</span>
              <span style={{ fontWeight: 900, padding: "2px 8px", borderRadius: 999, background: emailCfg.driver === "console" || emailCfg.driver === "disabled" ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.14)", color: emailCfg.driver === "console" || emailCfg.driver === "disabled" ? "#991b1b" : "#065f46" }}>
                {emailCfg.driver}
              </span>
              <span style={{ color: "#64748b" }}>· From: <strong>{emailCfg.email_from}</strong></span>
            </div>
            {emailCfg.aviso && (
              <div style={{ marginTop: 8, color: "#92400e", fontWeight: 700, background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 8, padding: "8px 10px" }}>
                ⚠ {emailCfg.aviso}
              </div>
            )}
            <div style={{ marginTop: 8, color: "#334155", lineHeight: 1.6 }}>
              <div>Resend API key: <strong>{emailCfg.resend_api_key_set ? "✓ configurada" : "—"}</strong></div>
              <div>Brevo API key: <strong>{emailCfg.brevo_api_key_set ? "✓ configurada" : "—"}</strong></div>
              <div>SMTP host: <strong>{emailCfg.smtp_host || "—"}</strong> · puerto {emailCfg.smtp_port} · TLS {emailCfg.smtp_use_tls} · SSL {emailCfg.smtp_use_ssl}</div>
              <div>SMTP usuario: <strong>{emailCfg.smtp_username_set ? "✓" : "—"}</strong> · SMTP contraseña: <strong>{emailCfg.smtp_password_set ? "✓" : "—"}</strong></div>
              <div>Frontend URL (enlaces): <strong>{emailCfg.frontend_url}</strong></div>
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 18,
          padding: "14px 16px",
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          background: "#ffffff",
          border: "1px solid rgba(15,23,42,0.08)",
          borderRadius: 14,
        }}
      >
        <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "#94a3b8",
              fontSize: 16,
              pointerEvents: "none",
            }}
          >
            🔍
          </span>
          <input
            type="search"
            placeholder="Buscar por usuario o email…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              ...inputStyle,
              width: "100%",
              paddingLeft: 36,
              boxSizing: "border-box",
            }}
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          style={{ ...inputStyle, minWidth: 180 }}
          aria-label="Filtrar por rol"
        >
          <option value="">Todos los roles</option>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ ...inputStyle, minWidth: 180 }}
          aria-label="Filtrar por estado"
        >
          <option value="">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="pendiente">Pendiente</option>
          <option value="bloqueado">Bloqueado</option>
          <option value="inactivo">Inactivo</option>
        </select>

        {hasActiveFilters && (
          <button type="button" onClick={clearFilters} style={btnSecondary}>
            Limpiar filtros
          </button>
        )}

        <div style={{ marginLeft: "auto", color: "#64748b", fontSize: 13, fontWeight: 700 }}>
          {hasActiveFilters
            ? `${filteredUsers.length} de ${users.length} usuarios`
            : `${users.length} usuarios`}
        </div>
      </div>

      <div style={{ marginTop: 14, overflowX: "auto", border: "1px solid rgba(15,23,42,0.08)", borderRadius: 14, background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#0f5132", color: "#fff" }}>
              <th style={th}>Usuario</th>
              <th style={th}>Email</th>
              <th style={th}>Rol</th>
              <th style={th}>Estado</th>
              <th style={{ ...th, textAlign: "center" }}>Fallos</th>
              <th style={{ ...th, textAlign: "right" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ ...td, textAlign: "center", color: "#64748b", padding: 28 }}>
                  Cargando…
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ ...td, textAlign: "center", color: "#64748b", padding: 28 }}>
                  {hasActiveFilters
                    ? "Ningún usuario coincide con los filtros aplicados."
                    : "No hay usuarios."}
                </td>
              </tr>
            ) : (
              pagedUsers.map((u) => {
                const isBusy = busyId === u.id;
                const status = (u.status || "").toLowerCase();
                return (
                  <tr key={u.id} style={{ borderTop: "1px solid rgba(15,23,42,0.06)" }}>
                    <td style={{ ...td, fontWeight: 800 }}>{u.username}</td>
                    <td style={td}>{u.email || <span style={{ color: "#94a3b8" }}>—</span>}</td>
                    <td style={td}>{ROLES.find((r) => r.value === u.rol)?.label || u.rol}</td>
                    <td style={td}><StatusBadge status={status} /></td>
                    <td style={{ ...td, textAlign: "center", color: u.failed_login_attempts ? "#991b1b" : "#94a3b8" }}>
                      {u.failed_login_attempts || 0}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {status === "pendiente" && (
                          <button style={btnAction} onClick={() => handleResend(u)} disabled={isBusy}>
                            Reenviar invitación
                          </button>
                        )}
                        {status === "activo" && (
                          <button style={btnAction} onClick={() => handleReset(u)} disabled={isBusy}>
                            Reset password
                          </button>
                        )}
                        {status === "bloqueado" && (
                          <button style={btnActionWarn} onClick={() => handleUnlock(u)} disabled={isBusy}>
                            Desbloquear
                          </button>
                        )}
                        <button style={btnAction} onClick={() => setModal({ type: "edit", user: u })} disabled={isBusy}>
                          Editar
                        </button>
                        <button style={btnActionDanger} onClick={() => handleDelete(u)} disabled={isBusy}>
                          Borrar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {filteredUsers.length > PAGE_SIZE && (
        <div
          style={{
            marginTop: 14,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
            justifyContent: "space-between",
          }}
        >
          <div style={{ color: "#64748b", fontSize: 13, fontWeight: 700 }}>
            Mostrando <strong>{pageStart + 1}</strong>–
            <strong>{Math.min(pageStart + PAGE_SIZE, filteredUsers.length)}</strong> de{" "}
            <strong>{filteredUsers.length}</strong>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              style={pageBtnStyle(false, safePage === 1)}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              aria-label="Página anterior"
            >
              ← Anterior
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                style={pageBtnStyle(n === safePage, false)}
                onClick={() => setPage(n)}
                aria-label={`Ir a página ${n}`}
                aria-current={n === safePage ? "page" : undefined}
              >
                {n}
              </button>
            ))}

            <button
              type="button"
              style={pageBtnStyle(false, safePage === totalPages)}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              aria-label="Página siguiente"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}

      {modal?.type === "new" && (
        <Modal onClose={() => setModal(null)}>
          <NewUserForm
            onCancel={() => setModal(null)}
            onCreated={() => {
              setModal(null);
              flash("Usuario creado. Invitación enviada por email.");
              reload();
            }}
            onError={(msg) => setError(msg)}
          />
        </Modal>
      )}

      {modal?.type === "edit" && modal.user && (
        <Modal onClose={() => setModal(null)}>
          <EditUserForm
            user={modal.user}
            onCancel={() => setModal(null)}
            onUpdated={() => {
              setModal(null);
              flash("Usuario actualizado.");
              reload();
            }}
            onError={(msg) => setError(msg)}
          />
        </Modal>
      )}
    </div>
  );
}

const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 13,
  fontWeight: 700,
  color: "#10231a",
};

const inputStyle = {
  padding: "10px 12px",
  border: "1px solid #d6d3d1",
  borderRadius: 10,
  fontSize: 14,
  outline: "none",
  fontFamily: "inherit",
  background: "#fff",
};

const btnPrimary = {
  padding: "10px 16px",
  background: "#0f5132",
  color: "#fff",
  border: 0,
  borderRadius: 10,
  fontWeight: 800,
  cursor: "pointer",
};

const btnSecondary = {
  padding: "10px 16px",
  background: "#fff",
  color: "#44403c",
  border: "1px solid #d6d3d1",
  borderRadius: 10,
  fontWeight: 700,
  cursor: "pointer",
};

const btnAction = {
  padding: "6px 10px",
  background: "#fff",
  color: "#10231a",
  border: "1px solid #d6d3d1",
  borderRadius: 8,
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 12,
};

const btnActionWarn = {
  ...btnAction,
  background: "#fef3c7",
  borderColor: "#fbbf24",
  color: "#92400e",
};

const btnActionDanger = {
  ...btnAction,
  background: "#fee2e2",
  borderColor: "#dc2626",
  color: "#991b1b",
};

const th = {
  padding: "12px 14px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const td = {
  padding: "12px 14px",
  fontSize: 14,
  color: "#10231a",
  verticalAlign: "middle",
};

const flashBox = {
  marginTop: 14,
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid",
  fontWeight: 700,
  fontSize: 14,
};

function pageBtnStyle(active, disabled) {
  return {
    minWidth: 36,
    padding: "6px 10px",
    background: active ? "#0f5132" : "#ffffff",
    color: active ? "#ffffff" : disabled ? "#cbd5e1" : "#10231a",
    border: `1px solid ${active ? "#0f5132" : "#d6d3d1"}`,
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit",
    transition: "background 0.15s ease, color 0.15s ease",
  };
}
