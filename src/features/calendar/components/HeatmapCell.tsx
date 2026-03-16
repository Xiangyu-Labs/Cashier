/**
 * Heatmap Cell Component
 *
 * Individual cell for calendar heatmap showing daily spending.
 */

'use client';

import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import type { CalendarHeatmapStats } from '../types';
import {
  getHeatmapLevel,
  getHeatmapColor,
  shouldShowAmount,
  formatCellAmount,
} from '../lib/heatmap-colors';

interface HeatmapCellProps {
  date: string;
  amount: number;
  count: number;
  stats: CalendarHeatmapStats;
  isCurrentMonth?: boolean;
  isToday?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showWeekday?: boolean;
  onClick?: (date: string) => void;
  className?: string;
}

export function HeatmapCell({
  date,
  amount,
  count,
  stats,
  isCurrentMonth = true,
  isToday = false,
  size = 'md',
  showWeekday: _showWeekday = false,
  onClick,
  className,
}: HeatmapCellProps) {
  const t = useTranslations('Calendar');
  const level = getHeatmapLevel(amount, stats);
  const showAmount = shouldShowAmount(amount, size);

  // Extract day number from date
  const dayNumber = parseInt(date.split('-')[2], 10);

  // Size classes
  const sizeClasses = {
    sm: 'h-8 min-h-[2rem] text-[10px]',
    md: 'h-16 min-h-[4rem] text-xs',
    lg: 'h-24 min-h-[6rem] text-sm',
  };

  return (
    <button
      onClick={() => onClick?.(date)}
      className={cn(
        'relative flex flex-col items-center justify-center rounded-md border transition-all duration-200',
        'hover:scale-[1.02] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary',
        sizeClasses[size],
        !isCurrentMonth && 'opacity-40',
        isToday && 'ring-2 ring-primary ring-offset-1',
        onClick && 'cursor-pointer',
        className
      )}
      style={{
        backgroundColor: getHeatmapColor(level),
        borderColor: isToday ? 'hsl(var(--primary))' : 'hsl(var(--border))',
      }}
    >
      {/* Day number */}
      <span
        className={cn(
          'absolute top-1 left-2 font-normal text-[10px]',
          level >= 4 ? 'text-white/80' : 'text-muted-foreground'
        )}
      >
        {dayNumber}
      </span>

      {/* Amount (only show if enough space) */}
      {showAmount && amount > 0 && (
        <span
          className={cn(
            'mt-2 font-semibold text-[10px]',
            level >= 4 ? 'text-white' : 'text-foreground'
          )}
        >
          {formatCellAmount(amount)}
        </span>
      )}

      {/* Count indicator (small dot or number) */}
      {!showAmount && count > 0 && (
        <span
          className={cn(
            'mt-2 text-[10px]',
            level >= 4 ? 'text-white/80' : 'text-muted-foreground'
          )}
        >
          {t('count', { count })}
        </span>
      )}
    </button>
  );
}

/**
 * Compact heatmap cell for year view
 */
interface MiniHeatmapCellProps {
  date: string;
  amount: number;
  stats: CalendarHeatmapStats;
  isCurrentMonth?: boolean;
  onClick?: (date: string, e: React.MouseEvent) => void;
}

export function MiniHeatmapCell({
  date,
  amount,
  stats,
  isCurrentMonth = true,
  onClick,
}: MiniHeatmapCellProps) {
  const level = getHeatmapLevel(amount, stats);

  return (
    <button
      onClick={(e) => onClick?.(date, e)}
      className={cn(
        'h-3 w-3 rounded-sm transition-all duration-150',
        'hover:scale-125 hover:shadow-sm focus:outline-none focus:ring-1 focus:ring-primary',
        !isCurrentMonth && 'opacity-30',
        onClick && 'cursor-pointer'
      )}
      style={{
        backgroundColor: getHeatmapColor(level),
      }}
      title={`${date}: ${amount.toFixed(2)}`}
    />
  );
}
