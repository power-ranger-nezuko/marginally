import { useQuery } from '@tanstack/react-query';
import { tenantsApi } from '../../api/tenants';

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-gray-100 ${className}`} />;
}

export default function TopBar() {
  const { data: tenant, isLoading } = useQuery({
    queryKey: ['tenant'],
    queryFn: tenantsApi.getTenant,
  });

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div className="flex items-center gap-2">
        {isLoading ? (
          <Skeleton className="h-4 w-36" />
        ) : (
          <span className="text-sm font-semibold text-gray-800">{tenant?.name}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="h-4 w-4 text-gray-500"
            aria-hidden
          >
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
        </div>
      </div>
    </header>
  );
}
