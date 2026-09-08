"use client";

import dynamic from "next/dynamic";
import { useModalStackStore } from "@/lib/store/modal-stack";
import type { ModalStackRendererProps } from "./ModalStackRenderer";
import { ModalStackLoadingFallback } from "./ModalStackLoadingFallback";

const ModalStackRenderer = dynamic(
  () =>
    import("@/modules/workspace/ui/ModalStackRenderer").then((module) => ({
      default: module.ModalStackRenderer,
    })),
  { ssr: false, loading: () => <ModalStackLoadingFallback /> }
);

export function ModalStackGate(props: ModalStackRendererProps) {
  const hasOpenModal = useModalStackStore((state) => state.stack.length > 0);

  return hasOpenModal ? <ModalStackRenderer {...props} /> : null;
}
