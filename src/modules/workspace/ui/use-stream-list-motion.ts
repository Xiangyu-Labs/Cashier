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
export function useStreamListMotion(
  items: readonly StreamListMotionItem[],
  layoutKey = ""
): StreamListMotionApi {
  const reducedMotion = useReducedMotion();
  const itemsKey = streamListMotionKey(items);

  const [itemSnapshot, setItemSnapshot] = useState(() => ({ key: itemsKey, items }));
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
  const measuredItemsRef = useRef(items);
  const measuredLayoutKeyRef = useRef(layoutKey);
  const measuredExitsRef = useRef(diff.exiting);

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
  if (itemSnapshot.key !== itemsKey) {
    const nextDiff = reducedMotion
      ? EMPTY_STREAM_LIST_MOTION_DIFF
      : computeStreamListMotionDiff(itemSnapshot.items, items);
    setItemSnapshot({ key: itemsKey, items });
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
    const currentItems = itemSnapshot.items;
    const previousItems = measuredItemsRef.current;
    const previousLayoutKey = measuredLayoutKeyRef.current;
    const previousExits = measuredExitsRef.current;
    const previousIndex = new Map(previousItems.map((item, index) => [item.id, index]));
    const currentIndex = new Map(currentItems.map((item, index) => [item.id, index]));
    let firstAffectedIndex = Number.POSITIVE_INFINITY;
    const maxLength = Math.max(previousItems.length, currentItems.length);
    for (let index = 0; index < maxLength; index += 1) {
      if (previousItems[index]?.id !== currentItems[index]?.id) {
        firstAffectedIndex = index;
        break;
      }
    }
    if (previousLayoutKey !== layoutKey) {
      const previousExpanded = new Set(
        previousLayoutKey === "" ? [] : previousLayoutKey.split(",")
      );
      const currentExpanded = new Set(layoutKey === "" ? [] : layoutKey.split(","));
      for (const [id, index] of currentIndex) {
        if (previousExpanded.has(id) !== currentExpanded.has(id)) {
          firstAffectedIndex = Math.min(firstAffectedIndex, index);
        }
      }
    }
    for (const exit of [...previousExits, ...diff.exiting]) {
      firstAffectedIndex = Math.min(firstAffectedIndex, exit.index);
    }
    const affectedIds = new Set<string>([...diff.moving, ...diff.updated, ...diff.entering]);
    for (const id of diff.updated) {
      const index = currentIndex.get(id);
      if (index != null) firstAffectedIndex = Math.min(firstAffectedIndex, index);
    }
    if (Number.isFinite(firstAffectedIndex)) {
      for (let index = firstAffectedIndex; index < currentItems.length; index += 1) {
        const id = currentItems[index]?.id;
        if (id != null) affectedIds.add(id);
      }
    }
    for (const id of affectedIds) {
      const node = nodeRefs.current.get(id);
      if (node == null) continue;
      const prevRect = baselineRects.current.get(id);
      const rect = node.getBoundingClientRect();
      if (prevRect == null) {
        baselineRects.current.set(id, rect);
        continue;
      }
      const dx = prevRect.left - rect.left;
      const dy = prevRect.top - rect.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        baselineRects.current.set(id, rect);
        continue;
      }

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
    measuredItemsRef.current = currentItems;
    measuredLayoutKeyRef.current = layoutKey;
    measuredExitsRef.current = diff.exiting;
    for (const id of previousIndex.keys()) {
      if (!currentIndex.has(id)) baselineRects.current.delete(id);
    }
  }, [
    diff.entering,
    diff.exiting,
    diff.moving,
    diff.updated,
    flipKey,
    itemSnapshot.items,
    layoutKey,
    reducedMotion,
  ]);

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
    baselineRects.current.set(id, node.getBoundingClientRect());
  }, []);

  return { ...diff, reducedMotion, registerNode };
}
