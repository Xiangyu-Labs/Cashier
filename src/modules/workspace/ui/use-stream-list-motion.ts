"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  computeStreamListMotionDiff,
  EMPTY_STREAM_LIST_MOTION_DIFF,
  streamListMotionKey,
  STREAM_CARD_ENTER_MS,
  STREAM_CARD_EXIT_MS,
  STREAM_CARD_FLIP_MS,
  STREAM_CARD_HIGHLIGHT_MS,
  type StreamListMotionDiff,
  type StreamListMotionItem,
} from "./stream-list-motion";

export interface StreamListMotionApi extends StreamListMotionDiff {
  reducedMotion: boolean;
  registerNode: (id: string, node: HTMLElement | null) => void;
}

/**
 * Tracks the previous card list, entrance/exit/highlight phases, and FLIP
 * baseline rects for the interactive stream list. Reduced-motion users get
 * the final layout immediately with no timers or transforms.
 */
export function useStreamListMotion(items: readonly StreamListMotionItem[]): StreamListMotionApi {
  const reducedMotion = useReducedMotion();
  const itemsKey = streamListMotionKey(items);

  const [prevItems, setPrevItems] = useState<readonly StreamListMotionItem[]>(items);
  const [diff, setDiff] = useState<StreamListMotionDiff>(EMPTY_STREAM_LIST_MOTION_DIFF);
  const [prevReducedMotion, setPrevReducedMotion] = useState(reducedMotion);

  const nodeRefs = useRef(new Map<string, HTMLElement | null>());
  const baselineRects = useRef(new Map<string, DOMRect>());
  const flipApplied = useRef(new Set<string>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const enterTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const exitTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const updateTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const reducedMotionRef = useRef(reducedMotion);

  // Keep a ref mirror for callbacks scheduled before a reduced-motion switch.
  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  // Reduced motion: cancel every pending animation timer and measurement
  // immediately so delayed state updates can never act on a reset animation
  // state. Runs after commit; the diff is already collapsed in render phase.
  useEffect(() => {
    if (!reducedMotion) return;
    for (const timer of timers.current) clearTimeout(timer);
    timers.current.clear();
    enterTimers.current.clear();
    exitTimers.current.clear();
    updateTimers.current.clear();
    flipApplied.current.clear();
    baselineRects.current.clear();
  }, [reducedMotion]);

  // Render-phase state adjustment: the transition must be part of the same
  // commit as the changed list so removed cards get exit copies in the same
  // frame. setState during render is the sanctioned way to derive state from
  // a prop change without a post-commit flash.
  if (prevItems !== items) {
    const nextDiff = reducedMotion
      ? EMPTY_STREAM_LIST_MOTION_DIFF
      : computeStreamListMotionDiff(prevItems, items);
    setPrevItems(items);
    setDiff(nextDiff);
  }
  if (prevReducedMotion !== reducedMotion) {
    setPrevReducedMotion(reducedMotion);
    // Reduced motion: collapse any active transition immediately.
    setDiff(EMPTY_STREAM_LIST_MOTION_DIFF);
  }

  // Phase cleanup timers (entrance, highlight, exit copies).
  useEffect(() => {
    if (reducedMotion) return;
    for (const id of diff.entering) {
      if (enterTimers.current.has(id)) continue;
      const timer = setTimeout(() => {
        enterTimers.current.delete(id);
        timers.current.delete(timer);
        setDiff((current) => {
          const entering = new Set(current.entering);
          entering.delete(id);
          return { ...current, entering };
        });
      }, STREAM_CARD_ENTER_MS);
      enterTimers.current.set(id, timer);
      timers.current.add(timer);
    }
    for (const id of diff.updated) {
      if (updateTimers.current.has(id)) continue;
      const timer = setTimeout(() => {
        updateTimers.current.delete(id);
        timers.current.delete(timer);
        setDiff((current) => {
          const updated = new Set(current.updated);
          updated.delete(id);
          return { ...current, updated };
        });
      }, STREAM_CARD_HIGHLIGHT_MS);
      updateTimers.current.set(id, timer);
      timers.current.add(timer);
    }
    for (const exit of diff.exiting) {
      if (exitTimers.current.has(exit.id)) continue;
      const timer = setTimeout(() => {
        exitTimers.current.delete(exit.id);
        timers.current.delete(timer);
        setDiff((current) => ({
          ...current,
          exiting: current.exiting.filter((item) => item.id !== exit.id),
        }));
      }, STREAM_CARD_EXIT_MS);
      exitTimers.current.set(exit.id, timer);
      timers.current.add(timer);
    }
  }, [diff, reducedMotion]);

  // FLIP pass: move every card from its previous rect to its current rect,
  // then transition to identity. Runs whenever the item order changes or an
  // exit copy is removed (which shifts the remaining cards up).
  const flipKey = `${itemsKey}|exits:${diff.exiting.map((exit) => exit.id).join(",")}`;
  useLayoutEffect(() => {
    if (reducedMotion) {
      // Clear any in-flight FLIP transforms after the reduced-motion switch;
      // their settle timers were canceled in the cleanup effect.
      for (const node of nodeRefs.current.values()) {
        if (node == null) continue;
        node.style.transition = "";
        node.style.transform = "";
      }
      return;
    }
    for (const [id, node] of nodeRefs.current) {
      if (node == null) continue;
      const prevRect = baselineRects.current.get(id);
      if (prevRect == null) continue;
      const rect = node.getBoundingClientRect();
      const dx = prevRect.left - rect.left;
      const dy = prevRect.top - rect.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;

      node.style.transition = "none";
      node.style.transform = `translate(${dx}px, ${dy}px)`;
      flipApplied.current.add(id);
      requestAnimationFrame(() => {
        if (reducedMotionRef.current) return;
        if (!node.isConnected) return;
        node.style.transition = `transform ${STREAM_CARD_FLIP_MS}ms var(--motion-state-ease, ease)`;
        node.style.transform = "";
        const settleTimer = setTimeout(() => {
          timers.current.delete(settleTimer);
          flipApplied.current.delete(id);
          baselineRects.current.set(id, node.getBoundingClientRect());
        }, STREAM_CARD_FLIP_MS + 30);
        timers.current.add(settleTimer);
      });
    }
  }, [flipKey, reducedMotion]);

  // Capture baseline rects after every commit so the next FLIP pass has a
  // "before" position. Nodes mid-FLIP are skipped until their settle timer
  // records the final rect.
  useLayoutEffect(() => {
    for (const [id, node] of nodeRefs.current) {
      if (node == null) continue;
      if (flipApplied.current.has(id)) continue;
      baselineRects.current.set(id, node.getBoundingClientRect());
    }
  });

  // Unmount cleanup: clear every timer and measurement so the list never
  // accumulates per-card bookkeeping.
  useEffect(() => {
    const nodes = nodeRefs.current;
    const rects = baselineRects.current;
    const flipped = flipApplied.current;
    const active = timers.current;
    const enter = enterTimers.current;
    const exit = exitTimers.current;
    const update = updateTimers.current;
    return () => {
      for (const timer of active) clearTimeout(timer);
      for (const timer of enter.values()) clearTimeout(timer);
      for (const timer of exit.values()) clearTimeout(timer);
      for (const timer of update.values()) clearTimeout(timer);
      active.clear();
      enter.clear();
      exit.clear();
      update.clear();
      nodes.clear();
      rects.clear();
      flipped.clear();
    };
  }, []);

  const registerNode = useCallback((id: string, node: HTMLElement | null) => {
    if (node == null) {
      nodeRefs.current.delete(id);
      baselineRects.current.delete(id);
      return;
    }
    nodeRefs.current.set(id, node);
  }, []);

  return { ...diff, reducedMotion, registerNode };
}
