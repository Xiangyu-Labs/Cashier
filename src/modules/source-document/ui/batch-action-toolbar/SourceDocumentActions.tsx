import { Calendar, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface SourceDocumentActionsProps {
  isProcessing: boolean;
  isUpdatingDates: boolean;
  onUpdateDates: () => void;
  onCancel: () => void;
  datePickerOpen: boolean;
  setDatePickerOpen: (open: boolean) => void;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  showUpdateDates: boolean;
  dateImpactError?: boolean;
  isPreviewingDateImpact?: boolean;
}

export function SourceDocumentActions({
  isProcessing,
  isUpdatingDates,
  onUpdateDates,
  onCancel,
  datePickerOpen,
  setDatePickerOpen,
  selectedDate,
  setSelectedDate,
  showUpdateDates,
  dateImpactError = false,
  isPreviewingDateImpact = false,
}: SourceDocumentActionsProps) {
  const t = useTranslations("BatchActions");
  const tCommon = useTranslations("Common");

  return (
    <>
      {showUpdateDates && (
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={isProcessing}
              className="h-9 px-3 text-sm"
            >
              {isUpdatingDates ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Calendar className="size-4" />
              )}
              <span>{t("setDate")}</span>
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
              {dateImpactError ? (
                <p className="mr-auto max-w-48 text-xs text-destructive" role="alert">
                  {t("dateImpactFailed")}
                </p>
              ) : null}
              <Button variant="ghost" size="sm" onClick={onCancel}>
                {tCommon("cancel")}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={onUpdateDates}
                disabled={isUpdatingDates || isPreviewingDateImpact}
              >
                {isPreviewingDateImpact ? <Loader2 className="size-4 animate-spin" /> : null}
                {dateImpactError ? t("retryImpact") : t("confirm")}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </>
  );
}
