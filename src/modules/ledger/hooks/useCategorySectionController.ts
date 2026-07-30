"use client";

import { useEffect, useState } from "react";
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { EntryCategory } from "@/modules/ledger/contracts";

interface UseCategorySectionControllerParams {
  categories: EntryCategory[];
  onCreateCategory: (name: string) => void;
  onReorderCategories: (ids: string[]) => void;
  onCategoryCreated?: () => void;
  isReordering?: boolean;
}

export function resolveCategoryOrder(
  categories: EntryCategory[],
  preview: EntryCategory[] | null,
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier
): string[] | null {
  const ordered = preview ?? categories;
  const oldIndex = ordered.findIndex((category) => category.id === activeId);
  const newIndex = ordered.findIndex((category) => category.id === overId);
  if (oldIndex < 0 || newIndex < 0) return null;
  return (oldIndex === newIndex ? ordered : arrayMove(ordered, oldIndex, newIndex)).map(
    (category) => category.id
  );
}

export function useCategorySectionController({
  categories,
  onCreateCategory,
  onReorderCategories,
  onCategoryCreated,
  isReordering = false,
}: UseCategorySectionControllerParams) {
  const [newCategoryName, setNewCategoryName] = useState("");
  const [draggedCategories, setDraggedCategories] = useState<EntryCategory[] | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleCreate = () => {
    if (newCategoryName.trim() === "") return;
    onCreateCategory(newCategoryName.trim());
  };

  useEffect(() => {
    if (onCategoryCreated == null) return;

    const timer = setTimeout(() => setNewCategoryName(""), 0);
    return () => clearTimeout(timer);
  }, [onCategoryCreated]);

  const handleDragStart = () => {
    if (isReordering) return;
    setDraggedCategories([...categories]);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const preview = draggedCategories;
    setDraggedCategories(null);

    if (over == null || isReordering) return;

    const order = resolveCategoryOrder(categories, preview, active.id, over.id);
    if (order != null) onReorderCategories(order);
  };

  const handleDragOver = (event: {
    active: { id: UniqueIdentifier };
    over: { id: UniqueIdentifier } | null;
  }) => {
    const { active, over } = event;

    if (over == null || active.id === over.id || draggedCategories == null || isReordering) return;

    const oldIndex = draggedCategories.findIndex((category) => category.id === active.id);
    const newIndex = draggedCategories.findIndex((category) => category.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setDraggedCategories(arrayMove(draggedCategories, oldIndex, newIndex));
  };

  return {
    sensors,
    newCategoryName,
    setNewCategoryName,
    displayCategories: draggedCategories ?? categories,
    handleCreate,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
  };
}
