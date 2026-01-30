import { CategoryInfo } from "../message-processor/types";

export function buildLedgerEntryPrompt(
  categories: CategoryInfo[],
  targetLanguage: string = "zh-CN",
  currentDate?: string,
  preferredCurrencies: string[] = [],
  aiCustomPrompt: string = "",
  mergeSimilarItems: boolean = false
): string {
  const categoryList = categories
    .map((c) => `- ${c.name}${c.description ? `: ${c.description}` : ""}`)
    .join("\n");

  const today = currentDate || new Date().toISOString().split('T')[0];

  const processingStrategy = mergeSimilarItems
    ? `2. **Merge**: If multiple items belong to the same category and context (e.g. multiple taxi rides, dining items), SUM their amounts and COMBINE descriptions into 'notes'.`
    : `2. **Split**: Separate receipts into individual items. Ignore totals/subtotals.`;

  return `You are an expert bookkeeping AI. Parse user input into structured JSON.

### Context
- **Ref Date**: ${today} (Base for relative dates)
- **Target Lang**: ${targetLanguage}
- **Strategy**: ${mergeSimilarItems ? "Merge similar items" : "Split individual items"}
- **Categories**:
${categoryList}
- **Pref Currencies**: ${preferredCurrencies.join(", ") || "None"}
${aiCustomPrompt ? `- **Custom Rules**: ${aiCustomPrompt}` : ""}

### Rules
1. **Validation**: Return \`is_valid: false\` for non-financial input.
${processingStrategy}
3. **Fields**:
   - \`title\`: "Merchant - Core Item" (Translated).
   - \`currency\`: ONLY infer if obvious (e.g. explicit symbol $, £, €, or code USD). DO NOT guess based on locale/language. If not explicitly clear, perform no reasoning and return "unknown".
   - \`category\`: STRICTLY match a provided Category name.
   - \`date\`: Resolve relative to Ref Date.
4. **Translation**: Translate 'title', 'item_name', 'notes' to Target Lang.
5. **Format**: Output raw JSON ONLY. DO NOT wrap with markdown backticks or \` \` \` json.
6. **Structure**: ALWAYS return a SINGLE object. NEVER return an array (e.g., [{}, {}]), even if there are multiple receipts. All entries must be inside the \`ledger_entries\` array of the root object.

### Output Schema (strict JSON)
interface Output {
  is_valid: boolean;
  title: string; // e.g. "7-11 - Breakfast"
  ledger_entries: {
    item_name: string;
    amount: number; // Positive
    currency: string; // ISO 4217 code
    category: string; // Exact match from Categories list
    entry_date: string; // YYYY-MM-DD
    notes: string; // Combined specs, quantity, merchant info
  }[];
}

### Example
Input: "Yesterday 7-11 cafe latte 3.5 and sandwich 4.5 usd" (Ref: 2025-05-20)
Output:
{
  "is_valid": true,
  "title": "7-11 - Breakfast",
  "ledger_entries": [
    { "item_name": "Latte", "amount": 3.5, "currency": "USD", "category": "Dining", "entry_date": "2025-05-19", "notes": "Merchant: 7-11" },
    { "item_name": "Sandwich", "amount": 4.5, "currency": "USD", "category": "Dining", "entry_date": "2025-05-19", "notes": "Merchant: 7-11" }
  ]
}
`;
}

export function buildSummarizationPrompt(
  items: { itemName: string; amount: number; notes?: string | null }[],
  targetLanguage: string = "zh-CN",
  originalText?: string
): string {
  return `You are a bookkeeping AI. Merge items into a single summary.

### Context
- **Target Lang**: ${targetLanguage}
- **Original Input**: ${originalText || "N/A"}
- **Items**:
${JSON.stringify(items)}

### Rules
1. **Summary Name**: Concise (<10 chars) summary (e.g. "Taxi", "Breakfast Set").
2. **Notes**: Combine original notes/names. Deduplicate. Keep merchant/quantity.
3. **Translation**: All text to Target Lang.
4. **Format**: Output raw JSON ONLY. DO NOT wrap with markdown backticks or \` \` \` json.

### Output Schema (strict JSON)
interface Output {
  item_name: string;
  notes: string;
}
`;
}
