import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { createListSnapshots } from "@/lib/mutations/use-ledger-mutation";

describe("createListSnapshots", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });
  });

  describe("类型 B: 过滤参数导致的 key 变体", () => {
    it("应该匹配带过滤参数的 query key (sourceDocuments 场景)", () => {
      const ledgerId = "ledger-123";

      // 设置不同过滤参数的 queries
      queryClient.setQueryData(["sourceDocuments", ledgerId], []);
      queryClient.setQueryData(["sourceDocuments", ledgerId, "unified"], { items: [] });
      queryClient.setQueryData(["sourceDocuments", ledgerId, "unified", "2024-01-01"], {
        items: [],
      });
      queryClient.setQueryData(
        ["sourceDocuments", ledgerId, "completed", "2024-01-01", "2024-12-31"],
        { items: [] }
      );
      queryClient.setQueryData(["sourceDocuments", ledgerId, "active"], []);

      const baseKey = ["sourceDocuments", ledgerId];
      const snapshots = createListSnapshots(queryClient, baseKey);

      // 当前行为：已经支持前缀匹配，匹配所有以 baseKey 为前缀的 queries
      expect(snapshots.length).toBe(5);
    });

    it("应该匹配带过滤参数的 query key (ledgerEntries 场景)", () => {
      const ledgerId = "ledger-456";

      queryClient.setQueryData(["ledgerEntries", ledgerId], []);
      queryClient.setQueryData(["ledgerEntries", ledgerId, "summary", "2024-01-01", "2024-12-31"], {
        total: 100,
      });
      queryClient.setQueryData(["ledgerEntries", ledgerId, "infinite", "2024-01-01"], {
        pages: [],
      });
      queryClient.setQueryData(
        ["ledgerEntries", ledgerId, "monthly-expense", "2024-01-01", "2024-12-31"],
        []
      );

      const baseKey = ["ledgerEntries", ledgerId];
      const snapshots = createListSnapshots(queryClient, baseKey);

      // 当前行为：已经支持前缀匹配，匹配所有 4 个
      expect(snapshots.length).toBe(4);
    });

    it("不应该匹配不同 ledgerId 的 queries", () => {
      const ledgerId1 = "ledger-123";
      const ledgerId2 = "ledger-456";

      queryClient.setQueryData(["sourceDocuments", ledgerId1], []);
      queryClient.setQueryData(["sourceDocuments", ledgerId1, "unified"], { items: [] });
      queryClient.setQueryData(["sourceDocuments", ledgerId2], []);
      queryClient.setQueryData(["sourceDocuments", ledgerId2, "unified"], { items: [] });

      const baseKey = ["sourceDocuments", ledgerId1];
      const snapshots = createListSnapshots(queryClient, baseKey);

      // 只应该匹配 ledgerId1 的 2 个 queries
      expect(snapshots.length).toBe(2);
    });
  });
});
