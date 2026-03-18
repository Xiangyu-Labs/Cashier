import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  LedgerEntryViewDetails,
  type EntryPendingChanges,
} from "@/modules/ledger/ui/LedgerEntryViewDetails";
import { type LedgerEntry, type EntryCategory } from "@/types/api";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: (_key: string) => (s: string) => s,
  useLocale: () => "en",
  useFormatter: () => ({
    dateTime: (date: Date) => date.toLocaleDateString("en-US"),
  }),
}));

// Mock currencies config
vi.mock("@/config/currencies", () => ({
  SUPPORTED_CURRENCIES: ["USD", "EUR", "CNY", "HKD", "JPY"],
}));

// Mock DateFilter component
vi.mock("@/components/ui/date-filter", () => ({
  DateFilter: ({
    value,
    onChange,
  }: {
    value?: string | Date | null;
    onChange: (date: Date | null) => void;
  }) => (
    <input
      type="date"
      data-testid="date-filter"
      value={
        typeof value === "string"
          ? value
          : value instanceof Date
            ? value.toISOString().split("T")[0]
            : ""
      }
      onChange={(e) => onChange(e.target.value !== "" ? new Date(e.target.value) : null)}
    />
  ),
}));

// Mock editable components
vi.mock("@/components/ui/editable-field", () => ({
  EditableField: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  }) => (
    <input
      data-testid="editable-field"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}));

vi.mock("@/components/ui/editable-category-select", () => ({
  EditableCategorySelect: ({
    value,
    onChange,
  }: {
    value: string | null;
    onChange: (v: string) => void;
  }) => (
    <button data-testid="editable-category" onClick={() => onChange("c2")}>
      {value ?? "Select"}
    </button>
  ),
}));

// Mock child components
vi.mock("@/components/CategoryIcon", () => ({
  CategoryIcon: () => <div data-testid="category-icon">Icon</div>,
}));

describe("LedgerEntryViewDetails", () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const renderWithQuery = (ui: React.ReactElement) => {
    return render(ui, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });
  };

  const mockLedgerEntry: LedgerEntry = {
    id: "1",
    ledgerId: "l1",
    categoryId: "c1",
    amount: "100.50",
    currency: "CNY",
    sourceDocumentId: "sd-1",
    description: "Test description",
    createdAt: "2023-01-28T10:00:00Z",
    updatedAt: "2023-01-28T10:00:00Z",
    deletedAt: null,
    itemName: "Test Item",
    convertedAmount: null,
    exchangeRate: null,
    category: {
      id: "c1",
      name: "Food",
      icon: "food",
      sortOrder: 0,
      description: null,
      isEditable: true,
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
      ledgerId: "l1",
    },
  };

  const mockCategories: EntryCategory[] = [
    {
      id: "c1",
      name: "Food",
      icon: "food",
      sortOrder: 0,
      description: null,
      isEditable: true,
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
      ledgerId: "l1",
    },
    {
      id: "c2",
      name: "Transport",
      icon: "car",
      sortOrder: 1,
      description: null,
      isEditable: true,
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
      ledgerId: "l1",
    },
  ];

  const defaultProps = {
    ledgerEntry: mockLedgerEntry,
    categories: mockCategories,
    pendingChanges: {} as EntryPendingChanges,
    onFieldChange: vi.fn(),
    onSave: vi.fn(),
    onDiscard: vi.fn(),
    onDelete: vi.fn(),
  };

  it("renders item details", () => {
    renderWithQuery(<LedgerEntryViewDetails {...defaultProps} />);
    // EditableField mocked - check for inputs with values
    const inputs = screen.getAllByTestId("editable-field");
    expect(inputs.length).toBeGreaterThan(0);
  });

  it("displays pending changes merged with original data", () => {
    const pendingChanges: EntryPendingChanges = {
      itemName: "Modified Item",
    };
    renderWithQuery(<LedgerEntryViewDetails {...defaultProps} pendingChanges={pendingChanges} />);

    // Check that the input has the pending value
    const inputs = screen.getAllByTestId("editable-field");
    const itemNameInput = inputs.find(
      (input) => (input as HTMLInputElement).value === "Modified Item"
    );
    expect(itemNameInput).toBeDefined();
  });

  it("triggers onFieldChange when field is edited", () => {
    renderWithQuery(<LedgerEntryViewDetails {...defaultProps} />);

    const inputs = screen.getAllByTestId("editable-field");
    fireEvent.change(inputs[0], { target: { value: "New Item Name" } });

    expect(defaultProps.onFieldChange).toHaveBeenCalled();
  });

  it("shows save button when there are pending changes", () => {
    const pendingChanges: EntryPendingChanges = {
      itemName: "Modified Item",
    };
    renderWithQuery(<LedgerEntryViewDetails {...defaultProps} pendingChanges={pendingChanges} />);

    // Look for save button
    expect(screen.getByText("save")).toBeDefined();
  });

  it("triggers onSave when save button is clicked", () => {
    const pendingChanges: EntryPendingChanges = {
      itemName: "Modified Item",
    };
    renderWithQuery(<LedgerEntryViewDetails {...defaultProps} pendingChanges={pendingChanges} />);

    const saveButton = screen.getByText("save");
    fireEvent.click(saveButton);

    expect(defaultProps.onSave).toHaveBeenCalled();
  });

  it("triggers onDiscard when discard button is clicked", () => {
    const pendingChanges: EntryPendingChanges = {
      itemName: "Modified Item",
    };
    renderWithQuery(<LedgerEntryViewDetails {...defaultProps} pendingChanges={pendingChanges} />);

    const discardButton = screen.getByText("discardChanges");
    fireEvent.click(discardButton);

    expect(defaultProps.onDiscard).toHaveBeenCalled();
  });

  it("renders delete button", () => {
    renderWithQuery(<LedgerEntryViewDetails {...defaultProps} />);

    const deleteButton = screen.getByText("delete");
    expect(deleteButton).toBeDefined();
  });

  it("triggers onDelete when delete button is clicked", () => {
    renderWithQuery(<LedgerEntryViewDetails {...defaultProps} />);

    const deleteButton = screen.getByText("delete");
    fireEvent.click(deleteButton);

    expect(defaultProps.onDelete).toHaveBeenCalled();
  });

  it("shows view source button when onViewSourceDocument is provided", () => {
    const onViewSourceDocument = vi.fn();
    renderWithQuery(
      <LedgerEntryViewDetails {...defaultProps} onViewSourceDocument={onViewSourceDocument} />
    );

    expect(screen.getByText("viewSource")).toBeDefined();
  });
});
