import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { lavadoQueryKeys } from "../lavadoQueryKeys";
import { reconcileExpiredLavadoTandas } from "../lavadoService";

export function useLavadoReconcile() {
  const qc = useQueryClient();

  useEffect(() => {
    const run = async () => {
      try {
        const updated = await reconcileExpiredLavadoTandas();
        if (updated.length > 0) {
          void qc.invalidateQueries({ queryKey: lavadoQueryKeys.tandasActivas });
          void qc.invalidateQueries({ queryKey: lavadoQueryKeys.moneySummary });
          void qc.invalidateQueries({ queryKey: ["lavado", "tandas", "historial"] });
        }
      } catch {
        // Reconciliación best-effort; no bloquear la UI.
      }
    };

    void run();
    const id = window.setInterval(() => void run(), 60_000);
    return () => window.clearInterval(id);
  }, [qc]);
}
