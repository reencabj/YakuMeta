import { useEffect, useMemo, useState } from "react";
import { Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar, type TopbarMetric } from "@/components/layout/Topbar";
import { useAppSettingsQuery } from "@/hooks/useAppSettingsQuery";
import { useGlobalStockSummary, usePedidosKpiQuery } from "@/hooks/useGlobalStockSummary";
import { fetchLavadoTandasActivas } from "@/features/lavado/lavadoService";
import { lavadoQueryKeys } from "@/features/lavado/lavadoQueryKeys";
import { formatDuration } from "@/features/lavado/lavadoMath";
import { fetchLavadoPedidos } from "@/features/lavado-pedidos/lavadoPedidosService";

const DEFAULT_APP_TITLE = "Yakuza Meta Stock";
const SIDEBAR_COLLAPSED_KEY = "yakuza-sidebar-collapsed";

function formatCompactMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    notation: "compact",
    maximumFractionDigits: 1,
  })
    .format(value)
    .replace(/\$\s+/u, "$");
}

export function AppShell() {
  const { profile, signOut } = useAuth();
  const [now, setNow] = useState(Date.now());
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  const settingsQ = useAppSettingsQuery();
  const stock = useGlobalStockSummary();
  const pedidosKpi = usePedidosKpiQuery();
  const lavadoTandasQ = useQuery({
    queryKey: lavadoQueryKeys.tandasActivas,
    queryFn: fetchLavadoTandasActivas,
    refetchInterval: 15_000,
  });
  const lavadoPedidosQ = useQuery({
    queryKey: ["lavado-pedidos", "topbar"],
    queryFn: fetchLavadoPedidos,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  const appTitle = settingsQ.data?.app_name?.trim() || DEFAULT_APP_TITLE;

  useEffect(() => {
    document.title = appTitle;
  }, [appTitle]);

  const lavadoActive = (lavadoTandasQ.data ?? []).filter((t) => t.estado === "activo");
  const nextLavado = [...lavadoActive].sort(
    (a, b) => new Date(a.finaliza_estimado_at).getTime() - new Date(b.finaliza_estimado_at).getTime()
  )[0];
  const lavadoPedidosActive = (lavadoPedidosQ.data ?? []).filter((p) =>
    ["recibido", "dinero_recibido", "dinero_entregado", "en_espera", "listo_para_entregar"].includes(p.estado)
  );
  const dineroPorEntregar = lavadoPedidosActive.reduce((s, p) => s + Number(p.monto_entregar), 0);
  const proximaTandaSegundos = nextLavado
    ? Math.max(0, Math.round((new Date(nextLavado.finaliza_estimado_at).getTime() - now) / 1000))
    : null;

  const metrics = useMemo<TopbarMetric[]>(
    () => [
      {
        id: "stock",
        label: "Stock disponible",
        value: stock.data?.total_meta_kilos?.toFixed(2) ?? "—",
        unit: "kg",
        loading: stock.isLoading,
      },
      {
        id: "pedidos",
        label: "Pedidos activos",
        value:
          pedidosKpi.data?.total_pedidos_abiertos_kg != null
            ? Number(pedidosKpi.data.total_pedidos_abiertos_kg).toFixed(2)
            : "—",
        unit: "kg",
        loading: pedidosKpi.isLoading,
        tone: "warning",
      },
      {
        id: "faltante",
        label: "Falta preparar",
        value:
          pedidosKpi.data?.faltante_preparar_kg != null
            ? Number(pedidosKpi.data.faltante_preparar_kg).toFixed(2)
            : "—",
        unit: "kg",
        loading: pedidosKpi.isLoading,
        tone: "danger",
      },
      {
        id: "prox-tanda",
        label: "Próx. tanda",
        value: proximaTandaSegundos != null ? formatDuration(proximaTandaSegundos) : "—",
        loading: lavadoTandasQ.isLoading,
        tone: "info",
      },
      {
        id: "lavado-activo",
        label: "Lavado activo",
        value: String(lavadoActive.length),
        unit: "tandas",
        loading: lavadoTandasQ.isLoading,
        tone: "success",
      },
      {
        id: "lavado-entregar",
        label: "Lavado a entregar",
        value: formatCompactMoney(dineroPorEntregar),
        loading: lavadoPedidosQ.isLoading,
        tone: "success",
      },
    ],
    [
      stock.data,
      stock.isLoading,
      pedidosKpi.data,
      pedidosKpi.isLoading,
      proximaTandaSegundos,
      lavadoActive.length,
      lavadoTandasQ.isLoading,
      lavadoPedidosQ.isLoading,
      dineroPorEntregar,
    ]
  );

  const sidebarProps = {
    collapsed: sidebarCollapsed,
    isAdmin: profile?.role === "admin",
    displayName: profile?.display_name,
    username: profile?.username,
    onSignOut: () => void signOut(),
    onToggleCollapse: () => setSidebarCollapsed((v) => !v),
  };

  return (
    <div className="flex h-dvh max-h-dvh bg-background">
      <Sidebar {...sidebarProps} className="hidden md:flex" />

      <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DialogContent
          showClose={false}
          className="fixed left-0 top-0 h-dvh max-h-dvh w-sidebar max-w-[85vw] translate-x-0 translate-y-0 rounded-none border-0 border-r border-subtle bg-background-secondary p-0 shadow-none"
        >
          <Sidebar {...sidebarProps} onNavigate={() => setMobileNavOpen(false)} onToggleCollapse={undefined} />
        </DialogContent>
      </Dialog>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar metrics={metrics} onMenuClick={() => setMobileNavOpen(true)} />

        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto w-full max-w-content px-4 py-5 md:px-6 md:py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
