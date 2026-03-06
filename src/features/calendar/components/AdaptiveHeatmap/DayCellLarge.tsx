/**
 * Large Day Cell (40px)
 */

'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { getHeatmapColor, formatCellAmount } from '../../lib/heatmap-colors';
import type { HeatmapLevel } from '../../types';

interface DayCellLargeProps {
  date: string;
  dayNumber: number;
  amount: number;
  level: HeatmapLevel;
  onClick?: () => void;
}

export function DayCellLarge({ date, dayNumber, amount, level, onClick }: DayCellLargeProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          'w-full aspect-square rounded-lg transition-all duration-150',
          'flex flex-col items-center justify-center gap-0.5',
          'hover:scale-[1.02] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary'
        )}
        style={{
          backgroundColor: getHeatmapColor(level),
          minHeight: '40px',
        }}
      >
        {/* Day number */}
        <span
          className={cn(
            'text-xs font-medium',
            level >= 4 ? 'text-white' : 'text-foreground'
          )}
        >
          {dayNumber}
        </span>

        {/* Amount */}
        {amount > 0 && (
          <span
            className={cn(
              'text-[10px] font-medium',
              level >= 4 ? 'text-white' : 'text-foreground'
            )}
          >
            {formatCellAmount(amount)}
          </span>
        )}
      </button>

      {/* Tooltip */}
      {isHovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg border whitespace-nowrap z-50 pointer-events-none">
          <div className="font-medium">{date}</div>
          {amount > 0 ? (
            <div>支出: {formatCellAmount(amount)}</div>
          ) : (
            <div className="text-muted-foreground">无消费</div>
          )}
        </div>
      )}
    </div>
  );
}
