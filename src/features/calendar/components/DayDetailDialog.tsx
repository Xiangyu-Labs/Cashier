/**
 * Day Detail Dialog Component
 *
 * Shows detailed entries for a selected date.
 */

'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useCalendarDayDetail } from '../client/hooks/useCalendarData';
import type { CalendarFilters } from '../types';

interface DayDetailDialogProps {
  ledgerId: string;
  date: string | null;
  filters: CalendarFilters;
  onClose: () => void;
  className?: string;
}

export function DayDetailDialog({
  ledgerId,
  date,
  filters,
  onClose,
  className,
}: DayDetailDialogProps) {
  const { data, isLoading } = useCalendarDayDetail(ledgerId, date, filters);

  const isOpen = !!date;

  // Format date for display
  const formatDateDisplay = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return `${year}年${month}月${day}日`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn('max-w-md p-0', className)}>
        <DialogHeader className="p-4 pb-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg">
              {date ? formatDateDisplay(date) : ''} 消费明细
            </DialogTitle>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">
            加载中…
          </div>
        ) : !data || data.entries.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            该日无消费记录
          </div>
        ) : (
          <>
            <div className="max-h-[400px] overflow-y-auto">
              <div className="p-4 space-y-3">
                {data.entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-surface"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {entry.categoryIcon && (
                          <span className="mr-1">{entry.categoryIcon}</span>
                        )}
                        {entry.itemName}
                      </div>
                      {entry.categoryName && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {entry.categoryName}
                        </div>
                      )}
                    </div>
                    <div className="text-right ml-4">
                      <div className="font-semibold text-sm">
                        {entry.convertedAmount
                          ? entry.convertedAmount.toFixed(2)
                          : parseFloat(entry.amount.toString()).toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {entry.currency}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer Summary */}
            <div className="p-4 border-t bg-surface2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  共 {data.totalCount} 笔
                </span>
                <span className="font-semibold">
                  合计 {data.totalAmount.toFixed(2)}
                </span>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
