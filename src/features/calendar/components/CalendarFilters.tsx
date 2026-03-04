/**
 * Calendar Filters Component
 *
 * Currency and category filters for calendar view.
 */

'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { EntryCategory } from '@/types/api';
import type { CalendarFilters as CalendarFiltersType } from '../types';

interface CalendarFiltersProps {
  filters: CalendarFiltersType;
  onFiltersChange: (filters: CalendarFiltersType) => void;
  categories: EntryCategory[];
  preferredCurrencies: string[];
  className?: string;
}

export function CalendarFilters({
  filters,
  onFiltersChange,
  categories,
  preferredCurrencies,
  className,
}: CalendarFiltersProps) {
  const hasActiveFilters = filters.currency || filters.categoryId;

  const handleReset = () => {
    onFiltersChange({});
  };

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 p-3 rounded-lg border bg-surface',
        className
      )}
    >
      {/* Currency Filter */}
      {preferredCurrencies.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">货币</span>
          <Select
            value={filters.currency || '__all__'}
            onValueChange={(value) =>
              onFiltersChange({
                ...filters,
                currency: value === '__all__' ? undefined : value,
              })
            }
          >
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue placeholder="全部货币" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">全部货币</SelectItem>
              {preferredCurrencies.map((curr) => (
                <SelectItem key={curr} value={curr}>
                  {curr}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Category Filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">分类</span>
        <Select
          value={filters.categoryId || '__all__'}
          onValueChange={(value) =>
            onFiltersChange({
              ...filters,
              categoryId: value === '__all__' ? undefined : value,
            })
          }
        >
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="全部分类" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">全部分类</SelectItem>
            <SelectItem value="__uncategorized__">未分类</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Reset Button */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs ml-auto"
          onClick={handleReset}
        >
          <X className="h-3 w-3 mr-1" />
          重置
        </Button>
      )}
    </div>
  );
}
