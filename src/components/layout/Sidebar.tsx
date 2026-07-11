import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  BarChart3,
  CircleDollarSign,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  adminOnly?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: "Operación",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/pedidos", label: "Pedidos", icon: ClipboardList },
      { to: "/stock", label: "Stock", icon: Package },
    ],
  },
  {
    label: "Control",
    items: [
      { to: "/estadisticas", label: "Estadísticas", icon: BarChart3 },
      { to: "/historial", label: "Historial", icon: ScrollText },
    ],
  },
  {
    label: "Finanzas",
    items: [
      { to: "/lavado", label: "Lavado", icon: CircleDollarSign },
      { to: "/lavado-pedidos", label: "Pedidos Lavado", icon: Banknote },
    ],
  },
  {
    label: "Sistema",
    items: [{ to: "/admin", label: "Administración", icon: Settings, adminOnly: true }],
  },
];

export function Sidebar(props: {
  collapsed?: boolean;
  isAdmin?: boolean;
  displayName?: string | null;
  username?: string | null;
  onSignOut: () => void;
  className?: string;
  onNavigate?: () => void;
  onToggleCollapse?: () => void;
}) {
  const userLabel = props.displayName ?? props.username ?? "Usuario";

  return (
    <aside
      className={cn(
        "relative z-20 flex h-full shrink-0 flex-col overflow-visible border-r border-subtle bg-background-secondary",
        props.collapsed ? "w-sidebar-collapsed" : "w-sidebar",
        props.className
      )}
    >
      <div
        className={cn(
          "flex h-header shrink-0 items-center border-b border-subtle px-3",
          props.collapsed ? "justify-center" : "gap-2.5"
        )}
      >
        <div className={cn("flex min-w-0 items-center", props.collapsed ? "justify-center" : "gap-2.5")}>
          <img src="/logo.png" alt="" className={cn("object-contain", props.collapsed ? "size-8" : "size-9")} />
          {!props.collapsed ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-none">Yakuza Meta</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">Panel interno</p>
            </div>
          ) : null}
        </div>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden p-2">
        {navGroups.map((group) => {
          const items = group.items.filter((item) => !item.adminOnly || props.isAdmin);
          if (items.length === 0) return null;

          return (
            <div key={group.label}>
              {!props.collapsed ? (
                <p className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-tertiary">{group.label}</p>
              ) : null}
              <ul className="flex flex-col gap-0.5">
                {items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      title={props.collapsed ? item.label : undefined}
                      onClick={props.onNavigate}
                      className={({ isActive }) =>
                        cn(
                          "group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-ui",
                          props.collapsed && "justify-center px-2",
                          isActive
                            ? "bg-primary-soft text-foreground"
                            : "text-muted-foreground hover:bg-surface hover:text-foreground"
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive ? (
                            <span
                              className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary"
                              aria-hidden
                            />
                          ) : null}
                          <item.icon
                            className={cn("size-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")}
                            aria-hidden
                          />
                          {!props.collapsed ? <span className="truncate">{item.label}</span> : null}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="relative mt-auto shrink-0 border-t border-subtle">
        {props.onToggleCollapse ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="absolute -top-3.5 right-0 z-30 size-7 translate-x-1/2 rounded-full border-subtle bg-surface text-muted-foreground shadow-md transition-ui hover:bg-surface-elevated hover:text-foreground"
            onClick={props.onToggleCollapse}
            aria-label={props.collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
          >
            {props.collapsed ? <PanelLeftOpen className="size-3.5" /> : <PanelLeftClose className="size-3.5" />}
          </Button>
        ) : null}

        <div className="p-2 pt-3">
          {!props.collapsed ? (
            <div className="mb-2 px-2">
              <p className="truncate text-xs font-medium text-foreground">{userLabel}</p>
              {props.isAdmin ? (
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-primary">Admin</p>
              ) : (
                <p className="mt-0.5 text-[10px] text-muted-foreground">Operador</p>
              )}
            </div>
          ) : null}
          <div className={cn("flex", props.collapsed ? "justify-center" : "w-full")}>
            <Button
              variant="ghost"
              size={props.collapsed ? "icon" : "sm"}
              className={cn(
                props.collapsed
                  ? "size-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  : "w-full text-muted-foreground hover:text-foreground"
              )}
              onClick={props.onSignOut}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <LogOut className="size-4" aria-hidden />
              {!props.collapsed ? "Salir" : null}
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
