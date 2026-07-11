import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", className)}
    {...props}
  />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    side?: "right" | "left";
    showClose?: boolean;
  }
>(({ side = "right", className, children, showClose = true, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed z-50 flex h-dvh max-h-dvh flex-col border border-subtle bg-surface shadow-lg transition-ui duration-200",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        side === "right" &&
          "inset-y-0 right-0 w-full max-w-md border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
        side === "left" &&
          "inset-y-0 left-0 w-full max-w-md border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
        className
      )}
      {...props}
    >
      {children}
      {showClose ? (
        <DialogPrimitive.Close className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-ui hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="size-4" />
          <span className="sr-only">Cerrar</span>
        </DialogPrimitive.Close>
      ) : null}
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = DialogPrimitive.Content.displayName;

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col gap-1 border-b border-subtle px-5 py-4 pr-12", className)} {...props} />
);

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-section-title", className)} {...props} />
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-xs text-muted-foreground", className)} {...props} />
));
SheetDescription.displayName = DialogPrimitive.Description.displayName;

const SheetBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", className)} {...props} />
);

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetBody };
