import { ExternalLink, LogOut } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ClientePortalOnlyPage() {
  const { signOut, user } = useAuth();
  const portalUrl = import.meta.env.VITE_PORTAL_URL?.trim();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Acceso solo en el portal</CardTitle>
          <CardDescription>
            Tu cuenta es de cliente: no tenés acceso al panel interno. Los pedidos se cargan en la app de pedidos.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {user?.email ? (
            <p className="text-sm text-muted-foreground">
              Sesión: <span className="text-foreground">{user.email}</span>
            </p>
          ) : null}
          {portalUrl ? (
            <Button asChild variant="default" className="w-full">
              <a href={portalUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" />
                Abrir portal de pedidos
              </a>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Pedinos el enlace al portal de pedidos (no está configurado en esta instalación).
            </p>
          )}
          <Button type="button" variant="outline" className="w-full" onClick={() => void signOut()}>
            <LogOut className="size-4" />
            Cerrar sesión
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
