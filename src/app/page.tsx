"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchLedgers, createLedger } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const creatingRef = useRef(false);
  const [statusText, setStatusText] = useState("加载中...");

  const { data: ledgers, isLoading } = useQuery({
    queryKey: ["ledgers"],
    queryFn: fetchLedgers,
  });

  useEffect(() => {
    const handleInit = async () => {
      if (!isLoading && ledgers) {
        if (ledgers.length > 0) {
          router.replace(`/ledger/${ledgers[0].id}`);
        } else if (!creatingRef.current) {
          // Auto create default ledger
          creatingRef.current = true;
          setStatusText("正在创建默认账本...");

          try {
            const newLedger = await createLedger({
              name: "我的账本",
            });
            router.replace(`/ledger/${newLedger.id}`);
          } catch (error) {
            console.error("Failed to auto-create ledger:", error);
            creatingRef.current = false;
            router.replace("/ledgers");
          }
        }
      }
    };

    handleInit();
  }, [ledgers, isLoading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-muted">{statusText}</p>
      </div>
    </div>
  );
}
