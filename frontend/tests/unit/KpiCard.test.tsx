import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KpiCard } from '../../src/components/KpiCard';

// Stub rAF so useCountUp doesn't spin
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: (ts: number) => void) => { cb(0); return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => vi.restoreAllMocks());

describe('KpiCard', () => {
  it('renders label and formatted value', () => {
    render(<KpiCard label="Total Occupancy" value={42} />);
    expect(screen.getByText('Total Occupancy')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders skeleton when loading=true', () => {
    const { container } = render(<KpiCard label="Revenue" value={0} loading />);
    // Skeleton elements should be present (data-slot="skeleton")
    expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy();
  });

  it('does not show value when loading', () => {
    render(<KpiCard label="Revenue" value={9999} loading />);
    expect(screen.queryByText('9,999')).toBeNull();
  });

  it('renders error message when error is set', () => {
    render(<KpiCard label="Revenue" value={0} error="API 500" />);
    expect(screen.getByText('API 500')).toBeInTheDocument();
  });

  it('uses custom format function', () => {
    render(<KpiCard label="Revenue" value={1500} format={(v) => `₹${v}`} />);
    expect(screen.getByText('₹1500')).toBeInTheDocument();
  });

  it('renders suffix text', () => {
    render(<KpiCard label="Occupancy" value={50} suffix="/ 100" />);
    expect(screen.getByText('/ 100')).toBeInTheDocument();
  });

  it('exposes data-testid attribute', () => {
    render(<KpiCard label="X" value={1} data-testid="my-kpi" />);
    expect(document.querySelector('[data-testid="my-kpi"]')).toBeTruthy();
  });
});

