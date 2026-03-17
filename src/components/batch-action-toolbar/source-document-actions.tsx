/**
 * Source Document Batch Actions
 *
 * Action buttons for batch operations on source documents:
 * - Update Dates
 * - Retry
 */

import { Calendar, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { useTranslations } from "next-intl";

interface SourceDocumentActionsProps {
  isProcessing: boolean;
  isUpdatingDates: boolean;
  isRetrying: boolean;
  onUpdateDates: () => void;
  onRetry: () => void;
  onCancel: () => void;
  datePickerOpen: boolean;
  setDatePickerOpen: (open: boolean) => void;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  showUpdateDates: boolean;
  showRetry: boolean;
}

export function SourceDocumentActions({
  isProcessing,
  isUpdatingDates,
  isRetrying,
  onUpdateDates,
  onRetry,
  onCancel,
  datePickerOpen,
  setDatePickerOpen,
  selectedDate,
  setSelectedDate,
  showUpdateDates,
  showRetry,
}: SourceDocumentActionsProps) {
  const t = useTranslations("BatchActions");
  const tCommon = useTranslations("Common");

  return (
    <>
      {/* Date Picker - flex-1 */}
      {showUpdateDates && (
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={isProcessing}
              className="flex-1 h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
            >
              {isUpdatingDates ? (
                <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5 animate-spin" />
              ) : (
                <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />
              )}
              <span className="hidden sm:inline">{t("setDate")}</span>
              <span className="sm:hidden">{t("setDateShort")}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="center">
            <CalendarComponent
              value={selectedDate}
              onChange={(date) => {
                if (date) {
                  setSelectedDate(date);
                }
              }}
              showShortcuts={false}
            />
            <div className="flex justify-end gap-2 p-3 border-t">
              <Button variant="ghost" size="sm" onClick={onCancel}>
                {tCommon("cancel")}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={onUpdateDates}
                disabled={isUpdatingDates}
              >
                {t("confirm")}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Retry - flex-1 */}
      {showRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          disabled={isProcessing}
          className="flex-1 h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
        >
          {isRetrying ? (
            <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />
          )}
          <span className="hidden sm:inline">{t("retry")}</span>
          <span className="sm:hidden">{t("retryShort")}</span>
        </Button>
      )}
    </>
  );
}
