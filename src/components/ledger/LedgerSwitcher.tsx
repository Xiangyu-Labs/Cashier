"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Plus, Book } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fetchLedgers, createLedger } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface LedgerSwitcherProps {
    currentLedgerId: string;
}

export function LedgerSwitcher({ currentLedgerId }: LedgerSwitcherProps) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newLedgerName, setNewLedgerName] = useState("");

    const { data: ledgers } = useQuery({
        queryKey: ["ledgers"],
        queryFn: fetchLedgers,
    });

    const currentLedger = ledgers?.find((l) => l.id === currentLedgerId);

    const createMutation = useMutation({
        mutationFn: createLedger,
        onSuccess: (newLedger) => {
            queryClient.invalidateQueries({ queryKey: ["ledgers"] });
            setShowCreateModal(false);
            setNewLedgerName("");
            setOpen(false);
            toast({
                title: "创建成功",
                description: "账本已创建",
                variant: "success",
            });
            router.push(`/ledger/${newLedger.id}`);
        },
        onError: () => {
            toast({
                title: "创建失败",
                description: "无法创建账本，请稍后重试",
                variant: "error",
            });
        },
    });

    const handleCreate = () => {
        if (newLedgerName.trim()) {
            createMutation.mutate({
                name: newLedgerName.trim(),
            });
        }
    };

    return (
        <>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="ghost"
                        role="combobox"
                        aria-expanded={open}
                        className="w-auto px-2 hover:bg-transparent text-lg font-bold hover:text-primary transition-colors hover:bg-accent/10"
                    >
                        <span className="truncate text-left max-w-[100px] sm:max-w-[150px]">{currentLedger?.name || "选择账本"}</span>
                        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[200px] p-0" align="start">
                    <div className="max-h-[300px] overflow-y-auto p-1">
                        {ledgers?.map((ledger) => (
                            <div
                                key={ledger.id}
                                className={cn(
                                    "flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors",
                                    currentLedgerId === ledger.id && "bg-accent/50"
                                )}
                                onClick={() => {
                                    setOpen(false);
                                    router.push(`/ledger/${ledger.id}`);
                                }}
                            >
                                <Book className="h-4 w-4 text-muted-foreground" />
                                <span className="flex-1 truncate">{ledger.name}</span>
                                {currentLedgerId === ledger.id && (
                                    <Check className="h-4 w-4 text-primary" />
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="border-t border-border p-1">
                        <div
                            className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none cursor-pointer hover:bg-accent hover:text-accent-foreground text-primary transition-colors"
                            onClick={() => setShowCreateModal(true)}
                        >
                            <Plus className="h-4 w-4" />
                            <span>新建账本</span>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>

            <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>新建账本</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text">
                                账本名称
                            </label>
                            <Input
                                value={newLedgerName}
                                onChange={(e) => setNewLedgerName(e.target.value)}
                                placeholder="例如：日常开销"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && newLedgerName.trim()) {
                                        handleCreate();
                                    }
                                }}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setShowCreateModal(false);
                                setNewLedgerName("");
                            }}
                        >
                            取消
                        </Button>
                        <Button
                            onClick={handleCreate}
                            disabled={!newLedgerName.trim() || createMutation.isPending}
                        >
                            {createMutation.isPending ? "创建中..." : "创建"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
