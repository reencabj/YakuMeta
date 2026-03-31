import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import { AppShell } from "@/components/layout/AppShell";
import { ClientePortalOnlyPage } from "@/pages/ClientePortalOnlyPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { AuthCallbackPage } from "@/pages/AuthCallbackPage";
import { AuthRecoveryPage } from "@/pages/AuthRecoveryPage";
import { LoginPage } from "@/pages/LoginPage";
import { HistoryPage } from "@/pages/HistoryPage";
import { StatisticsPage } from "@/pages/StatisticsPage";
import { AdminPage } from "@/features/admin/AdminPage";
import { OrdersPage } from "@/features/orders/OrdersPage";
import { StockPage } from "@/features/stock/StockPage";

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading, profileLoading } = useAuth();
  const sessionBusy = loading || (Boolean(session?.user) && profileLoading);

  if (sessionBusy) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Cargando sesión…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function StaffAppGate({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  if (profile?.role === "cliente") {
    return <ClientePortalOnlyPage />;
  }
  return children;
}

function AdminRoute() {
  const { profile } = useAuth();
  if (profile?.role !== "admin") {
    return <Navigate to="/" replace />;
  }
  return <AdminPage />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/recovery" element={<AuthRecoveryPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <StaffAppGate>
              <AppShell />
            </StaffAppGate>
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="pedidos" element={<OrdersPage />} />
        <Route path="stock" element={<StockPage />} />
        <Route path="estadisticas" element={<StatisticsPage />} />
        <Route path="historial" element={<HistoryPage />} />
        <Route path="admin" element={<AdminRoute />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
