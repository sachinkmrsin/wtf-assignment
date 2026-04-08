import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { ConnectionIndicator } from '../../src/components/ConnectionIndicator';
import { useGymStore } from '../../src/store/gymStore';

describe('ConnectionIndicator', () => {
  beforeEach(() => {
    useGymStore.setState({ wsConnected: false });
  });

  it('shows "Disconnected" and red state when wsConnected=false', () => {
    render(<ConnectionIndicator />);
    expect(screen.getByTestId('ws-indicator')).toBeInTheDocument();
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('shows "Live" when wsConnected=true', () => {
    useGymStore.setState({ wsConnected: true });
    render(<ConnectionIndicator />);
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('ping animation span is present when connected', () => {
    useGymStore.setState({ wsConnected: true });
    const { container } = render(<ConnectionIndicator />);
    const pingSpan = container.querySelector('.animate-ping');
    expect(pingSpan).toBeTruthy();
  });

  it('no ping animation when disconnected', () => {
    useGymStore.setState({ wsConnected: false });
    const { container } = render(<ConnectionIndicator />);
    expect(container.querySelector('.animate-ping')).toBeNull();
  });

  it('title attribute reflects connection state', () => {
    useGymStore.setState({ wsConnected: true });
    render(<ConnectionIndicator />);
    const el = screen.getByTestId('ws-indicator');
    expect(el.getAttribute('title')).toContain('connected');
  });
});

