# Arquitectura — RP Meta Manager

## Visión general

- **Cliente**: SPA React (Vite + TypeScript) desplegada en **GitHub Pages** (assets estáticos).
- **Backend**: **Supabase** (Postgres + Auth + Row Level Security + RPC opcional).
- **Flujo de datos**: el navegador usa `@supabase/supabase-js` con anon key; las reglas de negocio sensibles viven en **RLS**, **funciones SQL** y **triggers** de auditoría.

```
┌─────────────────┐     HTTPS      ┌──────────────────────────────┐
│  GitHub Pages   │ ─────────────► │  Supabase API (PostgREST)    │
│  React + RQ     │                │  Postgres + Auth + RLS       │
└─────────────────┘                └──────────────────────────────┘
```

## Capas del frontend

| Capa | Responsabilidad |
|------|-----------------|
| `src/pages` | Rutas y composición de pantallas |
| `src/features/*` | Lógica por dominio (pedidos, stock, admin) |
| `src/components/ui` | shadcn/ui + primitivos |
| `src/lib/supabase` | Cliente tipado, helpers de auth (username → email interno) |
| `src/hooks` | React Query: queries/mutations reutilizables |

## Autenticación (username visible)

Supabase Auth usa **email** como identificador principal. Se adopta el patrón:

- **Email técnico**: `{username}@internal.rp.local` (dominio reservado, no es correo real).
- **UI**: solo campos `usuario` + `contraseña`; antes de `signIn` se concatena el sufijo.

Los perfiles extendidos viven en `public.profiles` con `username` único y `role`.

## Stock y consistencia

- **Lotes** (`stock_batches`) son la fuente de cantidad y reserva por lote.
- **Movimientos** (`stock_movements`) registran cada cambio con tipo y trazabilidad.
- **Reservas** (`order_reservations`) enlazan pedido ↔ lote; la actualización de `cantidad_reservada_meta_kilos` y movimientos asociados se concentra en **funciones RPC** para evitar estados inconsistentes entre cliente y RLS.

## Despliegue GitHub Pages

- `vite.config.ts`: `base: '/nombre-repo/'` (ajustar al repo).
- Build: `npm run build` → carpeta `dist/`.
- GitHub Actions o rama `gh-pages` según preferencia (documentado en README).

## Seguridad

- RLS activo en todas las tablas públicas.
- Rol **admin** vía `profiles.role = 'admin'`; políticas condicionales para configuración, usuarios y correcciones fuertes.
- Auditoría en `audit_logs` + triggers en entidades críticas.
