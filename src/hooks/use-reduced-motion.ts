import { useEffect, useState } from "react";

/**
 * Hook to detect if animations should be reduced.
 * Returns true on mobile devices or when user prefers reduced motion.
 * Use this to conditionally disable heavy Framer Motion layout animations.
 */
export function useReducedMotion(): boolean {
  const [shouldReduce, setShouldReduce] = useState(() => {
    // Initialize with current state
    if (typeof window === "undefined") return false;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = window.innerWidth < 768;
    return prefersReduced || isMobile;
  });

  useEffect(() => {
    // Check system preference for reduced motion
    const prefersReducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const _prefersReduced = prefersReducedQuery.matches;

    // Check if mobile device (screen width < 768px)
    const _isMobile = window.innerWidth < 768;

    // Listen for changes in reduced motion preference
    const handleReducedChange = (e: MediaQueryListEvent) => {
      setShouldReduce(e.matches || window.innerWidth < 768);
    };

    // Listen for resize to detect mobile/desktop switch
    const handleResize = () => {
      setShouldReduce(prefersReducedQuery.matches || window.innerWidth < 768);
    };

    prefersReducedQuery.addEventListener("change", handleReducedChange);
    window.addEventListener("resize", handleResize);

    return () => {
      prefersReducedQuery.removeEventListener("change", handleReducedChange);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return shouldReduce;
}
