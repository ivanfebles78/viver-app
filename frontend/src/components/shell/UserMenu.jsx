import { KeyRound, LifeBuoy, LogOut, Users, Map } from "lucide-react";

import {
  Button,
  Avatar,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "../../ui";
import { accountLabels as L } from "../../app/labels.es";
import { formatUsername } from "../../utils/format";

/**
 * Menú de cuenta.
 *
 * Recoge lo que antes eran cinco controles sueltos alineados a la derecha de
 * cada pantalla: un recuadro con "Usuario: … · Rol: …", un botón "?" verde, un
 * "🔒 Cambiar contraseña", un botón "Usuarios" con degradado verde oscuro y un
 * "Salir" rojo con borde negro de 2px.
 *
 * Dos reglas del sistema de diseño explican por qué desaparecen:
 *
 *   - El verde es un ESTADO, nunca una acción. "Usuarios" y "Ayuda" eran
 *     verdes sin ser estados de éxito de nada.
 *   - El rojo es DESTRUCCIÓN, nunca una acción ordinaria. Cerrar sesión no
 *     destruye datos: es una salida normal y va como el resto.
 *
 * Cerrar sesión queda separado por un divisor y con el icono de salida, que es
 * suficiente jerarquía para no pulsarlo por error.
 */
export default function UserMenu({
  username,
  rol,
  canManageUsuarios,
  canOpenMapa,
  onChangePassword,
  onOpenHelp,
  onOpenUsuarios,
  onOpenMapa,
  onLogout,
}) {
  const nombre = formatUsername(username) || "—";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" label={L.menu}>
          {/* Las iniciales son decorativas: el nombre accesible lo aporta el
              botón que las envuelve. */}
          <Avatar name={nombre} size="sm" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="min-w-56">
        <DropdownMenuLabel>
          <span className="flex flex-col gap-0.5">
            <span className="text-caption font-[var(--font-weight-regular)] text-muted-foreground">
              {L.signedInAs}
            </span>
            <span className="truncate text-body-sm font-[var(--font-weight-medium)] text-foreground">
              {nombre}
            </span>
            {rol && <span className="text-caption text-muted-foreground">{rol}</span>}
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {canOpenMapa && (
          <DropdownMenuItem onSelect={onOpenMapa}>
            <Map className="size-4" />
            {L.mapa}
          </DropdownMenuItem>
        )}

        {canManageUsuarios && (
          <DropdownMenuItem onSelect={onOpenUsuarios}>
            <Users className="size-4" />
            {L.usuarios}
          </DropdownMenuItem>
        )}

        <DropdownMenuItem onSelect={onChangePassword}>
          <KeyRound className="size-4" />
          {L.changePassword}
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={onOpenHelp}>
          <LifeBuoy className="size-4" />
          {L.help}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={onLogout}>
          <LogOut className="size-4" />
          {L.logout}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
