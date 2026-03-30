import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Gauge,
  Layers,
  Package,
  Settings,
  Shield,
  Users,
  Wrench,
} from "lucide-react";
import {
  adminSystemSnapshot,
  fetchPricingRules,
  fetchProfilesForAdmin,
  insertCustomLocationType,
  insertPricingRule,
  updateCustomLocationType,
  updatePricingRule,
  deletePricingRule,
  updateProfileAdmin,
  inviteUserViaEdge,
  type LocationTypeRow,
  type PricingRuleRow,
  type ProfileRow,
} from "@/services/adminService";
import { fetchAppSettings, updateAppSettings, type AppSettingsRow } from "@/services/appSettingsService";
import { authRecoveryRedirectUrl, supabase } from "@/lib/supabase";
import { PageHeader, PageShell, PanelCard, SegmentTabs } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Database } from "@/types/database";
import { cn } from "@/lib/utils";

type Tab = "users" | "types" | "settings" | "pricing" | "groups" | "maintenance";

function suggestedPricePerKg(kg: number, rules: PricingRuleRow[], base: number | null): number {
  const active = rules
    .filter((r) => r.is_active)
    .sort((a, b) => b.prioridad - a.prioridad || b.cantidad_minima_kilos - a.cantidad_minima_kilos);
  for (const r of active) {
    if (kg >= r.cantidad_minima_kilos) return Number(r.precio_por_kilo);
  }
  return base != null ? Number(base) : 0;
}

export function AdminPage() {
  const [tab, setTab] = useState<Tab>("users");
  const qc = useQueryClient();

  const profilesQ = useQuery({
    queryKey: ["admin", "profiles"],
    queryFn: fetchProfilesForAdmin,
  });

  const typesQ = useQuery({
    queryKey: ["admin", "location-types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("storage_location_types").select("*").order("nombre");
      if (error) throw error;
      return (data ?? []) as LocationTypeRow[];
    },
  });

  const settingsQ = useQuery({
    queryKey: ["app_settings"],
    queryFn: fetchAppSettings,
  });

  const pricingQ = useQuery({
    queryKey: ["pricing_rules"],
    queryFn: fetchPricingRules,
  });

  const groupsQ = useQuery({
    queryKey: ["v_storage_group_metrics"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_storage_group_metrics").select("*").order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const snapshotQ = useQuery({
    queryKey: ["admin_system_snapshot"],
    queryFn: adminSystemSnapshot,
    enabled: tab === "maintenance",
  });

  const [editProfile, setEditProfile] = useState<ProfileRow | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteDisplayName, setInviteDisplayName] = useState("");
  const [inviteRole, setInviteRole] = useState<"user" | "admin">("user");
  const [newTypeName, setNewTypeName] = useState("");
  const [editRule, setEditRule] = useState<PricingRuleRow | null>(null);
  const [newRuleOpen, setNewRuleOpen] = useState(false);
  const [sampleKg, setSampleKg] = useState("10");

  const updateProfileM = useMutation({
    mutationFn: (p: { id: string; patch: Parameters<typeof updateProfileAdmin>[1] }) => updateProfileAdmin(p.id, p.patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "profiles"] }),
  });

  const inviteUserM = useMutation({
    mutationFn: () =>
      inviteUserViaEdge({
        email: inviteEmail.trim().toLowerCase(),
        username: inviteUsername.trim().toLowerCase(),
        display_name: inviteDisplayName.trim() || null,
        role: inviteRole,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "profiles"] });
      setInviteOpen(false);
      setInviteEmail("");
      setInviteUsername("");
      setInviteDisplayName("");
      setInviteRole("user");
      window.alert("Invitación enviada. El usuario recibirá un email para establecer su acceso.");
    },
    onError: (err: Error) => window.alert(err.message),
  });

  const updateSettingsM = useMutation({
    mutationFn: (patch: Database["public"]["Tables"]["app_settings"]["Update"]) => updateAppSettings(patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["app_settings"] });
      void qc.invalidateQueries({ queryKey: ["app-settings"] });
    },
  });

  const insertTypeM = useMutation({
    mutationFn: (nombre: string) => insertCustomLocationType(nombre),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "location-types"] }),
  });

  const updateTypeM = useMutation({
    mutationFn: (p: { id: string; patch: Parameters<typeof updateCustomLocationType>[1] }) =>
      updateCustomLocationType(p.id, p.patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "location-types"] }),
  });

  const insertRuleM = useMutation({
    mutationFn: (row: Database["public"]["Tables"]["pricing_rules"]["Insert"]) => insertPricingRule(row),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["pricing_rules"] }),
  });

  const updateRuleM = useMutation({
    mutationFn: (p: { id: string; patch: Database["public"]["Tables"]["pricing_rules"]["Update"] }) =>
      updatePricingRule(p.id, p.patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["pricing_rules"] }),
  });

  const deleteRuleM = useMutation({
    mutationFn: (id: string) => deletePricingRule(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["pricing_rules"] }),
  });

  const settings = settingsQ.data;
  const rules = pricingQ.data ?? [];
  const sample = Number(sampleKg) || 0;
  const sug = suggestedPricePerKg(sample, rules, settings?.precio_base_por_kilo ?? null);

  return (
    <PageShell>
      <PageHeader
        title="Administración"
        description="Configuración, catálogos y herramientas internas. Solo rol administrador."
      />

      <SegmentTabs
        aria-label="Secciones admin"
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        options={[
          { value: "users", label: "Usuarios" },
          { value: "types", label: "Tipos depósito" },
          { value: "settings", label: "General" },
          { value: "pricing", label: "Precios" },
          { value: "groups", label: "Grupos" },
          { value: "maintenance", label: "Mantenimiento" },
        ]}
      />

      {tab === "users" ? (
        <PanelCard
          icon={Users}
          title="Usuarios"
          description="Identidad operativa: usuario visible y nombre en la app; login con email real (Supabase Auth)."
          headerExtra={
            <Button type="button" size="sm" onClick={() => setInviteOpen(true)}>
              Invitar por email
            </Button>
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Activo</TableHead>
                <TableHead>Creado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(profilesQ.data ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.username}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">{p.email}</TableCell>
                  <TableCell>{p.display_name ?? "—"}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 text-xs",
                        p.role === "admin" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {p.role}
                    </span>
                  </TableCell>
                  <TableCell>{p.is_active ? "sí" : "no"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(p.created_at)}</TableCell>
                  <TableCell>
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditProfile(p)}>
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Invitaciones</p>
            <p className="mt-1">
              Las invitaciones usan la Edge Function <code className="rounded bg-muted px-1">invite-user</code> con tu
              sesión de administrador (sin exponer <code className="rounded bg-muted px-1">service_role</code> en el
              navegador).
            </p>
          </div>

          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Invitar usuario</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 py-2">
                <div className="space-y-1">
                  <Label>Email (login)</Label>
                  <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} autoComplete="off" />
                </div>
                <div className="space-y-1">
                  <Label>Nombre de usuario (app)</Label>
                  <Input
                    value={inviteUsername}
                    onChange={(e) => setInviteUsername(e.target.value.toLowerCase())}
                    placeholder="solo minúsculas, números, . _ -"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Nombre visible (opcional)</Label>
                  <Input value={inviteDisplayName} onChange={(e) => setInviteDisplayName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Rol inicial</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as "admin" | "user")}
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    disabled={inviteUserM.isPending}
                    onClick={() => {
                      const u = inviteUsername.trim().toLowerCase();
                      if (!/^[a-z0-9][a-z0-9_.-]{1,47}$/.test(u)) {
                        window.alert("Usuario no válido: 2–48 caracteres, minúsculas, números, . _ -");
                        return;
                      }
                      inviteUserM.mutate();
                    }}
                  >
                    {inviteUserM.isPending ? "Enviando…" : "Enviar invitación"}
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        </PanelCard>
      ) : null}

      {tab === "types" ? (
        <PanelCard icon={Package} title="Tipos de depósito" description="Los tipos marcados como sistema no se editan aquí.">
          <div className="mb-4 flex flex-wrap gap-2">
            <Input className="max-w-xs" placeholder="Nombre nuevo tipo" value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} />
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (!newTypeName.trim()) return;
                insertTypeM.mutate(newTypeName);
                setNewTypeName("");
              }}
              disabled={insertTypeM.isPending}
            >
              Crear tipo
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Sistema</TableHead>
                <TableHead>Activo</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(typesQ.data ?? []).map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.nombre}</TableCell>
                  <TableCell className="font-mono text-xs">{t.slug}</TableCell>
                  <TableCell>{t.es_sistema ? "sí" : "no"}</TableCell>
                  <TableCell>
                    {t.es_sistema ? (
                      "—"
                    ) : (
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={t.is_active}
                          onChange={(e) => updateTypeM.mutate({ id: t.id, patch: { is_active: e.target.checked } })}
                        />
                        activo
                      </label>
                    )}
                  </TableCell>
                  <TableCell>
                    {!t.es_sistema ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const n = window.prompt("Nuevo nombre", t.nombre);
                          if (n && n.trim()) void updateTypeM.mutateAsync({ id: t.id, patch: { nombre: n.trim() } });
                        }}
                      >
                        Renombrar
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PanelCard>
      ) : null}

      {tab === "settings" && settings ? (
        <SettingsForm
          settings={settings}
          loading={settingsQ.isLoading}
          onSave={(patch) => updateSettingsM.mutate(patch)}
          saving={updateSettingsM.isPending}
        />
      ) : null}

      {tab === "pricing" ? (
        <div className="space-y-4">
          <PanelCard icon={Shield} title="Precio sugerido (simulación)" description="Según reglas activas y cantidad mínima escalonada.">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Kilos meta de referencia</Label>
                <Input className="h-9 w-40" value={sampleKg} onChange={(e) => setSampleKg(e.target.value)} type="number" min={0} step={0.1} />
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
                <p className="text-xs uppercase text-muted-foreground">Precio / kg sugerido</p>
                <p className="text-2xl font-semibold tabular-nums">
                  ${sug.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </PanelCard>

          <PanelCard
            icon={Gauge}
            title="Reglas de precio"
            description="CRUD. Mayor prioridad numérica gana al empate; se aplica la regla con mayor mínimo de kg que cumpla el pedido."
            headerExtra={
              <Button type="button" size="sm" onClick={() => setNewRuleOpen(true)}>
                Nueva regla
              </Button>
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="text-right">Mín. kg</TableHead>
                  <TableHead className="text-right">$/kg</TableHead>
                  <TableHead className="text-right">Prioridad</TableHead>
                  <TableHead>Activa</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.nombre}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.cantidad_minima_kilos}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.precio_por_kilo}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.prioridad}</TableCell>
                    <TableCell>{r.is_active ? "sí" : "no"}</TableCell>
                    <TableCell className="space-x-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setEditRule(r)}>
                        Editar
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="text-red-400" onClick={() => deleteRuleM.mutate(r.id)}>
                        Borrar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PanelCard>

          <Dialog open={newRuleOpen} onOpenChange={setNewRuleOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nueva regla</DialogTitle>
              </DialogHeader>
              <PricingRuleFormBody
                key="new-rule"
                initial={null}
                onSubmit={(row) => {
                  insertRuleM.mutate(row as Database["public"]["Tables"]["pricing_rules"]["Insert"]);
                  setNewRuleOpen(false);
                }}
              />
            </DialogContent>
          </Dialog>
          <Dialog open={!!editRule} onOpenChange={(o) => !o && setEditRule(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Editar regla</DialogTitle>
              </DialogHeader>
              {editRule ? (
                <PricingRuleFormBody
                  key={editRule.id}
                  initial={editRule}
                  onSubmit={(row) => {
                    updateRuleM.mutate({ id: editRule.id, patch: row });
                    setEditRule(null);
                  }}
                />
              ) : null}
            </DialogContent>
          </Dialog>
        </div>
      ) : null}

      {tab === "groups" ? (
        <PanelCard
          icon={Layers}
          title="Grupos lógicos"
          description="La composición detallada se gestiona en Stock. Aquí un resumen de métricas."
          headerExtra={
            <Button asChild size="sm" variant="secondary">
              <Link to="/stock">Ir a Stock</Link>
            </Button>
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Grupo</TableHead>
                <TableHead className="text-right">Ocupación %</TableHead>
                <TableHead className="text-right">Stock libre (kg meta)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(groupsQ.data ?? []).map((g: { group_id: string; nombre: string; porcentaje_ocupacion: number; stock_libre: number }) => (
                <TableRow key={g.group_id}>
                  <TableCell>{g.nombre}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(g.porcentaje_ocupacion).toFixed(1)}%</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(g.stock_libre).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PanelCard>
      ) : null}

      {tab === "maintenance" ? (
        <PanelCard
          icon={Wrench}
          title="Estado del sistema"
          description="Conteos y chequeos de integridad livianos. No se ejecutan borrados ni correcciones automáticas."
          headerExtra={
            <Button type="button" variant="outline" size="sm" onClick={() => void snapshotQ.refetch()}>
              Actualizar
            </Button>
          }
        >
          {snapshotQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <pre className="max-h-[420px] overflow-auto rounded-xl border border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground">
              {JSON.stringify(snapshotQ.data, null, 2)}
            </pre>
          )}
          {snapshotQ.error ? <p className="mt-2 text-sm text-red-400">Sin permiso o error al leer el diagnóstico.</p> : null}
        </PanelCard>
      ) : null}

      <Dialog open={!!editProfile} onOpenChange={(o) => !o && setEditProfile(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
          </DialogHeader>
          {editProfile ? (
            <ProfileEditForm
              key={editProfile.id}
              profile={editProfile}
              onSave={(patch) => {
                updateProfileM.mutate({ id: editProfile.id, patch });
                setEditProfile(null);
              }}
              onResetPassword={() => {
                const email = editProfile.email.trim().toLowerCase();
                void supabase.auth.resetPasswordForEmail(email, { redirectTo: authRecoveryRedirectUrl() });
                window.alert(`Si el proveedor de correo está configurado, se envió un enlace a ${email}`);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function ProfileEditForm(props: {
  profile: ProfileRow;
  onSave: (patch: Parameters<typeof updateProfileAdmin>[1]) => void;
  onResetPassword: () => void;
}) {
  const [username, setUsername] = useState(props.profile.username);
  const [displayName, setDisplayName] = useState(props.profile.display_name ?? "");
  const [role, setRole] = useState<"admin" | "user">(props.profile.role);
  const [active, setActive] = useState(props.profile.is_active);

  return (
    <div className="grid gap-3 py-2">
      <div className="space-y-1">
        <Label>Usuario (app)</Label>
        <Input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} />
        <p className="text-xs text-muted-foreground">Email de login: {props.profile.email}</p>
      </div>
      <div className="space-y-1">
        <Label>Nombre visible</Label>
        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Rol</Label>
        <select
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
          value={role}
          onChange={(e) => setRole(e.target.value as "admin" | "user")}
        >
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Usuario activo
      </label>
      <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" onClick={props.onResetPassword}>
          Enviar recuperación de contraseña
        </Button>
        <Button
          type="button"
          onClick={() => {
            const u = username.trim().toLowerCase();
            if (!/^[a-z0-9][a-z0-9_.-]{1,47}$/.test(u)) {
              window.alert("Usuario no válido: 2–48 caracteres, minúsculas, números, . _ -");
              return;
            }
            props.onSave({
              username: u,
              display_name: displayName.trim() || null,
              role,
              is_active: active,
            });
          }}
        >
          Guardar
        </Button>
      </DialogFooter>
    </div>
  );
}

function SettingsForm(props: {
  settings: AppSettingsRow;
  loading: boolean;
  onSave: (patch: Database["public"]["Tables"]["app_settings"]["Update"]) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(props.settings);

  useEffect(() => {
    setForm(props.settings);
  }, [props.settings]);

  if (props.loading) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  return (
    <PanelCard icon={Settings} title="Configuración general" description="Constantes de negocio (fila única app_settings).">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nombre de la app" value={form.app_name} onChange={(v) => setForm((f) => ({ ...f, app_name: v }))} />
        <Field label="Moneda (código)" value={form.currency} onChange={(v) => setForm((f) => ({ ...f, currency: v }))} />
        <NumField
          label="Días duración meta por defecto"
          value={form.dias_duracion_meta_por_defecto}
          onChange={(n) =>
            setForm((f) => ({
              ...f,
              dias_duracion_meta_por_defecto: n === "" ? f.dias_duracion_meta_por_defecto : Number(n),
            }))
          }
        />
        <NumField
          label="Kg guardado por 1 kg meta"
          value={form.kg_guardado_por_1kg_meta}
          onChange={(n) =>
            setForm((f) => ({
              ...f,
              kg_guardado_por_1kg_meta: n === "" ? f.kg_guardado_por_1kg_meta : Number(n),
            }))
          }
          step={0.0001}
        />
        <NumField
          label="Precio base por kilo"
          value={form.precio_base_por_kilo ?? ""}
          onChange={(n) => setForm((f) => ({ ...f, precio_base_por_kilo: n === "" ? null : Number(n) }))}
        />
        <NumField
          label="Alerta meta: días normal hasta"
          value={form.alerta_meta_dias_normal_hasta}
          onChange={(n) =>
            setForm((f) => ({
              ...f,
              alerta_meta_dias_normal_hasta: n === "" ? f.alerta_meta_dias_normal_hasta : Number(n),
            }))
          }
        />
        <NumField
          label="Alerta meta: días warning hasta"
          value={form.alerta_meta_dias_warning_hasta}
          onChange={(n) =>
            setForm((f) => ({
              ...f,
              alerta_meta_dias_warning_hasta: n === "" ? f.alerta_meta_dias_warning_hasta : Number(n),
            }))
          }
        />
        <NumField
          label="Alerta meta: días vencido desde"
          value={form.alerta_meta_dias_vencido_desde}
          onChange={(n) =>
            setForm((f) => ({
              ...f,
              alerta_meta_dias_vencido_desde: n === "" ? f.alerta_meta_dias_vencido_desde : Number(n),
            }))
          }
        />
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={form.permitir_entrega_sin_stock}
            onChange={(e) => setForm((f) => ({ ...f, permitir_entrega_sin_stock: e.target.checked }))}
          />
          Permitir entrega sin stock
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <Button type="button" disabled={props.saving} onClick={() => props.onSave(form)}>
          {props.saving ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </PanelCard>
  );
}

function Field(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{props.label}</Label>
      <Input className="h-9" value={props.value} onChange={(e) => props.onChange(e.target.value)} />
    </div>
  );
}

function NumField(props: {
  label: string;
  value: number | "" | null;
  onChange: (v: number | "") => void;
  step?: number;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{props.label}</Label>
      <Input
        className="h-9"
        type="number"
        step={props.step ?? 1}
        value={props.value === null || props.value === "" ? "" : props.value}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") props.onChange("");
          else props.onChange(Number(raw));
        }}
      />
    </div>
  );
}

function PricingRuleFormBody(props: {
  initial: PricingRuleRow | null;
  onSubmit: (row: Database["public"]["Tables"]["pricing_rules"]["Insert"] | Database["public"]["Tables"]["pricing_rules"]["Update"]) => void;
}) {
  const [nombre, setNombre] = useState(props.initial?.nombre ?? "");
  const [minKg, setMinKg] = useState(String(props.initial?.cantidad_minima_kilos ?? 0));
  const [precio, setPrecio] = useState(String(props.initial?.precio_por_kilo ?? 0));
  const [prioridad, setPrioridad] = useState(String(props.initial?.prioridad ?? 0));
  const [activa, setActiva] = useState(props.initial?.is_active ?? true);

  return (
    <div className="grid gap-3 py-2">
      <div className="space-y-1">
        <Label>Nombre</Label>
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label>Mín. kg</Label>
          <Input type="number" value={minKg} onChange={(e) => setMinKg(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Precio / kg</Label>
          <Input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Prioridad</Label>
        <Input type="number" value={prioridad} onChange={(e) => setPrioridad(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
        Activa
      </label>
      <DialogFooter>
        <Button
          type="button"
          onClick={() =>
            props.onSubmit({
              nombre: nombre.trim(),
              cantidad_minima_kilos: Number(minKg),
              precio_por_kilo: Number(precio),
              prioridad: Number(prioridad),
              is_active: activa,
            })
          }
        >
          Guardar
        </Button>
      </DialogFooter>
    </div>
  );
}
