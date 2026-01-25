"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  fetchLedger,
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/lib/api";
import { Category } from "@/types/api";

export default function CategoriesPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const ledgerId = params.id as string;

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    icon: "",
  });

  const { data: ledger } = useQuery({
    queryKey: ["ledger", ledgerId],
    queryFn: () => fetchLedger(ledgerId),
  });

  const { data: categories, isLoading } = useQuery({
    queryKey: ["categories", ledgerId],
    queryFn: () => fetchCategories(ledgerId),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; icon?: string }) =>
      createCategory(ledgerId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories", ledgerId] });
      setShowCreateModal(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      categoryId,
      data,
    }: {
      categoryId: string;
      data: { name?: string; description?: string; icon?: string };
    }) => updateCategory(ledgerId, categoryId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories", ledgerId] });
      setEditingCategory(null);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (categoryId: string) => deleteCategory(ledgerId, categoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories", ledgerId] });
    },
  });

  const resetForm = () => {
    setFormData({ name: "", description: "", icon: "" });
  };

  const handleCreate = () => {
    if (formData.name.trim()) {
      createMutation.mutate({
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        icon: formData.icon.trim() || undefined,
      });
    }
  };

  const handleUpdate = () => {
    if (editingCategory && formData.name.trim()) {
      updateMutation.mutate({
        categoryId: editingCategory.id,
        data: {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          icon: formData.icon.trim() || undefined,
        },
      });
    }
  };

  const handleDelete = (category: Category) => {
    if (confirm(`确定要删除分类「${category.name}」吗？相关记录将变为未分类。`)) {
      deleteMutation.mutate(category.id);
    }
  };

  const openEditModal = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || "",
      icon: category.icon || "",
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link
              href={`/ledger/${ledgerId}`}
              className="text-gray-500 hover:text-gray-700"
            >
              ←
            </Link>
            <h1 className="text-xl font-bold">分类管理</h1>
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            新建分类
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        <div className="bg-white rounded-lg shadow">
          {categories && categories.length > 0 ? (
            <div className="divide-y">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="p-4 flex items-center justify-between hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{category.icon || "📁"}</span>
                    <div>
                      <p className="font-medium">{category.name}</p>
                      {category.description && (
                        <p className="text-sm text-gray-500">
                          {category.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditModal(category)}
                      className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(category)}
                      className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              暂无分类，点击右上角新建
            </div>
          )}
        </div>

        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>提示：</strong>
            分类描述用于帮助 AI 更准确地识别和归类消费。例如，「餐饮」分类的描述可以是「外卖、堂食、食材采购」。
          </p>
        </div>
      </main>

      {/* 创建/编辑弹窗 */}
      {(showCreateModal || editingCategory) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">
              {editingCategory ? "编辑分类" : "新建分类"}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  分类名称 *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="例如：餐饮"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  图标
                </label>
                <input
                  type="text"
                  value={formData.icon}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, icon: e.target.value }))
                  }
                  placeholder="例如：🍽️"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  描述（帮助 AI 识别）
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="例如：外卖、堂食、食材采购"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingCategory(null);
                  resetForm();
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                取消
              </button>
              <button
                onClick={editingCategory ? handleUpdate : handleCreate}
                disabled={
                  !formData.name.trim() ||
                  createMutation.isPending ||
                  updateMutation.isPending
                }
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "保存中..."
                  : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
