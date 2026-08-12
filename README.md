# ViverApp — Gestión de vivero municipal (multi-ayuntamiento)

Versión **multi-tenant** de la aplicación de gestión del vivero. A diferencia de
la app original (un único ayuntamiento, Santa Cruz de Tenerife), **ViverApp
sirve a cualquier ayuntamiento**: cada uno es un *cliente* y sus usuarios solo
ven los datos de su propio ayuntamiento (productos, pedidos, movimientos, mapa,
usuarios…). Todo cuelga de un `cliente_id`.

> Este proyecto es una aplicación **nueva e independiente** de la del vivero
> original (otra carpeta, otro repositorio de GitHub y otro proyecto de Railway).

## Arquitectura

- **Backend:** FastAPI + SQLAlchemy + PostgreSQL (`main.py`, `models.py`,
  `tenant.py`, `db.py`).
- **Frontend:** React + Vite (`frontend/`).
- **Aislamiento multi-tenant:** ver [`tenant.py`](tenant.py). El `cliente_id`
  activo de cada petición se fija en la `Session` de SQLAlchemy y unos eventos
  (`do_orm_execute` / `before_flush`) filtran automáticamente **todas** las
  consultas y estampan el `cliente_id` en las inserciones. Así ningún
  ayuntamiento puede ver datos de otro, sin tener que tocar cada consulta a mano.

## Roles

| Rol | Alcance | Puede |
|-----|---------|-------|
| `superadmin` | **Plataforma / global** (sin ayuntamiento, `cliente_id` NULL) | Todo. Da de alta ayuntamientos + su admin (*enrollment*), ve estadísticas globales (altas, uso por ayuntamiento, facturación) y actúa como cualquier admin eligiendo ayuntamiento. Copias de seguridad y config de correo. |
| `admin` | Su ayuntamiento | Administrador completo del ayuntamiento: usuarios, productos, mapa, pedidos, movimientos, informes. |
| `admin_vivero` | Su ayuntamiento | Admin del vivero: usuarios, productos y mapa. Subconjunto de `admin`. |
| `manager` | Su ayuntamiento | Aprobaciones, productos, movimientos, informes. |
| `tecnico` | Su ayuntamiento | Operativa del vivero. |
| `gestor_vivero` | Su ayuntamiento | Operativa del vivero. |
| `empresa_externa` | Su ayuntamiento | Pedidos y catálogo (UTE). |
| `proveedor` | Su ayuntamiento | Solo consulta de pedidos de reposición. |

El **superadmin** (dueño de la plataforma) elige el ayuntamiento activo con el
selector del menú; la elección viaja en la cabecera `X-Cliente-Id`. Al entrar,
aterriza en el **Panel de plataforma** (`/plataforma`). El resto de roles quedan
atados a su propio ayuntamiento y esa cabecera se ignora para ellos.

### Panel de plataforma (superadmin)

- **Enrollment:** alta de un ayuntamiento nuevo + su administrador inicial en un
  solo paso (`POST /superadmin/enroll`). El admin recibe un email de invitación
  para fijar su contraseña.
- **Estadísticas** (`GET /superadmin/stats`): resumen global, gráfica de
  evolución de altas de ayuntamientos, uso por ayuntamiento (usuarios,
  productos, pedidos, movimientos) y facturación estimada
  (`FACTURACION_CUOTA_MENSUAL` € × ayuntamientos activos).

## Usuarios de arranque

Con la base de datos **vacía**, el arranque crea el ayuntamiento *Santa Cruz de
Tenerife* (`cliente_id = 1`) y dos usuarios (cambia las contraseñas tras entrar):

- `superadmin` / `superadmin1234` — dueño global de la plataforma.
- `admin_sct` / `admin1234` — administrador del ayuntamiento de Santa Cruz.

(Las contraseñas se pueden fijar con `BOOTSTRAP_SUPERADMIN_PASSWORD` /
`BOOTSTRAP_ADMIN_PASSWORD`.)

## Imagen del landing

La imagen "hero" del login está en `frontend/src/assets/landing.png`
(actualmente un **placeholder**). Sustituye ese fichero por la imagen de
ViverApp y vuelve a desplegar. Cada ayuntamiento sube además su **propio mapa
del vivero** desde la pantalla *Vivero* (se guarda en la BD, columna
`clientes.mapa_imagen`).

## Desarrollo local

Con Docker Compose (levanta Postgres + backend + frontend):

```bash
docker compose up --build
```

- Backend: http://localhost:8000
- Frontend (dev): http://localhost:5476  ·  configura `VITE_API_URL=http://localhost:8000`

Variables de entorno: ver [`.env.example`](.env.example).

## Despliegue en Railway (nuevo proyecto, separado del vivero)

Crea **dos servicios** en un proyecto nuevo, ambos apuntando a este repo:

1. **Postgres** — añade el plugin de base de datos.
2. **Backend** — Dockerfile `Dockerfile.backend`. Variables:
   - `DATABASE_URL = ${{ Postgres.DATABASE_URL }}`
   - `SECRET_KEY = <clave aleatoria>`
   - (opcional) `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_ADMINVIVERO_PASSWORD`, `EXTRA_CORS_ORIGINS`, SMTP…
3. **Frontend** — Dockerfile `frontend/Dockerfile.frontend`. Variable de build:
   - `VITE_API_URL = <URL pública del servicio backend>`

Railway inyecta `$PORT` en cada servicio; los Dockerfiles ya lo usan. El CORS
del backend admite cualquier subdominio `*.railway.app`.

## Verificación del aislamiento

El aislamiento multi-tenant está cubierto por una prueba de integración que
comprueba, entre otras cosas, que un técnico de un ayuntamiento **no** puede ver
ni colarse en los datos de otro (ni siquiera enviando `X-Cliente-Id` a mano).
