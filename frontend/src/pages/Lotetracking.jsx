import { useState } from "react";
import { Search, ArrowRight } from "lucide-react";

import { getLote } from "../api/api";
import { Button, Card, DataTable, EmptyState, ErrorState, PageHeader } from "../ui";
import { Truncated } from "../components/ui/feedback";
import { SectionHeader, Toolbar } from "../components/ui/layout";
import { formatFechaHoraCanaria } from "../utils/fecha";
import SearchField from "../components/ui/SearchField";

/*
 * SEGUIMIENTO DE LOTE.
 *
 * La pantalla más pequeña de la aplicación y, hasta ahora, la menos terminada:
 * un `h1` sin estilo, un input de 400px fijos, un botón sin estilo, los errores
 * en `color: red` y el historial como una pila de recuadros grises.
 *
 * La consulta y sus datos no cambian: mismo `getLote()` —que desde la Fase 0
 * pasa por el cliente configurado, con sesión y ayuntamiento—, mismos campos y
 * mismo criterio de error.
 *
 * El historial pasa a `DataTable` porque es lo que es: una serie de movimientos
 * con fecha, origen, destino y cantidad. Una tabla se recorre de un vistazo y
 * se puede imprimir; una pila de tarjetas obliga a leer cada una entera.
 */

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

const numero = (n) => new Intl.NumberFormat("es-ES").format(Number(n || 0));

/** Origen → destino, con la flecha marcada como decorativa. */
function Transicion({ desde, hasta }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate">{desde || "—"}</span>
      <ArrowRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{hasta || "—"}</span>
    </span>
  );
}

const COLUMNAS = [
  {
    key: "fecha",
    header: "Fecha",
    cell: (m) => <span className="tabular whitespace-nowrap">{formatFechaHoraCanaria(m.fecha)}</span>,
  },
  {
    key: "movimiento",
    header: "Movimiento",
    cell: (m) => <Transicion desde={m.origen} hasta={m.destino} />,
  },
  {
    key: "zona",
    header: "Zona",
    hideOnMobile: true,
    cell: (m) => <Transicion desde={m.zona_origen} hasta={m.zona_destino} />,
  },
  {
    key: "tamano",
    header: "Tamaño",
    hideOnMobile: true,
    cell: (m) => <Transicion desde={m.tamano_origen} hasta={m.tamano_destino} />,
  },
  {
    key: "cantidad",
    header: "Cantidad",
    numeric: true,
    cell: (m) => numero(m.cantidad),
  },
];

export default function Lotetracking() {
  const [uuid, setUuid] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [buscando, setBuscando] = useState(false);
  /** Distingue «todavía no has buscado» de «no hay resultados». */
  const [buscado, setBuscado] = useState(false);

  const buscar = async (e) => {
    e?.preventDefault?.();
    const termino = uuid.trim();
    if (!termino) {
      setError("Introduce el UUID del lote que quieres consultar.");
      setData(null);
      return;
    }
    try {
      setBuscando(true);
      setError("");
      setData(await getLote(termino));
      setBuscado(true);
    } catch (err) {
      const status = err?.response?.status;
      setError(
        status === 404
          ? "No se encontró ningún lote con ese UUID. Revisa que esté copiado completo."
          : err?.response?.data?.detail || "No se pudo consultar el lote. Inténtalo de nuevo."
      );
      setData(null);
      setBuscado(true);
    } finally {
      setBuscando(false);
    }
  };

  /*
   * Se añade una clave estable por posición. `rowKey` de DataTable recibe solo
   * la fila, no su índice, y dos movimientos del mismo lote pueden coincidir en
   * fecha, origen, destino y cantidad — una traslación dividida en dos asientos,
   * por ejemplo. Sin esta clave, React reutilizaría filas equivocadas.
   */
  const movimientos = (Array.isArray(data?.movimientos) ? data.movimientos : []).map((m, i) => ({
    ...m,
    _key: `mov-${i}`,
  }));

  return (
    <div className="flex flex-col gap-[var(--section-gap)]">
      <PageHeader
        title="Seguimiento de lote"
        description="Consulta el histórico completo de movimientos de un lote a partir de su identificador."
      />

      <Card className="p-[var(--card-padding)]">
        {/*
          Formulario de verdad, no un input suelto con un botón al lado: así
          funciona la tecla Intro, que es como se busca cuando se acaba de
          pegar un UUID.
        */}
        <form onSubmit={buscar} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <SearchField
            label="Identificador del lote (UUID)"
            hideLabel={false}
            value={uuid}
            onChange={setUuid}
            placeholder="p. ej. 3f2a91c4-8b17-4e5d-9a2f-71c6e0d4b8aa"
            className="sm:flex-1"
          />
          <Button type="submit" variant="primary" loading={buscando}>
            <Search aria-hidden="true" className="size-4" />
            Buscar
          </Button>
        </form>
      </Card>

      {error && (
        <ErrorState
          title="No se ha podido consultar el lote"
          description={error}
        />
      )}

      {!error && !buscado && (
        <Card className="p-[var(--card-padding)]">
          <EmptyState
            icon={Search}
            title="Busca un lote para ver su trazabilidad"
            description="Introduce el UUID que aparece en la etiqueta del lote o en los informes de trazabilidad."
          />
        </Card>
      )}

      {data && (
        <div className="flex flex-col gap-4">
          <SectionHeader
            title="Datos del lote"
            actions={
              <Toolbar>
                <span className="text-body-sm text-muted-foreground">
                  Cantidad inicial:{" "}
                  <span className="tabular font-[var(--font-weight-medium)] text-foreground">
                    {numero(data.cantidad_inicial)}
                  </span>
                </span>
              </Toolbar>
            }
          />

          {/*
            El UUID en monoespaciada: es un valor técnico que se copia y se
            compara carácter a carácter, y el sistema reserva la mono
            exactamente para eso.
          */}
          <Card className="p-[var(--card-padding)]">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1">
                <dt className="text-caption text-muted-foreground">Identificador</dt>
                <dd className="min-w-0">
                  <Truncated className="mono text-body-sm">{data.uuid}</Truncated>
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-caption text-muted-foreground">Movimientos registrados</dt>
                <dd className="tabular text-body-sm font-[var(--font-weight-medium)]">
                  {numero(movimientos.length)}
                </dd>
              </div>
            </dl>
          </Card>

          <SectionHeader as="h3" title="Histórico de movimientos" />
          <DataTable
            caption={`Movimientos del lote ${data.uuid}`}
            columns={COLUMNAS}
            rows={movimientos}
            rowKey={(m) => m._key}
            labels={TABLE_LABELS}
            empty={
              <EmptyState
                title="Este lote no tiene movimientos registrados"
                description="El lote existe pero todavía no ha entrado ni salido de ninguna zona."
              />
            }
          />
        </div>
      )}
    </div>
  );
}
