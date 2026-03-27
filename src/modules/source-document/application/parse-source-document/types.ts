// ===== Stage 0 Types =====

export interface DocumentPrimaryEvidence {
  merchant: string | null;
  totals: string[];
  currencies: string[];
  dates: string[];
  lineItems: string[];
}

export interface DocumentUnderstanding {
  documentType: string | null;
  primaryEvidence: DocumentPrimaryEvidence;
  secondaryEvidence: string[];
  ambiguities: string[];
  salienceHints: string;
}

// ===== Stage 1 Types =====

export interface ValidityCheckOutput {
  is_valid: boolean;
  reasoning: string;
}

// ===== Stage 2 Types =====

export interface ParsedEntry {
  item_name: string;
  amount: number;
  currency: string;
  category_index: number; // 0 = no category, 1+ = index into categories array
  notes: string | null;
}

