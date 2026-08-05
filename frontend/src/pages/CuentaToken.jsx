import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { validateAccountToken, consumeAccountToken } from "../api/api";

import logo from "../assets/ViverApp_logo.png";

const PURPOSE_COPY = {
  activate: {
    title: "Activa tu cuenta",
    subtitle: "Define la contraseña con la que accederás a ViverApp.",
    submitLabel: "Activar cuenta",
    successText: "Cuenta activada correctamente. Ya puedes iniciar sesión.",
  },
  reset: {
    title: "Restablece tu contraseña",
    subtitle: "Define una nueva contraseña para tu cuenta de ViverApp.",
    submitLabel: "Guardar nueva contraseña",
    successText: "Contraseña restablecida correctamente. Ya puedes iniciar sesión.",
  },
  unlock: {
    title: "Desbloquea tu cuenta",
    subtitle: "Tu cuenta ha sido desbloqueada. Define una nueva contraseña para acceder.",
    submitLabel: "Definir nueva contraseña",
    successText: "Cuenta desbloqueada correctamente. Ya puedes iniciar sesión.",
  },
};

function extractError(err, fallback) {
  const detail = err?.response?.data?.detail;
  if (detail && typeof detail === "object") {
    if (detail.message) return detail.message;
  }
  if (typeof detail === "string") return detail;
  return err?.message || fallback;
}

function shieldIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2 4 5v6c0 5 3.4 9.5 8 11 4.6-1.5 8-6 8-11V5l-8-3Z"
        stroke="#0f5132"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="m9 12 2 2 4-4" stroke="#0f5132" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function CuentaToken({ purposeOverride }) {
  const { token } = useParams();
  const navigate = useNavigate();

  const [phase, setPhase] = useState("loading"); // loading | form | submitting | success | error
  const [errorMsg, setErrorMsg] = useState("");
  const [purpose, setPurpose] = useState(purposeOverride || "activate");
  const [username, setUsername] = useState("");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const copy = useMemo(() => PURPOSE_COPY[purpose] || PURPOSE_COPY.activate, [purpose]);

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setErrorMsg("");
    validateAccountToken(token)
      .then((data) => {
        if (cancelled) return;
        setPurpose(data?.purpose || purposeOverride || "activate");
        setUsername(data?.username || "");
        setPhase("form");
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMsg(extractError(err, "Este enlace no es válido."));
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token, purposeOverride]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    if (password.length < 8) {
      setErrorMsg("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setErrorMsg("Las contraseñas no coinciden.");
      return;
    }

    setPhase("submitting");
    try {
      await consumeAccountToken(token, password);
      setPhase("success");
      setTimeout(() => navigate("/login", { replace: true }), 2500);
    } catch (err) {
      setErrorMsg(extractError(err, "No se pudo completar la operación."));
      setPhase("form");
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          {logo ? (
            <img src={logo} alt="ViverApp" style={styles.logo} />
          ) : (
            <div style={styles.logoPlaceholder}>ViverApp</div>
          )}
        </div>

        <div style={styles.body}>
          <div style={styles.iconWrap}>{shieldIcon()}</div>

          {phase === "loading" && (
            <>
              <h1 style={styles.title}>Verificando enlace…</h1>
              <p style={styles.subtitle}>Un momento, comprobando que tu enlace es válido.</p>
            </>
          )}

          {phase === "error" && (
            <>
              <h1 style={{ ...styles.title, color: "#991b1b" }}>Enlace no válido</h1>
              <p style={styles.subtitle}>{errorMsg}</p>
              <button
                type="button"
                style={styles.primaryBtn}
                onClick={() => navigate("/login", { replace: true })}
              >
                Volver al inicio de sesión
              </button>
            </>
          )}

          {phase === "success" && (
            <>
              <h1 style={{ ...styles.title, color: "#166534" }}>¡Listo!</h1>
              <p style={styles.subtitle}>{copy.successText}</p>
              <p style={styles.helperText}>Te redirigimos al login en unos segundos…</p>
            </>
          )}

          {(phase === "form" || phase === "submitting") && (
            <>
              <h1 style={styles.title}>{copy.title}</h1>
              <p style={styles.subtitle}>{copy.subtitle}</p>
              {username && (
                <p style={styles.usernameLine}>
                  Cuenta: <strong>{username}</strong>
                </p>
              )}

              <form onSubmit={onSubmit} style={styles.form}>
                <label style={styles.label}>
                  Nueva contraseña
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={styles.input}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    disabled={phase === "submitting"}
                  />
                </label>

                <label style={styles.label}>
                  Confirma la contraseña
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    style={styles.input}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    disabled={phase === "submitting"}
                  />
                </label>

                <p style={styles.hint}>
                  Mínimo 8 caracteres. Usa una mezcla de letras, números y símbolos.
                </p>

                {errorMsg && <div style={styles.errorBox}>{errorMsg}</div>}

                <button type="submit" style={styles.primaryBtn} disabled={phase === "submitting"}>
                  {phase === "submitting" ? "Guardando…" : copy.submitLabel}
                </button>
              </form>
            </>
          )}
        </div>

        <div style={styles.footer}>
          ViverApp · Ayuntamiento de Santa Cruz de Tenerife
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #f8fafc 0%, #ecfdf5 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  },
  card: {
    width: "min(480px, 100%)",
    background: "#ffffff",
    borderRadius: 22,
    boxShadow: "0 30px 80px rgba(2,6,23,0.18)",
    overflow: "hidden",
    border: "1px solid rgba(15,23,42,0.06)",
  },
  header: {
    display: "flex",
    justifyContent: "center",
    padding: "28px 24px 0",
  },
  logo: {
    height: 44,
    objectFit: "contain",
  },
  logoPlaceholder: {
    fontWeight: 900,
    fontSize: 22,
    color: "#0f5132",
    letterSpacing: "0.02em",
  },
  body: {
    padding: "20px 36px 28px",
    textAlign: "center",
  },
  iconWrap: {
    display: "flex",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    margin: "0 0 6px",
    fontSize: 24,
    fontWeight: 800,
    color: "#10231a",
  },
  subtitle: {
    margin: 0,
    color: "#64748b",
    fontSize: 14,
    lineHeight: 1.5,
  },
  usernameLine: {
    margin: "10px 0 0",
    color: "#10231a",
    fontSize: 13,
  },
  helperText: {
    marginTop: 16,
    color: "#64748b",
    fontSize: 13,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    marginTop: 18,
    textAlign: "left",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 13,
    fontWeight: 700,
    color: "#10231a",
  },
  input: {
    padding: "10px 12px",
    border: "1px solid #d6d3d1",
    borderRadius: 10,
    fontSize: 14,
    outline: "none",
    fontFamily: "inherit",
  },
  hint: {
    margin: 0,
    fontSize: 12,
    color: "#64748b",
  },
  errorBox: {
    padding: "10px 12px",
    borderRadius: 10,
    background: "rgba(239,68,68,0.08)",
    border: "1px solid rgba(239,68,68,0.25)",
    color: "#991b1b",
    fontSize: 13,
    fontWeight: 600,
  },
  primaryBtn: {
    padding: "12px 14px",
    background: "#0f5132",
    color: "#ffffff",
    border: 0,
    borderRadius: 10,
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
    marginTop: 4,
  },
  footer: {
    padding: "14px 24px",
    background: "#f8fafc",
    borderTop: "1px solid rgba(15,23,42,0.06)",
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
  },
};
