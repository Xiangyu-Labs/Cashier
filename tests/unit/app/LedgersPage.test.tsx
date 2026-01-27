import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import LedgersPage from "@/app/ledgers/page";

// Mock hooks
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: mockPush,
        replace: mockReplace,
    }),
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
    useToast: () => ({ toast: mockToast }),
}));

// Mock react-query
const mockMutate = vi.fn();
const mockInvalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({
    useQueryClient: () => ({
        invalidateQueries: mockInvalidateQueries
    }),
    useQuery: ({ queryKey }: { queryKey: string[] }) => {
        if (queryKey[0] === "ledgers") {
            return {
                data: [
                    { id: "1", name: "Ledger 1" },
                    { id: "2", name: "Ledger 2" }
                ],
                isLoading: false
            };
        }
        return { data: null, isLoading: false };
    },
    useMutation: ({ onSuccess }: { onSuccess: () => void }) => ({
        mutate: (args: unknown) => {
            // Simulate success immediately
            if (onSuccess) {
                onSuccess();
            }
            mockMutate(args);
        },
        isPending: false
    })
}));

// Mock UI components
vi.mock("@/components/ui/dialog", () => ({
    Dialog: ({ open, children }: { open: boolean, children: React.ReactNode }) => open ? <div>{children}</div> : null,
    DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogClose: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

vi.mock("@/components/ledger/LedgerItem", () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    LedgerItem: ({ ledger, onEdit, onDelete }: any) => (
        <div>
            <span>{ledger.name}</span>
            <button onClick={() => onEdit(ledger)}>Edit</button>
            <button onClick={() => onDelete(ledger)}>Delete</button>
        </div>
    )
}));

describe("LedgersPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders list of ledgers", () => {
        render(<LedgersPage />);
        expect(screen.getByText("Ledger 1")).toBeDefined();
        expect(screen.getByText("Ledger 2")).toBeDefined();
    });

    it("opens create modal and creates ledger", () => {
        render(<LedgersPage />);

        // Find "新建账本" button
        const createBtn = screen.getByText("新建账本");
        fireEvent.click(createBtn);

        // Inputs are rendered in Dialog
        const input = screen.getByPlaceholderText("例如：日常开销");
        fireEvent.change(input, { target: { value: "New Ledger" } });

        const confirmBtn = screen.getByText("创建");
        fireEvent.click(confirmBtn);

        expect(mockMutate).toHaveBeenCalledWith({ name: "New Ledger" });
        expect(mockInvalidateQueries).toHaveBeenCalled();
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "创建成功" }));
    });
});
