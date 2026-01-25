"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchLedgers } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const { data: ledgers, isLoading } = useQuery({
    queryKey: ["ledgers"],
    queryFn: fetchLedgers,
  });

  useEffect(() => {
    if (!isLoading && ledgers) {
      if (ledgers.length > 0) {
        router.replace(`/ledger/${ledgers[0].id}`);
      } else {
        router.replace("/ledgers");
      }
    }
  }, [ledgers, isLoading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
        <p className="mt-4 text-gray-600">加载中...</p>
      </div>
    </div>
  );
}
