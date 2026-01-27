import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Category } from "@/types/api";
import { type ReactNode } from "react";

export interface TransactionEditFormData {
    itemName: string;
    amount: number;
    currency: string;
    categoryId: string;
    transactionDate: string;
}

interface TransactionEditFormProps {
    data: TransactionEditFormData;
    categories: Category[];
    onChange: (data: TransactionEditFormData) => void;
    onSave: () => void;
    onCancel: () => void;
}

export function TransactionEditForm({
    data,
    categories,
    onChange,
    onSave,
    onCancel,
}: TransactionEditFormProps): ReactNode {
    const handleChange = <K extends keyof TransactionEditFormData>(
        field: K,
        value: TransactionEditFormData[K]
    ) => {
        onChange({ ...data, [field]: value });
    };

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <label className="text-sm font-medium text-text">商品名称</label>
                <Input
                    type="text"
                    value={data.itemName}
                    onChange={(e) => handleChange("itemName", e.target.value)}
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-text">金额</label>
                    <Input
                        type="number"
                        value={data.amount}
                        onChange={(e) =>
                            handleChange("amount", parseFloat(e.target.value) || 0)
                        }
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium text-text">货币</label>
                    <Input
                        type="text"
                        value={data.currency}
                        onChange={(e) => handleChange("currency", e.target.value)}
                        placeholder="CNY / USD"
                    />
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium text-text">分类</label>
                <select
                    value={data.categoryId}
                    onChange={(e) => handleChange("categoryId", e.target.value)}
                    className="flex h-9 w-full rounded-md border border-border bg-surface px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                    <option value="">选择分类</option>
                    {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                            {cat.icon} {cat.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium text-text">交易日期</label>
                <Input
                    type="date"
                    value={data.transactionDate}
                    onChange={(e) => handleChange("transactionDate", e.target.value)}
                />
            </div>

            <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={onCancel}>
                    取消
                </Button>
                <Button onClick={onSave}>保存</Button>
            </div>
        </div>
    );
}
