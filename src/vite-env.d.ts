/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Origen completo de la SPA en prod, p.ej. https://metayakuza.reenz.site (sin / final). */
  readonly VITE_PUBLIC_APP_URL?: string;
  /** URL del portal de clientes (pedidos); enlace en pantalla de acceso denegado al panel interno. */
  readonly VITE_PORTAL_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
