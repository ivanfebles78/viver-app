import { cn } from "../../ui";

/**
 * PEDIDOS POR DÍA DE LA SEMANA.
 *
 * Barras verticales de lunes a viernes. Es la única forma de gráfico del panel
 * donde el eje tiene un orden natural que el lector ya conoce, y donde la
 * comparación interesante es entre columnas contiguas.
 *
 * ACCESIBILIDAD. Un gráfico dibujado con cajas no es legible para un lector de
 * pantalla por muchos `aria-label` que se le cuelguen, así que aquí conviven
 * tres representaciones del MISMO dato:
 *
 *   1. Las barras, con su valor impreso encima y el día debajo. Se marcan
 *      `aria-hidden` porque lo que dicen está también en (2) y (3), y
 *      anunciarlo tres veces sería peor que no anunciarlo.
 *   2. El pie del gráfico, que dice EN PALABRAS qué día recibe más pedidos y
 *      cuál menos. Nadie tiene que medir alturas para responder a la pregunta
 *      que el gráfico existe para responder.
 *   3. Una tabla equivalente, oculta a la vista, con la media, el total y
 *      cuántos días se han contabilizado.
 *
 * La tabla va envuelta en un `<div class="sr-only">` y NO lleva la clase ella
 * misma: una `<table>` en modo automático se dimensiona por su contenido e
 * ignora el `width: 1px` de `sr-only`, así que se sale de la caja y añade una
 * barra de desplazamiento horizontal a la página entera. Envuelta, el
 * `overflow: hidden` del div la recorta.
 *
 * Ningún dato depende del color. Cada día tiene el suyo para dar variedad y
 * para que la columna del martes sea la misma el martes que viene, pero el
 * color no CODIFICA nada: qué día es y cuánto vale están escritos encima y
 * debajo de cada barra, y el máximo y el mínimo se nombran en el pie con
 * palabras. Quitando el color, el gráfico sigue diciendo lo mismo (SC 1.4.1).
 */

/**
 * Un color por día, de la escala --chart-* del sistema.
 *
 * Clases literales y completas: Tailwind las resuelve leyendo el código, así
 * que una construida por interpolación no existiría en la hoja. Además evita
 * sumar deuda al guardarraíl — el único valor calculado al pintar sigue siendo
 * la altura.
 *
 * Dos elecciones que no son las obvias, y por qué:
 *
 *   - El miércoles va en naranja (--chart-7) y no en el ámbar (--chart-2), que
 *     sería el cálido natural: sobre la pista gris el ámbar se queda en 2,91:1
 *     en modo claro, por debajo del 3:1 que pide el contraste de elementos no
 *     textuales. El naranja es el cálido más cercano que sí lo cumple.
 *   - El martes va en verde lima (--chart-6) y no en el verde azulado
 *     (--chart-4): el jueves ocupa el azul secundario, que en esta paleta es un
 *     cian, y junto al verde azulado los dos se leían como el mismo color —
 *     sobre todo en modo oscuro, donde son teal-400 y cyan-400. El lima separa
 *     de verdad, y además es el verde más verde de la escala.
 *
 * Los cinco superan 3:1 sobre la pista en los dos modos y ninguna pareja
 * contigua comparte familia.
 */
const COLOR_DIA = {
  1: "bg-[var(--chart-1)]", // lunes     · azul
  2: "bg-[var(--chart-6)]", // martes    · verde lima
  3: "bg-[var(--chart-7)]", // miércoles · naranja (ver nota sobre el ámbar)
  4: "bg-[var(--chart-8)]", // jueves    · azul secundario/cian
  5: "bg-[var(--chart-5)]", // viernes   · violeta
};

/** Si algún día llegara fuera de 1..5, no se pinta de un color inventado. */
const COLOR_POR_DEFECTO = "bg-[var(--chart-1)]";

/** «Lunes y martes», «lunes, martes y miércoles». */
function enumerar(dias) {
  if (dias.length === 0) return "";
  if (dias.length === 1) return dias[0];
  return `${dias.slice(0, -1).join(", ")} y ${dias[dias.length - 1]}`;
}

const unDecimal = (v) => (Number(v) || 0).toFixed(1).replace(".", ",");

/**
 * @param {Array}  dias   [{ iso, dia, media, total, ocurrencias }]
 * @param {Array}  mas    Días empatados en el máximo.
 * @param {Array}  menos  Días empatados en el mínimo.
 * @param {string} desde  Primera fecha del periodo (ISO).
 * @param {string} hasta  Última fecha del periodo (ISO).
 */
export default function WeekdayChart({ dias = [], mas = [], menos = [], desde, hasta, className }) {
  const maximo = Math.max(...dias.map((d) => Number(d.media) || 0), 0);

  return (
    <figure className={cn("m-0 flex flex-col gap-3", className)}>
      <div aria-hidden="true" className="flex items-end gap-1.5">
        {dias.map((dia) => {
          // Mínimo del 3 %: una media pequeña pero real no debe verse como cero.
          const alto = maximo > 0 ? Math.max((Number(dia.media) || 0) / maximo * 100, 3) : 0;
          return (
            <div key={dia.iso} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="tabular text-caption font-[var(--font-weight-medium)]">
                {unDecimal(dia.media)}
              </span>
              {/* 128px: con 80 las diferencias entre 2,1 y 2,5 se apreciaban
                  peor, y comparar longitudes es justo para lo que existe el
                  gráfico. Sigue cabiendo de sobra a 320px. */}
              <div className="flex h-32 w-full items-end overflow-hidden rounded-[var(--radius-sm)] bg-muted">
                <div
                  className={cn(
                    "w-full rounded-[var(--radius-sm)]",
                    COLOR_DIA[dia.iso] || COLOR_POR_DEFECTO
                  )}
                  style={{ height: `${alto}%` }}
                />
              </div>
              {/* Tres letras: «Mié» cabe a 320px donde «Miércoles» no. El
                  nombre completo está en la tabla equivalente. */}
              <span className="text-caption text-muted-foreground">{dia.dia.slice(0, 3)}</span>
            </div>
          );
        })}
      </div>

      <figcaption className="text-caption text-muted-foreground">
        {mas.length > 0 ? (
          <>
            Más pedidos:{" "}
            <span className="font-[var(--font-weight-medium)] text-foreground">{enumerar(mas)}</span>.{" "}
            Menos pedidos:{" "}
            <span className="font-[var(--font-weight-medium)] text-foreground">{enumerar(menos)}</span>.
          </>
        ) : (
          "Todos los días reciben la misma media de pedidos."
        )}
      </figcaption>

      <div className="sr-only">
        <table>
          <caption>
            Media de pedidos recibidos por día de la semana
            {desde && hasta ? ` entre ${desde} y ${hasta}` : ""}, en hora local de Canarias.
          </caption>
          <thead>
            <tr>
              <th scope="col">Día</th>
              <th scope="col">Media de pedidos</th>
              <th scope="col">Pedidos en total</th>
              <th scope="col">Días contabilizados</th>
            </tr>
          </thead>
          <tbody>
            {dias.map((dia) => (
              <tr key={dia.iso}>
                <th scope="row">{dia.dia}</th>
                <td>{unDecimal(dia.media)}</td>
                <td>{dia.total}</td>
                <td>{dia.ocurrencias}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
