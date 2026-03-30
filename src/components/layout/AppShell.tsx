import { useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LogOut,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { useAppSettingsQuery } from "@/hooks/useAppSettingsQuery";
import { useGlobalStockSummary, usePedidosKpiQuery } from "@/hooks/useGlobalStockSummary";
import { cn } from "@/lib/utils";

/** Título por defecto (login aún no carga settings; coincide con index.html). */
const DEFAULT_APP_TITLE = "Yakuza Meta Stock";

const nav = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/pedidos", label: "Pedidos" },
  { to: "/stock", label: "Stock" },
  { to: "/estadisticas", label: "Estadísticas" },
  { to: "/historial", label: "Historial" },
  { to: "/admin", label: "Admin", adminOnly: true },
];

export function AppShell() {
  const { profile, signOut } = useAuth();
  const settingsQ = useAppSettingsQuery();
  const stock = useGlobalStockSummary();
  const pedidosKpi = usePedidosKpiQuery();

  const appTitle = settingsQ.data?.app_name?.trim() || DEFAULT_APP_TITLE;

  useEffect(() => {
    document.title = appTitle;
  }, [appTitle]);

  return (
    <div className="flex h-dvh max-h-dvh overflow-hidden">
      <aside className="hidden h-full w-56 shrink-0 flex-col border-r border-border/80 bg-gradient-to-b from-card/90 to-muted/20 p-4 md:flex">
        <div className="flex flex-col items-center gap-2 py-4">
          <img src="/logo.png" alt="logo" className="h-24 w-24 object-contain" />
          <h1 className="text-white text-base font-semibold leading-tight">Yakuza Meta</h1>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden pr-1">
          {nav
            .filter((item) => !item.adminOnly || profile?.role === "admin")
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-primary/15 text-primary shadow-sm ring-1 ring-primary/20"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )
                }
              >
                <img src="/logo.png" alt="" aria-hidden className="h-4 w-4 object-contain" />
                {item.label}
              </NavLink>
            ))}
        </nav>
        <div className="shrink-0 space-y-2 border-t border-border pt-4">
          <p className="truncate px-2 text-xs text-muted-foreground">
            {profile?.display_name ?? profile?.username ?? "Usuario"}
            {profile?.role === "admin" ? (
              <span className="ml-2 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">
                admin
              </span>
            ) : null}
          </p>
          <Button variant="outline" size="sm" className="w-full" onClick={() => void signOut()}>
            <LogOut className="size-4" />
            Salir
          </Button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-10 shrink-0 border-b border-border/80 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
              <MetricPill
                label="Meta total"
                value={stock.data?.total_meta_kilos?.toFixed(2) ?? "—"}
                loading={stock.isLoading}
              />
              <MetricPill
                label="Pedidos en curso"
                value={
                  pedidosKpi.data?.total_pedidos_abiertos_kg != null
                    ? Number(pedidosKpi.data.total_pedidos_abiertos_kg).toFixed(2)
                    : "—"
                }
                loading={pedidosKpi.isLoading}
                tone="warning"
              />
              <MetricPill
                label="Libre"
                value={stock.data?.total_libre_kilos?.toFixed(2) ?? "—"}
                loading={stock.isLoading}
                tone="success"
              />
              <MetricPill
                label="Falta preparar"
                value={pedidosKpi.data?.faltante_preparar_kg != null ? Number(pedidosKpi.data.faltante_preparar_kg).toFixed(2) : "—"}
                loading={pedidosKpi.isLoading}
                tone="danger"
              />
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-background via-background to-muted/15 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function MetricPill(props: {
  label: string;
  value: string;
  loading?: boolean;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const tone =
    props.tone === "success"
      ? "border-emerald-700/40 bg-emerald-950/40"
      : props.tone === "warning"
        ? "border-amber-700/40 bg-amber-950/40"
        : props.tone === "danger"
          ? "border-red-700/40 bg-red-950/40"
          : "border-border bg-card";

  return (
    <div
      className={cn(
        "min-w-[132px] rounded-xl border border-border/80 bg-gradient-to-br from-card to-muted/20 px-3 py-2.5 shadow-sm",
        tone
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{props.label}</p>
      <p className="mt-0.5 font-semibold tabular-nums text-sm text-foreground">
        {props.loading ? "…" : props.value}
        <span className="ml-1 text-[11px] font-normal text-muted-foreground">kg</span>
      </p>
    </div>
  );
}
