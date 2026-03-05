/**
 * Small Day Cell (12px) with tooltip
 * GitHub-style contribution cell
 */

'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { getHeatmapColor, formatCellAmount } from '../../lib/heatmap-colors';

interface DayCellSmallProps {
  date: string;
  amount: number;
  count: number;
  level: number;
  onClick?: () => void;
}

export function DayCellSmall({ date, amount, count, level, onClick }: DayCellSmallProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          'w-3 h-3 rounded-sm transition-all duration-150 flex-shrink-0',
          'hover:scale-125 hover:ring-1 hover:ring-primary/50 focus:outline-none focus:ring-1 focus:ring-primary'
        )}
        style={{
          backgroundColor: getHeatmapColor(level as 0 | 1 | 2 | 3 | 4 | 5),
        }}
      />

      {/* Tooltip */}
      {isHovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg border whitespace-nowrap z-50 pointer-events-none">
          <div className="font-medium">{date}</div>
          {amount > 0 ? (
            <>
              <div>支出: {formatCellAmount(amount)}</div>
              <div>笔数: {count}笔</div>
            </>
          ) : (
            <div className="text-muted-foreground">无消费</div>
          )}
        </div>
      )}
    </div>
  );
}
