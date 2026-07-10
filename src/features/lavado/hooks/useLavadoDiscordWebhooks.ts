import { useEffect } from "react";
import type { LavadoTandaRow } from "../lavadoService";
import { sendLavadoDiscordWebhookFinished, sendLavadoDiscordWebhookStarted } from "../lavadoService";

export function useLavadoDiscordWebhooks(input: {
  active: LavadoTandaRow[];
  profile: { display_name?: string | null; username?: string | null } | null;
  webhookUrl: string | undefined;
}) {
  const { active, profile, webhookUrl } = input;

  useEffect(() => {
    if (!profile || !webhookUrl) return;
    const pendingStart = active.filter((t) => !t.webhook_started_notified_at);
    for (const tanda of pendingStart) {
      void sendLavadoDiscordWebhookStarted({
        tanda,
        username: profile.display_name ?? profile.username ?? "Usuario",
        webhookUrl,
      });
    }
  }, [active, profile, webhookUrl]);

  useEffect(() => {
    if (!profile || !webhookUrl) return;

    const checkDue = () => {
      const nowMs = Date.now();
      const dueByTimer = active.filter(
        (t) => !t.webhook_notified_at && new Date(t.finaliza_estimado_at).getTime() <= nowMs
      );
      for (const tanda of dueByTimer) {
        void sendLavadoDiscordWebhookFinished({
          tanda,
          username: profile.display_name ?? profile.username ?? "Usuario",
          webhookUrl,
        });
      }
    };

    checkDue();
    const id = window.setInterval(checkDue, 5000);
    return () => window.clearInterval(id);
  }, [active, profile, webhookUrl]);
}
