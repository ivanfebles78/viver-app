/**
 * Superficie pública del paquete de UI vendorizado.
 *
 * `src/ui/` es CÓDIGO VENDORIZADO: es una copia byte a byte de
 * `devcon8-platform/packages/ui/src`. No se edita aquí. Si algo tiene que
 * cambiar, cambia aguas arriba y se vuelve a copiar — de lo contrario los dos
 * sistemas de diseño se bifurcan y este trabajo hay que repetirlo dentro de un
 * año.
 *
 * Este fichero es lo único que ViverApp añade: un punto de entrada, para que
 * el resto de la aplicación importe desde `@/ui` y no de rutas internas.
 *
 * Aún no se han portado `form.tsx` ni `data-table.tsx`: pertenecen a la fase de
 * primitivas compartidas, no a la del shell.
 */

export { cn } from "./lib/cn";

export { Button, buttonVariants } from "./components/button";

export {
  Status,
  StatusTone,
  StatusBadge,
  Badge,
  STATUS_DEFINITIONS,
  STATUS_TONES,
  statusLabelKey,
} from "./components/status-badge";

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent,
  Tooltip,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Avatar,
  Skeleton,
  Spinner,
  Progress,
} from "./components/primitives";

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "./components/overlays";

export { Breadcrumb, PageHeader, EmptyState, ErrorState, Kpi } from "./components/page";

export { Navigation, filterNavigation, isActive } from "./shell/navigation";

export { AppShell } from "./shell/app-shell";

export { ThemeProvider, ThemeToggle, useTheme, THEME_SCRIPT } from "./theme/theme-provider";
