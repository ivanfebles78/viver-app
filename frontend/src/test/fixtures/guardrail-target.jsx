import { Card } from "../../ui";

/**
 * DIANA DEL GUARDARRAÍL DE TOKENS — no la importa nadie.
 *
 * Las pruebas de mutación necesitan un fichero que el guardarraíl escanee y que
 * puedan reescribir sin miedo. Antes mutaban pantallas de verdad
 * (`Lotetracking.jsx`, `ProportionBar.jsx`, `Movimientos.jsx`), y eso abría una
 * carrera real: vitest ejecuta los ficheros de prueba en paralelo, así que una
 * suite podía estar reescribiendo `Movimientos.jsx` mientras otra lo importaba.
 * Se manifestó una vez como 40 pruebas caídas en una ejecución y verdes en la
 * siguiente — el peor tipo de fallo, el que no se reproduce.
 *
 * Con esta diana la protección es la misma —se comprueba que cada regla del
 * guardarraíl detecta su infracción— pero mutarla no puede romper a nadie:
 * ningún módulo de la aplicación la importa.
 *
 * Tiene que seguir estando LIMPIA: si alguien mete aquí un color en crudo, la
 * prueba «no se dispara sin cambios» fallará, que es justo lo que debe pasar.
 */
export default function GuardrailTarget() {
  return (
    <Card className="p-[var(--card-padding)]">
      <p className="text-body-sm text-muted-foreground">
        Componente de prueba. No forma parte de la aplicación.
      </p>
    </Card>
  );
}
