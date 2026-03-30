# Estructura de carpetas

```
rp-meta-manager/
├── docs/                      # Arquitectura, decisiones, esquema
├── public/
├── src/
│   ├── auth/                  # AuthProvider, login UX username
│   ├── components/
│   │   ├── layout/            # AppShell, sidebar, topbar KPIs
│   │   └── ui/                # Primitivos estilo shadcn
│   ├── hooks/                 # React Query (stock global, etc.)
│   ├── lib/                   # supabase client, utils
│   ├── pages/                 # Rutas / pantallas
│   ├── types/                 # Database TypeScript
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── supabase/
│   └── migrations/          # SQL versionado
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── README.md
```
