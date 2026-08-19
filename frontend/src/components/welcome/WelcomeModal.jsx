import { useState } from "react";

import { Button, Dialog, DialogContent } from "../../ui";
import { leerPreferencia, recordarPreferencia } from "./welcomeStorage";

// Recursos enlazados desde el modal. Reemplaza estas rutas cuando subas
// los archivos definitivos:
//   - PDF: colócalo en `frontend/public/guia-viverapp.pdf` para que se sirva
//     directamente desde la raíz.
//   - Video: pega la URL pública (YouTube, Vimeo, etc.) en VIDEO_URL.
const PDF_URL = "/guia-viverapp.pdf";
const VIDEO_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"; // placeholder

export default function WelcomeModal({ open, onClose }) {
  /*
   * INICIALIZACIÓN, no sincronización: la preferencia ya existe cuando el
   * componente se monta, así que se lee en el inicializador perezoso de
   * `useState`. Antes se leía en un `useEffect` que hacía `setState` nada más
   * montar, lo que provoca un segundo render en cascada por cada apertura.
   */
  const [showOnStart, setShowOnStart] = useState(leerPreferencia);

  const handleClose = () => {
    recordarPreferencia(showOnStart);
    onClose?.();
  };

  const recurso = (href, titulo, detalle, accion, descargar) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      download={descargar || undefined}
      className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-3 no-underline outline-none hover:bg-[var(--accent)] focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-solid focus-visible:outline-ring"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-[var(--font-weight-medium)] text-foreground">{titulo}</span>
        <span className="block text-body-sm text-muted-foreground">{detalle}</span>
      </span>
      {/* El texto de la acción lleva su propia palabra: el enlace no se
          distingue sólo por color. */}
      <span className="shrink-0 text-body-sm font-[var(--font-weight-medium)] text-[color:var(--primary)]">
        {accion}
      </span>
    </a>
  );

  return (
    <Dialog open={open} onOpenChange={(abierto) => !abierto && handleClose()}>
      <DialogContent
        title="Bienvenido a ViverApp"
        description="Gestión del vivero municipal de Santa Cruz de Tenerife."
        closeLabel="Cerrar"
        size="lg"
      >
        <div className="flex max-h-[75dvh] min-w-0 flex-col gap-4 overflow-y-auto">
          <p className="text-body">
            ViverApp te permite llevar el control del inventario del vivero:
            registrar entradas y salidas de plantas, fitosanitarios,
            fertilizantes, áridos, material vegetal y ferretería; gestionar
            pedidos internos y externos; ver el stock distribuido por zonas del
            mapa; y mantener trazabilidad por lote y caducidad.
          </p>

          <div className="flex flex-col gap-2">
            {recurso(
              PDF_URL,
              "Guía de uso (PDF)",
              "Descarga el manual completo con capturas y ejemplos.",
              "Descargar",
              true
            )}
            {recurso(
              VIDEO_URL,
              "Vídeo explicativo",
              "Tutorial paso a paso para empezar en pocos minutos.",
              "Ver"
            )}
          </div>

          <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-3">
            <label htmlFor="welcome-al-iniciar" className="flex items-center gap-3">
              <input
                id="welcome-al-iniciar"
                type="checkbox"
                checked={showOnStart}
                onChange={(e) => setShowOnStart(e.target.checked)}
                className="size-4 shrink-0"
              />
              <span className="min-w-0">
                <span className="font-[var(--font-weight-medium)]">Mostrar al iniciar</span>
                <span className="mt-0.5 block text-body-sm text-muted-foreground">
                  También puedes reabrirlo desde el botón «?» de la cabecera.
                </span>
              </span>
            </label>
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="primary" onClick={handleClose}>
              Empezar a usar ViverApp
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
