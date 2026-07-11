import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function AuthCallbackPage() {
  const { session, loading, profileLoading } = useAuth();
  const navigate = useNavigate();
  const busy = loading || (Boolean(session?.user) && profileLoading);

  useEffect(() => {
    if (busy) return;
    if (session) navigate("/", { replace: true });
    else navigate("/login", { replace: true });
  }, [session, busy, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm border-subtle bg-surface shadow-none">
        <CardHeader className="space-y-3 pb-2 text-center">
          <img src="/logo.png" alt="Yakuza Meta" className="mx-auto size-16 object-contain" />
          <div>
            <CardTitle className="text-section-title">Yakuza Meta</CardTitle>
            <CardDescription className="mt-1">Finalizando acceso…</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-2 w-4/5 rounded-full" />
        </CardContent>
      </Card>
    </div>
  );
}
