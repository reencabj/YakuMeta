# Configuración de correo en Supabase (Auth real)

Esta app usa **email + contraseña**, **recuperación de contraseña** e **invitaciones** (`invite-user`). Los enlaces deben apuntar a la URL pública de la SPA (incluido el `basename` de Vite, p. ej. `/YakuMeta/`).

## 1. URLs en el panel de Supabase

En **Authentication → URL configuration**:

- **Site URL**: origen base de la app, sin barra final recomendable para consistencia con esta guía, p. ej. `https://tu-usuario.github.io/YakuMeta`
- **Redirect URLs** (añadir todas las que uses):
  - `http://localhost:5173/YakuMeta/auth/recovery` (Vite dev + `base`)
  - `http://localhost:5173/YakuMeta/auth/callback`
  - Las mismas rutas en producción con tu dominio real, p. ej. `https://tu-usuario.github.io/YakuMeta/auth/recovery`

Deben coincidir **exactamente** con lo que genera el código (`getPublicAppBaseUrl()` + `/auth/recovery` o `/auth/callback`).

## 2. Variable `VITE_PUBLIC_APP_URL` (producción)

En el build del frontend (GitHub Actions, etc.), define:

`VITE_PUBLIC_APP_URL=https://tu-dominio.github.io/YakuMeta`

(sin `/` final). Así los `redirectTo` de recuperación y las instrucciones de despliegue no dependen solo de `window.location` si el correo se dispara desde otro contexto.

## 3. Secretos de la Edge Function `invite-user`

Tras desplegar la función:

```bash
supabase secrets set INVITE_REDIRECT_TO=https://tu-dominio.github.io/YakuMeta/auth/recovery
```

`INVITE_REDIRECT_TO` debe estar también en **Redirect URLs**.  
La función usa por defecto las variables automáticas `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_ANON_KEY`.

## 4. Envío de correo (SMTP)

Por defecto Supabase usa un servicio limitado para desarrollo. Para producción:

1. **Project Settings → Authentication → SMTP Settings**
2. Activa **Custom SMTP** y rellena host, puerto, usuario, contraseña y remitente.
3. Opcional: ajusta **Email Templates** (invitación, recuperación, confirmación) para que los enlaces y el texto coincidan con tu producto.

Sin SMTP configurado, los flujos `resetPasswordForEmail` e `inviteUserByEmail` **no entregarán** correos reales.

## 5. Plantillas útiles

En **Authentication → Email Templates** revisa al menos:

- **Invite user**
- **Reset password**

Los enlaces usan la **Site URL** y los **Redirect URLs** configurados; si algo falla con “Invalid redirect”, casi siempre es una URL que falta en la lista allowlist.

## 6. Prueba rápida

1. Desde **Login**, usa “¿Olvidaste tu contraseña?” y comprueba la bandeja (o logs de SMTP).
2. Desde **Admin → Invitar por email**, invita una dirección de prueba y abre el enlace; deberías aterrizar en `/auth/recovery` con sesión y poder fijar contraseña.
