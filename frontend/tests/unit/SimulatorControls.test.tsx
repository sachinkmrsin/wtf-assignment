import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SimulatorControls } from '../../src/components/SimulatorControls';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => vi.restoreAllMocks());

function mockFetch(ok: boolean, body: object = {}) {
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok,
    json: () => Promise.resolve(body),
  });
}

describe('SimulatorControls', () => {
  it('renders with idle status', () => {
    render(<SimulatorControls />);
    expect(screen.getByTestId('simulator-controls')).toBeInTheDocument();
    expect(screen.getByText('idle')).toBeInTheDocument();
  });

  it('renders speed buttons 1×, 5×, 10×', () => {
    render(<SimulatorControls />);
    expect(screen.getByTestId('speed-1x')).toBeInTheDocument();
    expect(screen.getByTestId('speed-5x')).toBeInTheDocument();
    expect(screen.getByTestId('speed-10x')).toBeInTheDocument();
  });

  it('start button calls POST /api/simulator/start', async () => {
    mockFetch(true, { status: 'running', speed: 1 });
    render(<SimulatorControls />);
    fireEvent.click(screen.getByTestId('sim-start'));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/simulator/start'),
      expect.objectContaining({ method: 'POST' }),
    ));
  });

  it('shows running status after start', async () => {
    mockFetch(true, { status: 'running', speed: 1 });
    render(<SimulatorControls />);
    fireEvent.click(screen.getByTestId('sim-start'));
    await waitFor(() => expect(screen.getByText('running')).toBeInTheDocument());
  });

  it('stop button is disabled when not running', () => {
    render(<SimulatorControls />);
    expect(screen.getByTestId('sim-stop')).toBeDisabled();
  });

  it('shows error message on API failure', async () => {
    mockFetch(false, { error: 'Internal server error' });
    render(<SimulatorControls />);
    fireEvent.click(screen.getByTestId('sim-start'));
    await waitFor(() => expect(screen.getByText(/internal server error/i)).toBeInTheDocument());
  });

  it('reset calls POST /api/simulator/reset and sets idle', async () => {
    mockFetch(true, { status: 'reset' });
    render(<SimulatorControls />);
    fireEvent.click(screen.getByTestId('sim-reset'));
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/simulator/reset'),
        expect.objectContaining({ method: 'POST' }),
      );
      expect(screen.getByText('idle')).toBeInTheDocument();
    });
  });
});

