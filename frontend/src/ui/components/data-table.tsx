'use client';

import * as React from 'react';
import { ArrowUp, ArrowDown, ChevronsUpDown, MoreHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button } from './button';
import { Checkbox } from './form';
import { Skeleton } from './primitives';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from './overlays';

/*
 * DATA TABLE.
 *
 * Two decisions worth stating, because they are the ones usually got wrong:
 *
 *   1. Row actions collapse into ONE menu, not a row of buttons. A table with
 *      four buttons per row is unscannable, and every one of those buttons is
 *      another tab stop between the user and the next row.
 *   2. On narrow viewports the table becomes a LIST OF CARDS rather than a
 *      horizontally scrolling grid. Desktop density squeezed onto a phone is
 *      unusable; each row becomes a stacked label/value card instead.
 *
 * Sorting is controlled by the caller so it can be driven server-side — the
 * API foundation already does allowlisted sorting, and re-sorting one page of
 * results client-side would silently lie about the ordering of the full set.
 */

export type SortDirection = 'asc' | 'desc';
export type SortState = { field: string; direction: SortDirection } | null;

export interface Column<T> {
  /** Stable key; also the sort field sent to the API. */
  key: string;
  header: string;
  /** Cell renderer. Keep it presentational. */
  cell: (row: T) => React.ReactNode;
  sortable?: boolean;
  /** Right-align numeric columns; they also get tabular figures. */
  numeric?: boolean;
  /** Hide below the md breakpoint in table mode. Always shown in card mode. */
  hideOnMobile?: boolean;
  width?: string;
}

export interface RowAction<T> {
  label: string;
  onSelect: (row: T) => void;
  destructive?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface DataTableLabels {
  selectAll: string;
  selectRow: string;
  actions: string;
  sortAscending: string;
  sortDescending: string;
  loading: string;
  previous: string;
  next: string;
  /** e.g. "{count} selected" — receives the count already interpolated. */
  selectedCount: (count: number) => string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  labels: DataTableLabels;
  caption: string;

  loading?: boolean;
  /** Rendered when there are no rows and no error. */
  empty?: React.ReactNode;
  /** Rendered instead of rows when loading failed. */
  error?: React.ReactNode;

  sort?: SortState;
  onSortChange?: (sort: SortState) => void;

  selectable?: boolean;
  selectedKeys?: string[];
  onSelectionChange?: (keys: string[]) => void;

  actions?: RowAction<T>[];
  onRowClick?: (row: T) => void;

  /** Cursor pagination, matching the API foundation. */
  hasMore?: boolean;
  hasPrevious?: boolean;
  onNext?: () => void;
  onPrevious?: () => void;

  className?: string;
}

export function DataTable<T>({
  columns, rows, rowKey, labels, caption,
  loading = false, empty, error,
  sort, onSortChange,
  selectable = false, selectedKeys = [], onSelectionChange,
  actions, onRowClick,
  hasMore, hasPrevious, onNext, onPrevious,
  className
}: DataTableProps<T>) {
  const selected = React.useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(rowKey(r)));
  const someSelected = rows.some((r) => selected.has(rowKey(r))) && !allSelected;

  /*
   * "Select all" means all rows ON THIS PAGE, and must leave selections made on
   * other pages alone.
   *
   * Replacing the whole selection with the current page — or clearing it
   * outright — silently discards what the user selected on page 1 the moment
   * they select all on page 2. The count banner reads across pages, so the
   * discrepancy is invisible until a bulk action runs against the wrong set,
   * which for a destructive action is the worst possible place to find out.
   */
  function toggleAll() {
    if (!onSelectionChange) return;
    const pageKeys = rows.map(rowKey);
    const next = new Set(selected);
    for (const key of pageKeys) {
      if (allSelected) next.delete(key); else next.add(key);
    }
    onSelectionChange([...next]);
  }

  function toggleRow(key: string) {
    if (!onSelectionChange) return;
    const next = new Set(selected);
    if (next.has(key)) next.delete(key); else next.add(key);
    onSelectionChange([...next]);
  }

  function nextSort(column: Column<T>): SortState {
    if (!sort || sort.field !== column.key) return { field: column.key, direction: 'asc' };
    if (sort.direction === 'asc') return { field: column.key, direction: 'desc' };
    return null;   // third click clears sorting rather than trapping the user
  }

  const showBody = !loading && !error && rows.length > 0;
  const showEmpty = !loading && !error && rows.length === 0;

  /*
   * A clickable row must also be operable from the keyboard (WCAG 2.2 SC 2.1.1).
   * An onClick on a <tr> alone is a mouse-only affordance: it works perfectly in
   * a demo and locks out every keyboard and switch user.
   *
   * The row is made focusable ONLY when onRowClick is supplied, because each
   * focusable row is another tab stop between the user and the next one — the
   * same cost this component avoids by collapsing row actions into one menu.
   * A product that does not use row activation pays nothing.
   *
   * `role` is deliberately NOT overridden. Making the element a button would
   * strip the row/column semantics a screen-reader user navigates the table
   * with, trading one barrier for a worse one.
   */
  function rowActivation(row: T) {
    if (!onRowClick) return {};
    return {
      tabIndex: 0,
      onClick: () => onRowClick(row),
      onKeyDown: (event: React.KeyboardEvent) => {
        // Only when the row ITSELF has focus: Enter inside a cell's own control
        // belongs to that control, not to the row.
        if (event.target !== event.currentTarget) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();   // Space would otherwise scroll the page
        onRowClick(row);
      }
    };
  }

  return (
    /* min-w-0 is load-bearing. As a flex item this container defaults to
     * min-width:auto, which refuses to shrink below the table's intrinsic
     * width — so the inner overflow-x-auto never gets the chance to scroll and
     * the whole PAGE overflows instead. */
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      {selectable && selected.size > 0 && (
        <div
          role="status"
          className={cn(
            'flex items-center gap-3 rounded-[var(--radius-md)] border border-border',
            'bg-[var(--primary-subtle)] px-3 py-2 text-body-sm text-[var(--primary-subtle-foreground)]'
          )}
        >
          {labels.selectedCount(selected.size)}
        </div>
      )}

      <div className="rounded-[var(--table-radius)] border border-[var(--table-border)] overflow-hidden">
        {/* ── Table mode (md and up) ───────────────────────────────────
         * overflow-x-auto is the last-resort escape valve. A table with enough
         * columns will eventually exceed any container, and when it does the
         * TABLE must scroll — never the page. A body-level horizontal scrollbar
         * makes the whole application feel broken and hides the primary nav. */}
        <div className="relative hidden md:block overflow-x-auto">
          <table className="w-full border-collapse text-body-sm">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr className="bg-[var(--table-header-bg)]">
                {selectable && (
                  <th scope="col" className="w-10 px-[var(--table-cell-padding-x)]">
                    <Checkbox
                      label={labels.selectAll}
                      className="[&_label]:sr-only"
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={toggleAll}
                    />
                  </th>
                )}
                {columns.map((column) => {
                  const active = sort?.field === column.key;
                  const SortIcon = !active ? ChevronsUpDown : sort!.direction === 'asc' ? ArrowUp : ArrowDown;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      style={column.width ? { width: column.width } : undefined}
                      // aria-sort is what a screen reader announces; the icon is visual only.
                      aria-sort={active ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                      className={cn(
                        'h-[var(--table-header-height)] px-[var(--table-cell-padding-x)]',
                        'text-[length:var(--text-table-header)] font-[var(--font-weight-semibold)]',
                        'text-[var(--table-header-fg)] text-left whitespace-nowrap',
                        column.numeric && 'text-right',
                        column.hideOnMobile && 'hidden lg:table-cell'
                      )}
                    >
                      {column.sortable && onSortChange ? (
                        <button
                          type="button"
                          onClick={() => onSortChange(nextSort(column))}
                          className={cn(
                            'inline-flex items-center gap-1.5 -mx-1 px-1 rounded-[var(--radius-xs)]',
                            'hover:text-foreground transition-colors duration-[var(--duration-fast)]',
                            'outline-none focus-visible:outline-[length:var(--focus-ring-width)]',
                            'focus-visible:outline-solid focus-visible:outline-ring',
                            column.numeric && 'flex-row-reverse'
                          )}
                        >
                          {column.header}
                          <SortIcon aria-hidden="true" className={cn('size-3.5', !active && 'opacity-50')} />
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  );
                })}
                {actions && actions.length > 0 && (
                  <th scope="col" className="w-12 px-[var(--table-cell-padding-x)]">
                    <span className="sr-only">{labels.actions}</span>
                  </th>
                )}
              </tr>
            </thead>

            <tbody aria-busy={loading || undefined}>
              {loading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={'sk' + i} className="border-t border-[var(--table-border)]">
                    {selectable && <td className="px-[var(--table-cell-padding-x)]"><Skeleton className="size-4" /></td>}
                    {columns.map((c) => (
                      <td key={c.key} className="h-[var(--table-row-height)] px-[var(--table-cell-padding-x)]">
                        <Skeleton className="h-3.5 w-[60%]" />
                      </td>
                    ))}
                    {actions && actions.length > 0 && <td />}
                  </tr>
                ))}

              {showBody &&
                rows.map((row) => {
                  const key = rowKey(row);
                  const isSelected = selected.has(key);
                  return (
                    <tr
                      key={key}
                      data-selected={isSelected || undefined}
                      {...rowActivation(row)}
                      className={cn(
                        'border-t border-[var(--table-border)]',
                        'transition-colors duration-[var(--duration-instant)]',
                        'hover:bg-[var(--table-row-hover-bg)]',
                        isSelected && 'bg-[var(--table-row-selected-bg)]',
                        onRowClick && [
                          'cursor-pointer',
                          'outline-none focus-visible:outline-[length:var(--focus-ring-width)]',
                          'focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-[-2px]'
                        ].join(' ')
                      )}
                    >
                      {selectable && (
                        <td className="px-[var(--table-cell-padding-x)]" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            label={labels.selectRow}
                            className="[&_label]:sr-only"
                            checked={isSelected}
                            onCheckedChange={() => toggleRow(key)}
                          />
                        </td>
                      )}
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={cn(
                            'h-[var(--table-row-height)]',
                            'px-[var(--table-cell-padding-x)] py-[var(--table-cell-padding-y)]',
                            column.numeric && 'text-right tabular',
                            column.hideOnMobile && 'hidden lg:table-cell'
                          )}
                        >
                          {column.cell(row)}
                        </td>
                      ))}
                      {actions && actions.length > 0 && (
                        <td className="px-[var(--table-cell-padding-x)]" onClick={(e) => e.stopPropagation()}>
                          <RowActionMenu row={row} actions={actions} label={labels.actions} />
                        </td>
                      )}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* ── Card mode (below md) ───────────────────────────────────── */}
        <div className="md:hidden divide-y divide-[var(--table-border)]">
          {loading &&
            Array.from({ length: 3 }).map((_, i) => (
              <div key={'mk' + i} className="flex flex-col gap-2 p-4">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3.5 w-3/5" />
              </div>
            ))}

          {showBody &&
            rows.map((row) => {
              const key = rowKey(row);
              return (
                <div
                  key={key}
                  {...rowActivation(row)}
                  className={cn(
                    'flex flex-col gap-2 p-4',
                    selected.has(key) && 'bg-[var(--table-row-selected-bg)]',
                    onRowClick && [
                      'cursor-pointer',
                      'outline-none focus-visible:outline-[length:var(--focus-ring-width)]',
                      'focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-[-2px]'
                    ].join(' ')
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {selectable && (
                        <span onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            label={labels.selectRow}
                            className="[&_label]:sr-only"
                            checked={selected.has(key)}
                            onCheckedChange={() => toggleRow(key)}
                          />
                        </span>
                      )}
                      {/* First column acts as the card title. */}
                      <div className="font-[var(--font-weight-medium)] truncate">
                        {columns[0] ? columns[0].cell(row) : null}
                      </div>
                    </div>
                    {actions && actions.length > 0 && (
                      <span onClick={(e) => e.stopPropagation()}>
                        <RowActionMenu row={row} actions={actions} label={labels.actions} />
                      </span>
                    )}
                  </div>
                  <dl className="flex flex-col gap-1">
                    {columns.slice(1).map((column) => (
                      <div key={column.key} className="flex items-baseline justify-between gap-4">
                        <dt className="text-caption text-muted-foreground shrink-0">{column.header}</dt>
                        <dd className={cn('text-body-sm text-right min-w-0', column.numeric && 'tabular')}>
                          {column.cell(row)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}
        </div>

        {error && <div className="p-8">{error}</div>}
        {showEmpty && <div className="p-8">{empty}</div>}
      </div>

      {(onPrevious || onNext) && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onPrevious} disabled={!hasPrevious}>
            <ChevronLeft aria-hidden="true" className="size-4" />
            {labels.previous}
          </Button>
          <Button variant="outline" size="sm" onClick={onNext} disabled={!hasMore}>
            {labels.next}
            <ChevronRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function RowActionMenu<T>({ row, actions, label }: { row: T; actions: RowAction<T>[]; label: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" label={label}>
          <MoreHorizontal aria-hidden="true" className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            destructive={action.destructive}
            onSelect={() => action.onSelect(row)}
          >
            {action.icon && <action.icon className="size-4" />}
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
