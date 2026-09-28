const DEFAULT_SETTINGS = { config: true, ceDepth: true, peDepth: true, logs: true };

// What the Op dashboard may show for the current plan. Saved state is left untouched.
export function freeView({ isPro, monitors, activeMonitorId, layouts, settings }) {
    const shown = isPro ? monitors : monitors.slice(0, 1);
    const activeId = shown.some((m) => m.id === activeMonitorId) ? activeMonitorId : shown[0]?.id;
    return {
        monitors: shown,
        activeId,
        layoutFor: (id) => (isPro ? layouts[id] || 'original' : 'original'),
        settingsFor: (id) => {
            const s = settings[id] || DEFAULT_SETTINGS;
            return isPro ? s : { ...s, logs: false };
        },
    };
}
