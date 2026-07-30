"use client";
import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

const PopoverControlContext = React.createContext<{
  open: boolean;
  close: () => void;
  getTrigger: () => HTMLElement | null;
  setTrigger: (node: HTMLElement | null) => void;
} | null>(null);

function Popover({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen ?? false);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const getTrigger = React.useCallback(() => triggerRef.current, []);
  const setTrigger = React.useCallback((node: HTMLElement | null) => {
    triggerRef.current = node;
  }, []);
  const currentOpen = open ?? uncontrolledOpen;
  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) setUncontrolledOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, open]
  );
  const control = React.useMemo(
    () => ({ open: currentOpen, close: () => handleOpenChange(false), getTrigger, setTrigger }),
    [currentOpen, getTrigger, handleOpenChange, setTrigger]
  );

  return (
    <PopoverControlContext.Provider value={control}>
      <PopoverPrimitive.Root {...props} open={currentOpen} onOpenChange={handleOpenChange} />
    </PopoverControlContext.Provider>
  );
}

const PopoverTrigger = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger>
>((props, forwardedRef) => {
  const control = React.useContext(PopoverControlContext);
  const setRef = React.useCallback(
    (node: React.ElementRef<typeof PopoverPrimitive.Trigger> | null) => {
      const previous = control?.getTrigger() ?? null;
      control?.setTrigger(node);
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef != null) forwardedRef.current = node;
      if (node == null && previous != null && control?.open === true) {
        queueMicrotask(() => {
          if (control.getTrigger() == null) control.close();
        });
      }
    },
    [control, forwardedRef]
  );
  return <PopoverPrimitive.Trigger ref={setRef} {...props} />;
});
PopoverTrigger.displayName = PopoverPrimitive.Trigger.displayName;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(
  (
    {
      className,
      align = "center",
      sideOffset = 4,
      collisionPadding = 8,
      hideWhenDetached = true,
      sticky = "always",
      ...props
    },
    ref
  ) => (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        hideWhenDetached={hideWhenDetached}
        sticky={sticky}
        className={cn(
          "z-[260] w-72 rounded-lg border border-border bg-surface p-4 shadow-modal outline-none duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
);
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent };
