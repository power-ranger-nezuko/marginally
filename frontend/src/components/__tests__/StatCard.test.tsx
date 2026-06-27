import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatCard from '../ui/StatCard';
import { DollarSignIcon } from '../ui/Icons';

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Total Recovered" value="$1,234.00" />);
    // CSS `uppercase` only changes visual rendering — DOM text still holds the prop value
    expect(screen.getByText('Total Recovered')).toBeDefined();
    expect(screen.getByText('$1,234.00')).toBeDefined();
  });

  it('shows emerald color class for positive trend', () => {
    const { container } = render(<StatCard label="Win Rate" value="67%" trend={5} />);
    const trendEl = container.querySelector('.text-emerald-600');
    expect(trendEl).not.toBeNull();
    expect(trendEl!.textContent).toContain('5');
    expect(trendEl!.textContent).toContain('vs last month');
  });

  it('shows red color class for negative trend', () => {
    const { container } = render(<StatCard label="Loss Rate" value="33%" trend={-3} />);
    const trendEl = container.querySelector('.text-red-500');
    expect(trendEl).not.toBeNull();
    expect(trendEl!.textContent).toContain('3');
    expect(trendEl!.textContent).toContain('vs last month');
  });

  it('does not render a trend element when trend is not provided', () => {
    const { container } = render(<StatCard label="Revenue" value="$500" />);
    expect(container.querySelector('.text-emerald-600')).toBeNull();
    expect(container.querySelector('.text-red-500')).toBeNull();
  });

  it('renders an SVG icon in the accent container when icon is provided', () => {
    const { container } = render(
      <StatCard label="Revenue" value="$500" icon={<DollarSignIcon className="h-5 w-5" />} />,
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('applies the accent class to the icon container', () => {
    const { container } = render(
      <StatCard
        label="Revenue"
        value="$500"
        icon={<DollarSignIcon className="h-5 w-5" />}
        accent="bg-emerald-50 text-emerald-600"
      />,
    );
    const iconContainer = container.querySelector('.bg-emerald-50');
    expect(iconContainer).not.toBeNull();
  });

  it('renders prefix and suffix within the value display', () => {
    const { container } = render(
      <StatCard label="Score" value={42} prefix="~" suffix="pts" />,
    );
    const valueEl = container.querySelector('p.text-2xl');
    expect(valueEl?.textContent).toContain('~');
    expect(valueEl?.textContent).toContain('42');
    expect(valueEl?.textContent).toContain('pts');
  });
});
