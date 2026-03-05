/**
 * Text Folding Hook
 *
 * Detects if text content needs folding based on height.
 */

import { useState, useEffect, useRef, RefObject } from "react";

interface UseTextFoldingResult {
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
  needsFolding: boolean;
  contentRef: RefObject<HTMLDivElement | null>;
}

export function useTextFolding(deps: unknown[]): UseTextFoldingResult {
  const [isExpanded, setIsExpanded] = useState(false);
  const [needsFolding, setNeedsFolding] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contentRef.current) {
      return;
    }

    const element = contentRef.current;
    const rafId = requestAnimationFrame(() => {
      const isClamped = element.classList.contains("line-clamp-3");
      if (isClamped) element.classList.remove("line-clamp-3");
      const fullHeight = element.scrollHeight;
      element.classList.add("line-clamp-3");
      const clampedHeight = element.clientHeight;
      const shouldFold = fullHeight > clampedHeight;

      setNeedsFolding(shouldFold);

      if (isExpanded) {
        element.classList.remove("line-clamp-3");
      }
    });

    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    isExpanded,
    setIsExpanded,
    needsFolding,
    contentRef,
  };
}
