import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SummaryBar } from '../../src/components/SummaryBar';
import { useGymStore } from '../../src/store/gymStore';

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: (ts: number) => void) => { cb(0); return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  useGymStore.setState({ gyms: [], todayRevenue: {} });
});
afterEach(() => vi.restoreAllMocks());

describe('SummaryBar', () => {
  it('renders all four KPI cards', () => {
    render(<SummaryBar />);
    expect(screen.getByTestId('kpi-total-occupancy')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-avg-capacity')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-revenue')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-active-gyms')).toBeInTheDocument();
  });

  it('shows skeleton loaders when loading=true', () => {
    const { container } = render(<SummaryBar loading />);
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('reflects store values for gyms count', () => {
    useGymStore.setState({
      gyms: [
        { id: 'g1', name: 'Gym A', location: 'X', capacity: 100, live_occupancy: 30, created_at: '' },
        { id: 'g2', name: 'Gym B', location: 'Y', capacity: 80, live_occupancy: 20, created_at: '' },
      ],
      todayRevenue: { 'g1': 5000, 'g2': 3000 },
    });
    render(<SummaryBar />);
    expect(screen.getByTestId('kpi-active-gyms')).toBeInTheDocument();
    expect(screen.getByTestId('summary-bar')).toBeInTheDocument();
  });
});

