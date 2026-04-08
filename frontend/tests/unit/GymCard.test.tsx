import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GymCard } from '../../src/components/GymCard';
import type { Gym } from '../../src/types/models';

const mockGym: Gym = {
  id: 'gym-1',
  name: 'Iron Peak',
  location: 'Downtown',
  capacity: 100,
  live_occupancy: 23,
  created_at: new Date().toISOString(),
};

describe('GymCard', () => {
  it('renders gym name and location', () => {
    render(<GymCard gym={mockGym} />);
    expect(screen.getByText('Iron Peak')).toBeInTheDocument();
    expect(screen.getByText('Downtown')).toBeInTheDocument();
  });

  it('displays live occupancy and capacity', () => {
    render(<GymCard gym={mockGym} />);
    expect(screen.getByText('23')).toBeInTheDocument();
    expect(screen.getByText('/ 100')).toBeInTheDocument();
  });

  it('shows correct occupancy percentage badge', () => {
    render(<GymCard gym={mockGym} />);
    expect(screen.getByText('23%')).toBeInTheDocument();
  });

  it('shows destructive badge when occupancy ≥ 90%', () => {
    const fullGym = { ...mockGym, live_occupancy: 95 };
    render(<GymCard gym={fullGym} />);
    expect(screen.getByText('95%')).toBeInTheDocument();
  });

  it('calls onClick when card is clicked', async () => {
    const onClick = vi.fn();
    const { getByTestId } = render(<GymCard gym={mockGym} onClick={onClick} />);
    getByTestId('gym-card').click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies ring class when selected', () => {
    const { getByTestId } = render(<GymCard gym={mockGym} selected />);
    expect(getByTestId('gym-card').className).toContain('ring-2');
  });
});

