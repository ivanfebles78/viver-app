import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ShieldCheck, CircleCheck, Sprout } from "lucide-react";

import { validateAccountToken, consumeAccountToken } from "../api/api";
import { Button, Card, Field, Input, ErrorState } from "../ui";
import { Alert, LoadingState } from "../components/ui/feedback";

/*
 * ACTIVAR CUENTA · RESTABLECER CONTRASEÑA · DESBLOQUEAR.
 *
 * Las tres operaciones comparten pantalla porque comparten flujo: se valida un
 * token de un solo uso que llega en la URL y, si es válido, se define una
 * contraseña nueva. Solo cambian los textos.
 *
 * MANEJO DEL TOKEN. El token es una credencial de un solo uso, y esta pantalla
 * NO lo presenta ni ofrece copiarlo — nunca lo hizo, y no se añade esa
 * capacidad. Se lee de la URL y se envía; no aparece en el DOM, ni en el texto
 * de ningún aviso, ni en los mensajes de error, ni en la consola. Los mensajes
 * del backend se muestran tal cual pero nunca se concatena el token con ellos.
 * Hay una prueba que lo verifica sobre el DOM renderizado en las cuatro fases.
 *
 * El COMPORTAMIENTO es idéntico al anterior: mismas validaciones (8 caracteres
 * mínimo, ambas contraseñas iguales), misma llamada, misma redirección a
 * /login a los 2,5 s tras el éxito.
 */

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
    submitLabel: "Guardar la nueva contraseña",
    successText: "Contraseña restablecida correctamente. Ya puedes iniciar sesión.",
  },
  unlock: {
    title: "Desbloquea tu cuenta",
    subtitle: "Tu cuenta ha sido desbloqueada. Define una nueva contraseña para acceder.",
    submitLabel: "Definir la nueva contraseña",
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

/** Marco común: una sola columna centrada, sin cromo de aplicación. */
function Marco({ children }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="flex w-full max-w-[var(--content-form-max)] flex-col gap-6">
        <header className="flex items-center justify-center gap-2.5">
          <Sprout aria-hidden="true" className="size-6 text-primary" />
          <span className="text-h4 font-[var(--font-weight-semibold)]">ViverApp</span>
        </header>
        <Card className="p-[var(--card-padding)]">{children}</Card>
        <p className="text-center text-caption text-muted-foreground">
          Gestión del vivero municipal
        </p>
      </div>
    </div>
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
      setErrorMsg("Las dos contraseñas no coinciden. Vuelve a escribirlas.");
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

  if (phase === "loading") {
    return (
      <Marco>
        <div className="flex flex-col gap-4">
          <h1 className="text-h4 font-[var(--font-weight-semibold)]">Comprobando el enlace…</h1>
          <LoadingState rows={3} label="Comprobando que el enlace sigue siendo válido…" />
        </div>
      </Marco>
    );
  }

  if (phase === "error") {
    return (
      <Marco>
        <ErrorState
          title="Este enlace no es válido"
          // El mensaje viene del backend; nunca lleva el token.
          description={errorMsg}
          retryLabel="Volver al inicio de sesión"
          onRetry={() => navigate("/login", { replace: true })}
        />
      </Marco>
    );
  }

  if (phase === "success") {
    return (
      <Marco>
        <div role="status" className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-[var(--success-subtle)]">
            <CircleCheck aria-hidden="true" className="size-5 text-[var(--success-subtle-foreground)]" />
          </span>
          <h1 className="text-h4 font-[var(--font-weight-semibold)]">Todo listo</h1>
          <p className="text-body-sm text-muted-foreground">{copy.successText}</p>
          <p className="text-caption text-muted-foreground">
            Te llevamos al inicio de sesión en unos segundos.
          </p>
          <Button variant="secondary" size="sm" onClick={() => navigate("/login", { replace: true })}>
            Ir ahora
          </Button>
        </div>
      </Marco>
    );
  }

  const enviando = phase === "submitting";

  return (
    <Marco>
      <form onSubmit={onSubmit} className="flex flex-col gap-[var(--form-field-gap)]">
        {/*
          Un <div>, no un <header>. `<form>` no es contenido de seccionado, así
          que un <header> dentro se expone como segundo landmark «banner» de la
          página, y ya hay uno en el marco. Detectado con axe.
        */}
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-[var(--primary-subtle)]">
            <ShieldCheck aria-hidden="true" className="size-5 text-[var(--primary-subtle-foreground)]" />
          </span>
          <h1 className="text-h4 font-[var(--font-weight-semibold)]">{copy.title}</h1>
          <p className="text-body-sm text-muted-foreground">{copy.subtitle}</p>
          {username && (
            <p className="text-body-sm">
              Cuenta: <strong className="font-[var(--font-weight-semibold)]">{username}</strong>
            </p>
          )}
        </div>

        {errorMsg && <Alert tone="error">{errorMsg}</Alert>}

        <Field
          label="Nueva contraseña"
          required
          description="Mínimo 8 caracteres. Combina letras, números y símbolos."
        >
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            // `new-password` hace que el gestor de contraseñas ofrezca generar
            // una, en vez de autocompletar la antigua.
            autoComplete="new-password"
            autoFocus
          />
        </Field>

        <Field label="Confirma la contraseña" required>
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </Field>

        {/*
          Sin `FormActions`: está pensado para varias acciones y aplica
          `sm:w-auto`, que anulaba el `fullWidth` a partir de 640px — el botón
          salía a ancho completo en móvil y pequeño y alineado a la derecha en
          escritorio. Aquí hay UNA sola acción en una columna estrecha, así que
          va a ancho completo siempre, igual que en la pantalla de entrada.
        */}
        <Button type="submit" variant="primary" fullWidth loading={enviando}>
          {copy.submitLabel}
        </Button>
      </form>
    </Marco>
  );
}
