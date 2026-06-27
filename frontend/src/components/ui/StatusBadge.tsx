type StatusStyle = { bg: string; text: string; dot?: string };

const STATUS_STYLES: Record<string, StatusStyle> = {
  // Dunning
  PENDING:       { bg: 'bg-amber-50',   text: 'text-amber-700',  dot: 'bg-amber-400' },
  RECOVERING:    { bg: 'bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-400' },
  RECOVERED:     { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  WRITTEN_OFF:   { bg: 'bg-red-50',     text: 'text-red-600' },
  // Webhooks
  RECEIVED:      { bg: 'bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-400' },
  PROCESSING:    { bg: 'bg-amber-50',   text: 'text-amber-700',  dot: 'bg-amber-400' },
  PROCESSED:     { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  FAILED:        { bg: 'bg-red-50',     text: 'text-red-600' },
  // Accounting
  SYNCED:        { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  // Disputes
  OPEN:          { bg: 'bg-orange-50',  text: 'text-orange-700', dot: 'bg-orange-400' },
  NEEDS_RESPONSE:{ bg: 'bg-red-50',     text: 'text-red-600',    dot: 'bg-red-400' },
  UNDER_REVIEW:  { bg: 'bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-400' },
  WON:           { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  LOST:          { bg: 'bg-red-50',     text: 'text-red-600' },
  WITHDRAWN:     { bg: 'bg-gray-100',   text: 'text-gray-600' },
  // Save Flow outcomes
  SAVED:         { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  CHURNED:       { bg: 'bg-red-50',     text: 'text-red-600' },
  ACCEPTED:      { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  DECLINED:      { bg: 'bg-red-50',     text: 'text-red-600' },
  IGNORED:       { bg: 'bg-gray-100',   text: 'text-gray-500' },
  // Offer types
  DISCOUNT:      { bg: 'bg-violet-50',  text: 'text-violet-700' },
  PAUSE:         { bg: 'bg-sky-50',     text: 'text-sky-700' },
  DOWNGRADE:     { bg: 'bg-orange-50',  text: 'text-orange-700' },
  // Connections
  connected:     { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400' },
  disconnected:  { bg: 'bg-gray-100',   text: 'text-gray-500' },
};

interface StatusBadgeProps {
  status: string;
  label?: string;
}

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? { bg: 'bg-gray-100', text: 'text-gray-600' };
  const displayText = label ?? status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
    >
      {style.dot && (
        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden />
      )}
      {displayText}
    </span>
  );
}
