import React from "react";
import { LifeBuoy } from "lucide-react";

import { Button, ErrorState } from "../../ui";

/**
 * LÍMITE DE ERROR DE PÁGINA.
 *
 * Hallazgo de la Fase 1: un fallo de render en cualquier pantalla dejaba la
 * ventana EN BLANCO, incluida la navegación. Se comprobó en vivo — un campo
 * ausente en la respuesta del backend basta. El usuario se queda sin pantalla y
 * sin forma de ir a otra parte que no sea escribir la URL a mano.
 *
 * Este límite envuelve solo el `Outlet`, nunca el shell: la barra lateral y la
 * cabecera siguen ahí, así que una pantalla rota es una pantalla rota y no una
 * aplicación rota. Se reinicia al cambiar de ruta, de modo que navegar a otro
 * sitio ya es la vía de escape.
 *
 * PRIVACIDAD. No se muestra el mensaje de la excepción. Puede llevar
 * fragmentos de la respuesta del backend —nombres, correos, identificadores de
 * otro ayuntamiento— y esta es una aplicación multi-tenant del sector público.
 * A la pantalla va un identificador de incidencia; el detalle va a la consola,
 * donde ya solo lo ve quien tiene el navegador delante.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, incidenciaId: null };
  }

  static getDerivedStateFromError(error) {
    // Identificador corto para que la persona pueda citarlo al pedir soporte y
    // quien lo atienda lo cruce con el registro del navegador.
    const incidenciaId = Math.random().toString(36).slice(2, 8).toUpperCase();
    return { error, incidenciaId };
  }

  componentDidCatch(error, info) {
    // Diagnóstico completo a la consola, no a la interfaz.
    console.error(
      `[ViverApp] Fallo al renderizar (incidencia ${this.state.incidenciaId ?? "?"})`,
      { ruta: this.props.resetKey, error, componentStack: info?.componentStack }
    );
  }

  componentDidUpdate(prevProps) {
    // Cambiar de ruta limpia el error: navegar es la salida más natural, y
    // dejarlo pegado convertiría un fallo puntual en una pantalla muerta
    // permanente.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null, incidenciaId: null });
    }
  }

  reintentar = () => {
    this.setState({ error: null, incidenciaId: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="py-10">
        <ErrorState
          title="No hemos podido mostrar esta pantalla"
          description={
            "Ha ocurrido un fallo al preparar esta página. El resto de la aplicación sigue " +
            "funcionando: puedes reintentar o ir a otra sección desde el menú."
          }
          retryLabel="Reintentar"
          onRetry={this.reintentar}
          correlationId={this.state.incidenciaId}
          correlationLabel="Referencia para soporte:"
        />
        <div className="mt-4 flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => window.location.assign("/dashboard")}>
            <LifeBuoy aria-hidden="true" className="size-4" />
            Ir al panel de control
          </Button>
        </div>
      </div>
    );
  }
}
