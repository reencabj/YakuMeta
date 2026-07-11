import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-surface-elevated", className)} {...props} />;
}

function SkeletonText(props: { lines?: number; className?: string }) {
  const n = props.lines ?? 3;
  return (
    <div className={cn("space-y-2", props.className)}>
      {Array.from({ length: n }).map((_, i) => (
        <Skeleton key={i} className={cn("h-3", i === n - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

function StatTileSkeleton() {
  return (
    <div className="rounded-lg border border-subtle bg-surface p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-20" />
    </div>
  );
}

function TableRowsSkeleton(props: { rows?: number; cols?: number }) {
  const rows = props.rows ?? 5;
  const cols = props.cols ?? 4;
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className="h-9 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export { Skeleton, SkeletonText, StatTileSkeleton, TableRowsSkeleton };
