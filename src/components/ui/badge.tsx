import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium transition-ui",
  {
    variants: {
      variant: {
        default: "bg-muted text-muted-foreground",
        secondary: "bg-surface-elevated text-foreground",
        outline: "border border-subtle text-muted-foreground",
        success: "bg-success/12 text-success",
        warning: "bg-warning/12 text-warning",
        danger: "bg-destructive/12 text-destructive",
        info: "bg-info/12 text-info",
        violet: "bg-primary-soft text-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
