"use client";

import { useTranslations } from "next-intl";
import type { AnomalyCode, ProcessingFailureCode } from "@/application/contracts";

type DiagnosticCode = AnomalyCode | ProcessingFailureCode;

export function useDiagnosticMessages() {
  const t = useTranslations("DiagnosticCode");

  const label = (code: DiagnosticCode) => {
    switch (code) {
      case "insufficient_evidence":
        return t("insufficient_evidence");
      case "currency_required":
        return t("currency_required");
      case "amount_conflict":
        return t("amount_conflict");
      case "unsupported_document":
        return t("unsupported_document");
      case "ai_provider_unavailable":
        return t("ai_provider_unavailable");
      case "ai_schema_invalid":
        return t("ai_schema_invalid");
      case "exchange_rate_failure":
        return t("exchange_rate_failure");
      case "storage_failure":
        return t("storage_failure");
      case "processing_unavailable":
        return t("processing_unavailable");
      case "database_unavailable":
        return t("database_unavailable");
      case "request_bound_retry_exhausted":
        return t("request_bound_retry_exhausted");
      case "processing_timeout":
        return t("processing_timeout");
    }
  };

  const description = (code: DiagnosticCode) => {
    switch (code) {
      case "insufficient_evidence":
        return t("insufficient_evidence_desc");
      case "currency_required":
        return t("currency_required_desc");
      case "amount_conflict":
        return t("amount_conflict_desc");
      case "unsupported_document":
        return t("unsupported_document_desc");
      case "ai_provider_unavailable":
        return t("ai_provider_unavailable_desc");
      case "ai_schema_invalid":
        return t("ai_schema_invalid_desc");
      case "exchange_rate_failure":
        return t("exchange_rate_failure_desc");
      case "storage_failure":
        return t("storage_failure_desc");
      case "processing_unavailable":
        return t("processing_unavailable_desc");
      case "database_unavailable":
        return t("database_unavailable_desc");
      case "request_bound_retry_exhausted":
        return t("request_bound_retry_exhausted_desc");
      case "processing_timeout":
        return t("processing_timeout_desc");
    }
  };

  return { label, description };
}
