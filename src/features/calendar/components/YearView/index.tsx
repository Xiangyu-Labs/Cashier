/**
 * Year View Component
 *
 * GitHub-style contributions heatmap showing full year of spending data.
 * 53 weeks x 7 days continuous grid layout.
 */

'use client';

import { cn } from '@/lib/utils';
import {
  getHeatmapColor,
  getHeatmapLabel,
} from '../../lib/heatmap-colors';
import { formatAmount } from '../../lib/date-utils';
import { useYearData } from './useYearData';
import { DayCell } from './DayCell';
import type { CalendarHeatmapData, HeatmapLevel } from '../../types';

interface YearViewProps {
  anchorDate: string;
  data: CalendarHeatmapData;
  onDayClick: (date: string) => void;
  onMonthClick: (month: number) => void;
  className?: string;
}

export function YearView({ anchorDate, data, onDayClick, className }: YearViewProps) {
  const year = parseInt(anchorDate.split('-')[0], 10);
  const { weeks, monthLabels, stats } = useYearData(year, data);

  // Weekday labels (Monday to Sunday)
  const weekdayLabels = ['一', '二', '三', '四', '五', '六', '日'];

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Month labels - with relative positioning container */}
      <div className="relative h-5 mb-1 ml-7">
        {monthLabels.map(({ month, weekIndex, label }) => {
          const leftOffset = weekIndex * 14; // 12px cell + 2px gap
          return (
            <div
              key={month}
              className="absolute text-xs text-muted-foreground whitespace-nowrap"
              style={{
                left: `${leftOffset}px`,
              }}
            >
              {label}
            </div>
          );
        })}
      </div>

      <div className="flex">
        {/* Weekday labels */}
        <div className="flex flex-col mr-2 gap-[3px] pt-[1px]">
          {weekdayLabels.map((day, index) => (
            <div
              key={day}
              className={cn(
                'text-[11px] text-muted-foreground w-5 flex items-center justify-center',
                index % 2 === 1 && 'invisible' // Show every other label to save space
              )}
              style={{ height: '12px' }}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Heatmap grid */}
        <div className="flex gap-[2px] overflow-x-auto pb-2 min-h-[100px]">
          {weeks.map((week) => (
            <div key={week.weekIndex} className="flex flex-col gap-[2px] flex-shrink-0">
              {week.days.map((day) => (
                <DayCell
                  key={day.date}
                  date={day.date}
                  level={day.level}
                  amount={day.amount}
                  count={day.count}
                  isInYear={day.isInYear}
                  onClick={() => onDayClick(day.date)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend and stats */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mt-4 gap-4">
        {/* Legend */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Less</span>
          <div className="flex gap-[2px]">
            {([0, 1, 2, 3, 4, 5] as HeatmapLevel[]).map((level) => (
              <div
                key={level}
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{
                  backgroundColor: level === 0
                    ? 'var(--muted)'
                    : getHeatmapColor(level)
                }}
                title={getHeatmapLabel(level)}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">More</span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <span>总支出:</span>
            <span className="font-medium text-foreground">
              {formatAmount(stats.totalAmount)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span>总笔数:</span>
            <span className="font-medium text-foreground">{stats.totalCount}笔</span>
          </div>
          <div className="flex items-center gap-1">
            <span>日均:</span>
            <span className="font-medium text-foreground">
              {formatAmount(stats.avgDaily)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export { DayCell } from './DayCell';
export { useYearData } from './useYearData';
