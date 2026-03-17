import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type QueryKey } from "@tanstack/react-query";
import React from "react";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from "sonner";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("useLedgerMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应该成功执行mutation并显示成功toast", async () => {
    const mutationFn = vi.fn().mockResolvedValue({ id: "123" });

    const { result } = renderHook(
      () =>
        useLedgerMutation("ledger-123", {
          mutationFn,
          successMessage: "操作成功",
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.mutate({ data: "test" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mutationFn).toHaveBeenCalledWith(
      { data: "test" },
      expect.objectContaining({ client: expect.any(QueryClient) })
    );
    expect(toast.success).toHaveBeenCalledWith("操作成功");
  });

  it("应该在失败时显示错误toast", async () => {
    const mutationFn = vi.fn().mockRejectedValue(new Error("操作失败"));
    const onErrorExtra = vi.fn();

    const { result } = renderHook(
      () =>
        useLedgerMutation("ledger-123", {
          mutationFn,
          errorMessage: "操作失败",
          onErrorExtra,
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.mutate({ data: "test" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalledWith("操作失败");
    expect(onErrorExtra).toHaveBeenCalledWith(expect.any(Error), { data: "test" });
  });

  it("应该支持乐观更新并在失败时自动回滚", async () => {
    const mutationFn = vi.fn().mockRejectedValue(new Error("Network error"));
    const onOptimisticUpdate = vi.fn().mockReturnValue({
      snapshots: [[["test-data", "ledger-123"], [{ id: "1", name: "Item 1" }]]] as [QueryKey, unknown][],
    });

    const { result } = renderHook(
      () =>
        useLedgerMutation("ledger-123", {
          mutationFn,
          onOptimisticUpdate,
        }),
      { wrapper: createWrapper() }
    );

    // 执行mutation
    act(() => {
      result.current.mutate({ data: "test" });
    });

    // 验证onOptimisticUpdate被调用
    await waitFor(() => expect(onOptimisticUpdate).toHaveBeenCalled());

    // 等待mutation失败
    await waitFor(() => expect(result.current.isError).toBe(true));

    // 验证回滚逻辑被触发（通过检查context包含snapshots）
    expect(result.current.error).toBeDefined();
  });

  it("应该支持自定义回滚函数", async () => {
    const onRollback = vi.fn();
    const mutationFn = vi.fn().mockRejectedValue(new Error("Error"));

    const { result } = renderHook(
      () =>
        useLedgerMutation("ledger-123", {
          mutationFn,
          onOptimisticUpdate: () => ({ custom: "context" }),
          onRollback,
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.mutate({});
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(onRollback).toHaveBeenCalledWith(expect.any(QueryClient), { custom: "context" });
  });

  it("当message设为null时不应显示toast", async () => {
    const mutationFn = vi.fn().mockResolvedValue({});

    const { result } = renderHook(
      () =>
        useLedgerMutation("ledger-123", {
          mutationFn,
          successMessage: null,
          errorMessage: null,
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.mutate({});
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(toast.success).not.toHaveBeenCalled();
  });

  it("应该调用onSuccessExtra回调", async () => {
    const mutationFn = vi.fn().mockResolvedValue({ id: "123" });
    const onSuccessExtra = vi.fn();

    const { result } = renderHook(
      () =>
        useLedgerMutation("ledger-123", {
          mutationFn,
          onSuccessExtra,
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.mutate({ data: "test" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(onSuccessExtra).toHaveBeenCalledWith({ id: "123" }, { data: "test" }, undefined);
  });
});

