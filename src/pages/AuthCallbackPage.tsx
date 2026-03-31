import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";

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
    <div className="flex min-h-screen items-center justify-center bg-background p-4 text-sm text-muted-foreground">
      Finalizando acceso…
    </div>
  );
}
