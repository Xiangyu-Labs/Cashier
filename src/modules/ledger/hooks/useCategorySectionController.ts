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
}

export function useCategorySectionController({
  categories,
  onCreateCategory,
  onReorderCategories,
  onCategoryCreated,
}: UseCategorySectionControllerParams) {
  const [newCategoryName, setNewCategoryName] = useState("");
  const [draggedCategories, setDraggedCategories] = useState<EntryCategory[] | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
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
    setDraggedCategories([...categories]);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggedCategories(null);

    if (over == null || active.id === over.id) return;

    const oldIndex = categories.findIndex((category) => category.id === active.id);
    const newIndex = categories.findIndex((category) => category.id === over.id);
    const reordered = arrayMove(categories, oldIndex, newIndex);
    onReorderCategories(reordered.map((category) => category.id));
  };

  const handleDragOver = (event: {
    active: { id: UniqueIdentifier };
    over: { id: UniqueIdentifier } | null;
  }) => {
    const { active, over } = event;

    if (over == null || active.id === over.id || draggedCategories == null) return;

    const oldIndex = draggedCategories.findIndex((category) => category.id === active.id);
    const newIndex = draggedCategories.findIndex((category) => category.id === over.id);
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
