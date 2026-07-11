import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  email: z.string().min(1, "Email requerido").email("Email no válido"),
  password: z.string().min(6, "Contraseña muy corta"),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const { signIn, session, profileLoading, requestPasswordReset } = useAuth();
  const navigate = useNavigate();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const [showForgot, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetStatus, setResetStatus] = useState<{ ok?: boolean; message?: string } | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    if (session && !profileLoading) navigate("/", { replace: true });
  }, [session, profileLoading, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm border-subtle bg-surface shadow-none">
        <CardHeader className="space-y-3 pb-2 text-center">
          <img src="/logo.png" alt="Yakuza Meta" className="mx-auto size-16 object-contain" />
          <div>
            <CardTitle className="text-section-title">Yakuza Meta</CardTitle>
            <CardDescription className="mt-1">Iniciá sesión con tu email corporativo.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(async (values) => {
              const { error } = await signIn(values.email, values.password);
              if (error) {
                form.setError("root", { message: error.message });
                return;
              }
              navigate("/", { replace: true });
            })}
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
              {form.formState.errors.email ? (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" autoComplete="current-password" {...form.register("password")} />
              {form.formState.errors.password ? (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              ) : null}
            </div>
            {form.formState.errors.root ? (
              <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
            ) : null}
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Entrando…" : "Entrar"}
            </Button>
          </form>

          <div className="border-t border-subtle pt-4 text-center">
            <button
              type="button"
              className="text-sm text-muted-foreground transition-ui hover:text-foreground"
              onClick={() => {
                setShowForgot((v) => !v);
                setResetStatus(null);
                setResetEmail(form.getValues("email"));
              }}
            >
              ¿Olvidaste tu contraseña?
            </button>
            {showForgot ? (
              <div className="mt-3 space-y-3 rounded-md border border-subtle bg-background-secondary p-4 text-left">
                <Label htmlFor="reset-email" className="text-xs">
                  Email de la cuenta
                </Label>
                <Input
                  id="reset-email"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                />
                {resetStatus?.message ? (
                  <p className={resetStatus.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
                    {resetStatus.message}
                  </p>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  disabled={resetBusy}
                  onClick={() => {
                    void (async () => {
                      setResetBusy(true);
                      setResetStatus(null);
                      const email = resetEmail.trim();
                      if (!email) {
                        setResetStatus({ ok: false, message: "Indicá un email." });
                        setResetBusy(false);
                        return;
                      }
                      const { error } = await requestPasswordReset(email);
                      setResetBusy(false);
                      if (error) {
                        setResetStatus({ ok: false, message: error.message });
                        return;
                      }
                      setResetStatus({
                        ok: true,
                        message:
                          "Si el correo está registrado y el envío está configurado en Supabase, recibirás un enlace para restablecer la contraseña.",
                      });
                    })();
                  }}
                >
                  {resetBusy ? "Enviando…" : "Enviar enlace"}
                </Button>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
