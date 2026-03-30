import { Construction } from "lucide-react";
import { PageHeader, PageShell, PanelCard } from "@/components/shell";

export function PlaceholderPage(props: { title: string; description: string }) {
  return (
    <PageShell>
      <PageHeader title={props.title} description={props.description} />
      <PanelCard
        icon={Construction}
        title="Próximamente"
        description="Esta sección se conectará a datos y flujos en el roadmap."
        className="max-w-2xl"
      >
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/80 bg-muted/20 py-12 text-center">
          <Construction className="size-10 text-muted-foreground/60" aria-hidden />
          <p className="text-sm text-muted-foreground">
            MVP: tablas, formularios y métricas vivas aparecerán aquí con la misma identidad visual que el resto de la app.
          </p>
        </div>
      </PanelCard>
    </PageShell>
  );
}
