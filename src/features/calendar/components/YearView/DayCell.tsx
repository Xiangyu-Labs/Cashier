/**
 * Year View Day Cell
 * GitHub-style contribution cell for year heatmap
 */

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { getHeatmapColor } from '../../lib/heatmap-colors';
import type { HeatmapLevel } from '../../types';
import { formatAmount } from '../../lib/date-utils';

interface DayCellProps {
  date: string;
  level: HeatmapLevel;
  amount: number;
  count: number;
  isInYear: boolean;
  onClick?: () => void;
}

export function DayCell({ date, level, amount, count, isInYear, onClick }: DayCellProps) {
  const [isHovered, setIsHovered] = useState(false);
  const t = useTranslations('Calendar');

  const tooltipText = amount > 0
    ? `${date}\n${t('expense')}: ${formatAmount(amount)}\n${t('count', { count })}`
    : `${date}\n${t('noConsumption')}`;

  return (
    <div className="relative">
      <button
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          'w-3 h-3 rounded-sm transition-all duration-150 flex-shrink-0',
          'hover:scale-125 hover:ring-1 hover:ring-primary/50 focus:outline-none focus:ring-1 focus:ring-primary',
          !isInYear && 'opacity-30'
        )}
        style={{
          backgroundColor: level === 0
            ? 'var(--muted)'
            : getHeatmapColor(level),
        }}
        title={tooltipText}
      />
      {isHovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg border whitespace-nowrap z-50 pointer-events-none">
          <div className="font-medium">{date}</div>
          {amount > 0 ? (
            <>
              <div>{t('expense')}: {formatAmount(amount)}</div>
              <div>{t('count', { count })}</div>
            </>
          ) : (
            <div className="text-muted-foreground">{t('noConsumption')}</div>
          )}
        </div>
      )}
    </div>
  );
}
