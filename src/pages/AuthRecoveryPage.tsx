import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

function AuthCardShell(props: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm border-subtle bg-surface shadow-none">{props.children}</Card>
    </div>
  );
}

export function AuthRecoveryPage() {
  const { session, loading, profileLoading, updatePassword } = useAuth();
  const navigate = useNavigate();
  const sessionBusy = loading || (Boolean(session?.user) && profileLoading);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (sessionBusy) {
    return (
      <AuthCardShell>
        <CardHeader className="space-y-3 pb-2 text-center">
          <Skeleton className="mx-auto size-16 rounded-lg" />
          <Skeleton className="mx-auto h-6 w-40" />
          <Skeleton className="mx-auto h-4 w-56" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </AuthCardShell>
    );
  }

  if (!session?.user) {
    return (
      <AuthCardShell>
        <CardHeader className="space-y-3 pb-2 text-center">
          <img src="/logo.png" alt="Yakuza Meta" className="mx-auto size-16 object-contain" />
          <div>
            <CardTitle className="text-section-title">Enlace no válido</CardTitle>
            <CardDescription className="mt-1">
              El enlace expiró o ya se usó. Pedí uno nuevo desde la pantalla de inicio de sesión.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button type="button" className="w-full" onClick={() => navigate("/login", { replace: true })}>
            Ir al login
          </Button>
        </CardContent>
      </AuthCardShell>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    const { error: err } = await updatePassword(password);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMessage("Contraseña actualizada. Redirigiendo…");
    navigate("/", { replace: true });
  };

  return (
    <AuthCardShell>
      <CardHeader className="space-y-3 pb-2 text-center">
        <img src="/logo.png" alt="Yakuza Meta" className="mx-auto size-16 object-contain" />
        <div>
          <CardTitle className="text-section-title">Nueva contraseña</CardTitle>
          <CardDescription className="mt-1">Definí tu contraseña para continuar.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">Contraseña</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirmar</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Guardando…" : "Guardar"}
          </Button>
        </form>
      </CardContent>
    </AuthCardShell>
  );
}
