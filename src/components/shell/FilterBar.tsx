import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FilterBar(props: { children: ReactNode; className?: string; sticky?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-3",
        props.sticky && "sticky top-header z-10 -mx-1 border-b border-subtle bg-background/95 px-1 py-3 backdrop-blur-sm",
        props.className
      )}
    >
      {props.children}
    </div>
  );
}

export const selectClassName =
  "h-9 rounded-md border border-subtle bg-surface px-2.5 text-sm transition-ui hover:border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
