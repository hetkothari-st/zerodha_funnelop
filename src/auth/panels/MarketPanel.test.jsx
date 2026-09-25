import { test, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import MarketPanel from './MarketPanel';
import { theme } from '../theme';

test('shows live readouts and ticks while motion is allowed', () => {
    vi.useFakeTimers();
    render(<MarketPanel />);
    expect(screen.getByText('LTP')).toBeInTheDocument();
    expect(screen.getByText(/P&L · 2 LOTS/)).toBeInTheDocument();
    expect(screen.getByText(/LIVE · NIFTY 24600 CE/)).toBeInTheDocument();
    const before = screen.getByTestId('op-ltp').textContent;
    act(() => { vi.advanceTimersByTime(7000); });
    expect(screen.getByTestId('op-ltp').textContent).not.toBe(before);
    vi.useRealTimers();
});

test('static under prefers-reduced-motion', () => {
    vi.useFakeTimers();
    const orig = window.matchMedia;
    window.matchMedia = (q) => ({ ...orig(q), matches: q.includes('prefers-reduced-motion') });
    render(<MarketPanel />);
    const before = screen.getByTestId('op-ltp').textContent;
    act(() => { vi.advanceTimersByTime(7000); });
    expect(screen.getByTestId('op-ltp').textContent).toBe(before);
    window.matchMedia = orig;
    vi.useRealTimers();
});

test('compact mode hides the readout row', () => {
    render(<MarketPanel compact />);
    expect(screen.queryByText('OI CHG')).not.toBeInTheDocument();
});

test('theme exposes every class key the screens use', () => {
    for (const k of ['page', 'panel', 'formSide', 'title', 'subtitle', 'label', 'input', 'primary', 'secondary', 'google', 'divider',
        'tabs', 'tabOn', 'tabOff', 'link', 'muted', 'error', 'info', 'card', 'modal', 'modalCard', 'adminPage']) {
        expect(typeof theme.classes[k], k).toBe('string');
    }
    expect(theme.productName).toBe('Funnel Op');
});
