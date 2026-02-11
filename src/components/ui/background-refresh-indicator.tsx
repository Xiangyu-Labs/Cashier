"use client";

import { useIsFetching } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface BackgroundRefreshIndicatorProps {
  queryKey?: readonly unknown[];
  delay?: number;
}

export function BackgroundRefreshIndicator({
  queryKey,
  delay = 500,
}: BackgroundRefreshIndicatorProps) {
  const t = useTranslations("BackgroundRefresh");
  const isFetching = useIsFetching({ queryKey });
  const [showIndicator, setShowIndicator] = useState(false);

  useEffect(() => {
    if (isFetching > 0) {
      const timer = setTimeout(() => setShowIndicator(true), delay);
      return () => clearTimeout(timer);
    } else {
      setShowIndicator(false);
    }
  }, [isFetching, delay]);

  return (
    <AnimatePresence>
      {showIndicator && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface/90 backdrop-blur-sm border border-border shadow-lg">
            <RefreshCw className="w-3 h-3 text-primary animate-spin" />
            <span className="text-xs text-muted-foreground">{t("syncing")}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
