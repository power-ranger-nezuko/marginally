import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBadge from '../ui/StatusBadge';

// Maps every status to the background class it should carry after the redesign.
// Palette shift: -100 → -50 variants, yellow → amber, green → emerald.
const STATUS_CASES: Array<{ status: string; expectedClass: string; label: string }> = [
  { status: 'PENDING',        expectedClass: 'bg-amber-50',   label: 'PENDING' },
  { status: 'RECOVERING',     expectedClass: 'bg-blue-50',    label: 'RECOVERING' },
  { status: 'RECOVERED',      expectedClass: 'bg-emerald-50', label: 'RECOVERED' },
  { status: 'WRITTEN_OFF',    expectedClass: 'bg-red-50',     label: 'WRITTEN OFF' },
  { status: 'PROCESSED',      expectedClass: 'bg-emerald-50', label: 'PROCESSED' },
  { status: 'FAILED',         expectedClass: 'bg-red-50',     label: 'FAILED' },
  { status: 'OPEN',           expectedClass: 'bg-orange-50',  label: 'OPEN' },
  { status: 'NEEDS_RESPONSE', expectedClass: 'bg-red-50',     label: 'NEEDS RESPONSE' },
  { status: 'UNDER_REVIEW',   expectedClass: 'bg-blue-50',    label: 'UNDER REVIEW' },
  { status: 'WON',            expectedClass: 'bg-emerald-50', label: 'WON' },
  { status: 'LOST',           expectedClass: 'bg-red-50',     label: 'LOST' },
  { status: 'WITHDRAWN',      expectedClass: 'bg-gray-100',   label: 'WITHDRAWN' },
  { status: 'connected',      expectedClass: 'bg-emerald-50', label: 'connected' },
  { status: 'disconnected',   expectedClass: 'bg-gray-100',   label: 'disconnected' },
  { status: 'DISCOUNT',       expectedClass: 'bg-violet-50',  label: 'DISCOUNT' },
  { status: 'PAUSE',          expectedClass: 'bg-sky-50',     label: 'PAUSE' },
  { status: 'DOWNGRADE',      expectedClass: 'bg-orange-50',  label: 'DOWNGRADE' },
  { status: 'UNKNOWN_STATUS', expectedClass: 'bg-gray-100',   label: 'UNKNOWN STATUS' },
];

describe('StatusBadge', () => {
  STATUS_CASES.forEach(({ status, expectedClass, label }) => {
    it(`renders correct color class for status "${status}"`, () => {
      render(<StatusBadge status={status} />);
      const badge = screen.getByText(label);
      expect(badge.className).toContain(expectedClass);
    });
  });

  it('renders a custom label when provided', () => {
    render(<StatusBadge status="PENDING" label="In Progress" />);
    expect(screen.getByText('In Progress')).toBeDefined();
  });

  it('renders a pulsing dot for active statuses (PENDING, RECOVERING, OPEN)', () => {
    const { container } = render(<StatusBadge status="PENDING" />);
    // Dot span should be present inside the badge
    const dot = container.querySelector('.bg-amber-400');
    expect(dot).not.toBeNull();
  });

  it('does NOT render a dot for terminal statuses (RECOVERED, FAILED)', () => {
    const { container } = render(<StatusBadge status="RECOVERED" />);
    // No dot element rendered for terminal states
    const dots = container.querySelectorAll('[class*="rounded-full"][class*="h-1.5"]');
    expect(dots.length).toBe(0);
  });
});
