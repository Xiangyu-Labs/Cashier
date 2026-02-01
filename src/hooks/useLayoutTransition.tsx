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
        // Note: Removed layout:true to prevent flickering on data updates
        containerProps: {},

        // Helper to get motion props for an item
        // Note: Removed layoutId to prevent cross-item layout animations that cause visual jumps
        getItemProps: () => ({
            initial: { opacity: 0, y: 2 },
            animate: { opacity: 1, y: 0 },
            exit: { opacity: 0, y: -2, transition: { duration: 0.15 } },
            transition: {
                duration: 0.2,
                ease: [0.32, 0.72, 0, 1] as const // Standard easeOut expo curve
            }
        }),

        // Return the ID so the parent can use a stable LayoutGroup component
        layoutGroupId
    };
}
