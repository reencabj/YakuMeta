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
  const { signIn, session, requestPasswordReset } = useAuth();
  const navigate = useNavigate();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const [showForgot, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetStatus, setResetStatus] = useState<{ ok?: boolean; message?: string } | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    if (session) navigate("/", { replace: true });
  }, [session, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Iniciar sesión</CardTitle>
          <CardDescription>Email y contraseña (Supabase Auth).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
              {form.formState.errors.email ? (
                <p className="text-xs text-red-400">{form.formState.errors.email.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" autoComplete="current-password" {...form.register("password")} />
              {form.formState.errors.password ? (
                <p className="text-xs text-red-400">{form.formState.errors.password.message}</p>
              ) : null}
            </div>
            {form.formState.errors.root ? (
              <p className="text-sm text-red-400">{form.formState.errors.root.message}</p>
            ) : null}
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Entrando…" : "Entrar"}
            </Button>
          </form>

          <div className="border-t border-border pt-4">
            <button
              type="button"
              className="text-sm text-primary underline-offset-4 hover:underline"
              onClick={() => {
                setShowForgot((v) => !v);
                setResetStatus(null);
                setResetEmail(form.getValues("email"));
              }}
            >
              ¿Olvidaste tu contraseña?
            </button>
            {showForgot ? (
              <div className="mt-3 space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4">
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
                  <p className={resetStatus.ok ? "text-sm text-muted-foreground" : "text-sm text-red-400"}>
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
