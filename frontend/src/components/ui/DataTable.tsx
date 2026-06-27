import React from 'react';

export interface ColumnDef<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  keyExtractor: (row: T) => string;
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-3.5 w-full animate-pulse rounded-full bg-gray-100" />
        </td>
      ))}
    </tr>
  );
}

export default function DataTable<T>({
  columns,
  data,
  isLoading,
  emptyMessage = 'No data found.',
  keyExtractor,
}: DataTableProps<T>) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
      <table className="min-w-full divide-y divide-gray-100">
        <thead>
          <tr className="bg-gray-50/80">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400 ${col.className ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {isLoading ? (
            <>
              <SkeletonRow cols={columns.length} />
              <SkeletonRow cols={columns.length} />
              <SkeletonRow cols={columns.length} />
              <SkeletonRow cols={columns.length} />
            </>
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-sm text-gray-400"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={keyExtractor(row)}
                className="group transition-colors hover:bg-brand-50/30"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3.5 text-sm text-gray-700 ${col.className ?? ''}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
