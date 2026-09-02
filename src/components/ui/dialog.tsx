"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const DialogDepthContext = React.createContext(0);

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const parentDepth = React.useContext(DialogDepthContext);
  return (
    <DialogDepthContext.Provider value={parentDepth + 1}>
      <DialogPrimitive.Root {...props} />
    </DialogDepthContext.Provider>
  );
}

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, style, ...props }, ref) => {
  const depth = React.useContext(DialogDepthContext) - 1;
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        "fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className
      )}
      style={{ ...style, zIndex: 100 + depth * 20 }}
      {...props}
    />
  );
});
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

type DialogLayout = "modal" | "sheet" | "detail" | "viewer";

const dialogLayoutClasses: Record<DialogLayout, string> = {
  modal:
    "left-1/2 top-1/2 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
  sheet:
    "bottom-0 left-0 w-full max-w-none rounded-t-lg data-[state=closed]:slide-out-to-bottom-3 data-[state=open]:slide-in-from-bottom-3 sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100vw-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95",
  detail:
    "inset-0 h-[100dvh] w-screen max-w-none rounded-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[90dvh] sm:w-[calc(100vw-2rem)] sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95",
  viewer:
    "inset-0 h-[100dvh] w-screen max-w-none rounded-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[90dvh] sm:w-[95vw] sm:max-w-5xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95",
};

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    variant: DialogLayout;
    hideCloseButton?: boolean;
    onExitComplete?: () => void;
  }
>(
  (
    {
      className,
      children,
      variant,
      hideCloseButton = false,
      onExitComplete,
      onAnimationEnd,
      style,
      ...props
    },
    ref
  ) => {
    const tCommon = useTranslations("Common");
    const depth = React.useContext(DialogDepthContext) - 1;
    return (
      <DialogPortal>
        <DialogOverlay className="duration-200" />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            "fixed grid gap-4 border border-border bg-surface p-6 shadow-modal duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            dialogLayoutClasses[variant],
            className
          )}
          style={{ ...style, zIndex: 110 + depth * 20 }}
          onAnimationEnd={(event) => {
            onAnimationEnd?.(event);
            if (
              event.target === event.currentTarget &&
              event.currentTarget.dataset.state === "closed"
            ) {
              onExitComplete?.();
            }
          }}
          {...props}
        >
          {children}
          {hideCloseButton ? null : (
            <DialogPrimitive.Close className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground sm:right-4 sm:top-4 sm:size-8">
              <X className="h-4 w-4" />
              <span className="sr-only">{tCommon("close")}</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  }
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
      {...props}
    />
  );
}
DialogHeader.displayName = "DialogHeader";

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
      {...props}
    />
  );
}
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
