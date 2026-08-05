import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, requestPasswordReset } from "../api/api";
import Modal from "../components/common/Modal";

import logo from "../assets/ViverApp_logo.png";
// Imagen "hero" del landing de ViverApp. Sustituye a la del vivero municipal.
// Para cambiarla, reemplaza el fichero frontend/src/assets/landing.png.
import viveroImg from "../assets/landing.png";
import "./Login.css";

function formatError(err) {
  const detail = err?.response?.data?.detail;

  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        if (typeof d === "string") return d;
        if (d?.msg) return d.msg;
        return JSON.stringify(d);
      })
      .join(" | ");
  }

  if (detail && typeof detail === "object") {
    return detail.msg || JSON.stringify(detail);
  }

  return detail || err?.message || "No se pudo iniciar sesión";
}

function EyeOpenIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1.5 12C3.4 8.2 7.1 6 12 6s8.6 2.2 10.5 6c-1.9 3.8-5.6 6-10.5 6S3.4 15.8 1.5 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="12"
        r="3"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 3L21 21"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M10.9 10.9C10.57 11.23 10.38 11.68 10.38 12.17C10.38 13.18 11.19 14 12.2 14C12.69 14 13.14 13.81 13.47 13.48"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.8 6.8C4.7 8 3 9.73 1.9 12C3.8 15.8 7.4 18 12 18C13.9 18 15.64 17.63 17.18 16.95"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.6 5.2C10.38 5.07 11.17 5 12 5C16.6 5 20.2 7.2 22.1 11C21.46 12.29 20.6 13.42 19.56 14.36"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ForgotPasswordModal({ onClose }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    if (!username.trim() || !email.trim()) {
      setErrorMsg("Rellena ambos campos.");
      return;
    }
    if (!email.includes("@")) {
      setErrorMsg("Email inválido.");
      return;
    }
    setSubmitting(true);
    try {
      await requestPasswordReset(username.trim(), email.trim());
      setDone(true);
    } catch (err) {
      // Por seguridad mostramos el mismo mensaje genérico aunque haya error.
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div style={{ padding: 8 }}>
        <h2 style={{ margin: "0 0 10px", color: "#10231a" }}>Solicitud enviada</h2>
        <p style={{ margin: "0 0 18px", color: "#475569", lineHeight: 1.5 }}>
          Si los datos coinciden con una cuenta válida, recibirás un email con
          instrucciones para restablecer tu contraseña en los próximos minutos.
          Revisa también la carpeta de spam.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={modalBtnPrimary}>
            Entendido
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14, padding: 8 }}>
      <h2 style={{ margin: 0, color: "#10231a" }}>¿Olvidaste tu contraseña?</h2>
      <p style={{ margin: 0, color: "#64748b", fontSize: 13, lineHeight: 1.5 }}>
        Introduce tu nombre de usuario y el email asociado a tu cuenta. Si los
        datos coinciden, te enviaremos un enlace para restablecer la contraseña.
      </p>

      <label style={modalLabel}>
        Usuario
        <input
          style={modalInput}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          required
        />
      </label>

      <label style={modalLabel}>
        Email
        <input
          type="email"
          style={modalInput}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </label>

      {errorMsg && (
        <div style={{ color: "#991b1b", fontSize: 13, fontWeight: 700 }}>{errorMsg}</div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
        <button type="button" onClick={onClose} style={modalBtnSecondary} disabled={submitting}>
          Cancelar
        </button>
        <button type="submit" style={modalBtnPrimary} disabled={submitting}>
          {submitting ? "Enviando…" : "Enviar enlace"}
        </button>
      </div>
    </form>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);

  const [username, setUsername] = useState("ifebtru");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const [loading, setLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  const [progress, setProgress] = useState(0);
  const [forgotOpen, setForgotOpen] = useState(false);

  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  const splashIntervalRef = useRef(null);
  const navTimeoutRef = useRef(null);

  const clearTimers = () => {
    if (splashIntervalRef.current) {
      clearInterval(splashIntervalRef.current);
      splashIntervalRef.current = null;
    }
    if (navTimeoutRef.current) {
      clearTimeout(navTimeoutRef.current);
      navTimeoutRef.current = null;
    }
  };

  // Aviso si llegamos aquí por una sesión caducada (401 en otra pantalla).
  useEffect(() => {
    try {
      if (sessionStorage.getItem("session_expired")) {
        sessionStorage.removeItem("session_expired");
        setError("Tu sesión caducó. Vuelve a iniciar sesión.");
      }
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimers();
    };
  }, []);

  const heroConfig = useMemo(() => {
    const { width, height } = viewport;

    const isShort = height <= 760;
    const isNarrow = width <= 1200;
    const isTablet = width <= 992;
    const isMobile = width <= 768;

    let titleSize = "clamp(2.2rem, 4.2vw, 4.8rem)";
    let subtitleSize = "clamp(1rem, 1.45vw, 1.5rem)";
    let bottom = "56px";
    let left = "48px";
    let maxWidth = "760px";
    let gap = "14px";

    if (isNarrow) {
      titleSize = "clamp(2rem, 3.7vw, 4rem)";
      subtitleSize = "clamp(0.98rem, 1.3vw, 1.3rem)";
      bottom = "42px";
      left = "36px";
      maxWidth = "640px";
      gap = "12px";
    }

    if (isTablet) {
      titleSize = "clamp(1.8rem, 3.6vw, 3rem)";
      subtitleSize = "clamp(0.95rem, 1.6vw, 1.15rem)";
      bottom = "32px";
      left = "28px";
      maxWidth = "520px";
      gap = "10px";
    }

    if (isMobile) {
      titleSize = "clamp(1.55rem, 6vw, 2.2rem)";
      subtitleSize = "clamp(0.92rem, 3vw, 1.05rem)";
      bottom = "24px";
      left = "20px";
      maxWidth = "calc(100% - 40px)";
      gap = "8px";
    }

    if (isShort && !isMobile) {
      bottom = "24px";
      gap = "8px";
      titleSize = isTablet
        ? "clamp(1.65rem, 3.2vw, 2.5rem)"
        : "clamp(1.9rem, 3.4vw, 3.3rem)";
      subtitleSize = isTablet
        ? "clamp(0.9rem, 1.35vw, 1.05rem)"
        : "clamp(0.95rem, 1.2vw, 1.2rem)";
    }

    return {
      titleSize,
      subtitleSize,
      bottom,
      left,
      maxWidth,
      gap,
    };
  }, [viewport]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      clearTimers();
      setLoading(true);
      setShowSplash(true);
      setProgress(10);

      splashIntervalRef.current = setInterval(() => {
        setProgress((p) => (p < 90 ? p + 8 : p));
      }, 120);

      await login(username, password);

      clearTimers();
      setProgress(100);

      navTimeoutRef.current = setTimeout(() => navigate("/dashboard"), 500);
    } catch (err) {
      clearTimers();
      setShowSplash(false);
      setLoading(false);
      setProgress(0);
      setError(formatError(err));
    }
  };

  return (
    <>
      {showSplash && (
        <div className="splash">
          <div className="splashBox">
            <img src={logo} alt="logo" className="splashLogo" />
            <div className="splashText">Iniciando sesión...</div>

            <div className="progressBar">
              <div
                className="progressFill"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="layout">
        <div className="leftPanel">
          <div className="loginCard">
            <div className="loginHeader">
              <img src={logo} alt="logo" className="loginLogo" />
              <div className="loginSubtitle">Sistema de gestión del vivero</div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="field">
                <label>Usuario</label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>

              <div className="field">
                <label>Contraseña</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      paddingRight: "48px",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    style={{
                      position: "absolute",
                      top: "50%",
                      right: "12px",
                      transform: "translateY(-50%)",
                      border: "none",
                      background: "transparent",
                      color: "#64748b",
                      cursor: "pointer",
                      padding: 0,
                      lineHeight: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "color 0.18s ease, transform 0.18s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "#06b6d4";
                      e.currentTarget.style.transform = "translateY(-50%) scale(1.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "#64748b";
                      e.currentTarget.style.transform = "translateY(-50%) scale(1)";
                    }}
                  >
                    {showPassword ? <EyeOpenIcon /> : <EyeOffIcon />}
                  </button>
                </div>
              </div>

              {error && <div className="error">{error}</div>}

              <button className="loginBtn" disabled={loading}>
                {loading ? "Entrando..." : "Entrar"}
              </button>

              <div style={{ textAlign: "center", marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#0f5132",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                    padding: 4,
                    textDecoration: "underline",
                    fontFamily: "inherit",
                  }}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            </form>
          </div>
        </div>

        <div
          className="rightPanel"
          style={{
            position: "relative",
            overflow: "hidden",
          }}
        >
          <img src={viveroImg} alt="ViverApp — gestión del vivero municipal" className="heroImage" />
          <div className="imageOverlay" />

          <div
            style={{
              position: "absolute",
              left: heroConfig.left,
              right: "24px",
              bottom: heroConfig.bottom,
              zIndex: 3,
              maxWidth: heroConfig.maxWidth,
              display: "flex",
              flexDirection: "column",
              gap: heroConfig.gap,
              pointerEvents: "none",
            }}
          >
            <h1
              style={{
                margin: 0,
                color: "#ffffff",
                fontSize: heroConfig.titleSize,
                lineHeight: 1.05,
                fontWeight: 800,
                letterSpacing: "-0.03em",
                textShadow: "0 3px 18px rgba(0,0,0,0.45)",
                wordBreak: "break-word",
              }}
            >
              Control integral del vivero
            </h1>

            <p
              style={{
                margin: 0,
                color: "rgba(255,255,255,0.96)",
                fontSize: heroConfig.subtitleSize,
                lineHeight: 1.35,
                fontWeight: 500,
                textShadow: "0 2px 12px rgba(0,0,0,0.38)",
                maxWidth: "100%",
                wordBreak: "break-word",
              }}
            >
              Gestiona inventario, movimientos, pedidos y trazabilidad desde un
              único sistema profesional
            </p>
          </div>
        </div>
      </div>

      {forgotOpen && (
        <Modal onClose={() => setForgotOpen(false)}>
          <ForgotPasswordModal onClose={() => setForgotOpen(false)} />
        </Modal>
      )}
    </>
  );
}

const modalLabel = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 13,
  fontWeight: 700,
  color: "#10231a",
};

const modalInput = {
  padding: "10px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  fontSize: 14,
  outline: "none",
  fontFamily: "inherit",
  background: "#fff",
};

const modalBtnPrimary = {
  padding: "10px 16px",
  background: "#0f5132",
  color: "#fff",
  border: 0,
  borderRadius: 10,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
};

const modalBtnSecondary = {
  padding: "10px 16px",
  background: "#fff",
  color: "#44403c",
  border: "1px solid #d6d3d1",
  borderRadius: 10,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};