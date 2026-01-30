import { LayoutGroup, AnimatePresence, motion } from "framer-motion";
import { useId } from "react";

/**
 * Hook to manage layout transitions for the ledger entries.
 * Provides a wrapper component and props for animatable items.
 */
export function useLayoutTransition() {
    // Unique ID for the layout group to prevent conflicts if multiple instances exist
    const layoutGroupId = useId();

    return {
        // Properties to spread onto the container
        containerProps: {
            layout: true,
            layoutRoot: true
        },

        // Helper to get motion props for an item
        getItemProps: (id: string) => ({
            layoutId: `${layoutGroupId}-${id}`,
            initial: { opacity: 0, scale: 0.95 },
            animate: { opacity: 1, scale: 1 },
            exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
            transition: {
                type: "spring" as const,
                stiffness: 500,
                damping: 30,
                mass: 1
            }
        }),

        // The LayoutGroup component to wrap lists in
        LayoutGroup: ({ children }: { children: React.ReactNode }) => (
            <LayoutGroup id={layoutGroupId}>
                {children}
            </LayoutGroup>
        )
    };
}
