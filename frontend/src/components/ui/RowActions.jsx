import { MoreHorizontal } from "lucide-react";

import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../../ui";

/**
 * MENÚ DE ACCIONES DE FILA, CON ACCIONES CONDICIONALES.
 *
 * `DataTable` de DevCon8 ya trae un menú de acciones, pero su tipo
 * `RowAction` no admite mostrar una acción solo para ALGUNAS filas: recibe un
 * array fijo y lo pinta entero.
 *
 * ViverApp lo necesita. En la administración de usuarios, "Reenviar
 * invitación" solo tiene sentido si la cuenta está pendiente, "Reset password"
 * si está activa y "Desbloquear" si está bloqueada. Ofrecer las tres siempre
 * sería un cambio de comportamiento — se le estaría proponiendo al
 * administrador una acción que no aplica.
 *
 * No es un defecto del sistema de diseño, sino una función que le falta, así
 * que NO se toca el paquete vendorizado: se compone aquí sobre su
 * `DropdownMenu`, con su mismo aspecto y comportamiento de teclado.
 *
 * Propuesta para aguas arriba: añadir `when?: (row) => boolean` a `RowAction`.
 *
 * Reglas que se conservan del original:
 *   - Un solo disparador por fila, no una hilera de botones. Cada botón
 *     visible es otro tabulador entre el usuario y la fila siguiente.
 *   - Las acciones destructivas van separadas y marcadas.
 */
export default function RowActions({ row, items, label = "Acciones", disabled = false }) {
  const visibles = items.filter((a) => (typeof a.when === "function" ? a.when(row) : true));
  if (visibles.length === 0) return null;

  const normales = visibles.filter((a) => !a.destructive);
  const destructivas = visibles.filter((a) => a.destructive);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" label={label} disabled={disabled}>
          <MoreHorizontal aria-hidden="true" className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {normales.map((a) => (
          <DropdownMenuItem key={a.label} onSelect={() => a.onSelect(row)}>
            {a.icon && <a.icon aria-hidden="true" className="size-4" />}
            {a.label}
          </DropdownMenuItem>
        ))}

        {/* El separador solo aparece si hay algo a ambos lados; si no, deja una
            raya suelta al principio o al final del menú. */}
        {normales.length > 0 && destructivas.length > 0 && <DropdownMenuSeparator />}

        {destructivas.map((a) => (
          <DropdownMenuItem key={a.label} destructive onSelect={() => a.onSelect(row)}>
            {a.icon && <a.icon aria-hidden="true" className="size-4" />}
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
