import { describe, it, expect } from 'vitest';
import { freeView } from './opFreeView';

const monitors = [{ id: 0 }, { id: 3 }];
const layouts = { 0: 'vertical', 3: 'vertical' };
const settings = { 0: { config: true, ceDepth: true, peDepth: true, logs: true } };

describe('freeView', () => {
    it('Pro: passes everything through', () => {
        const v = freeView({ isPro: true, monitors, activeMonitorId: 3, layouts, settings });
        expect(v.monitors).toEqual(monitors);
        expect(v.activeId).toBe(3);
        expect(v.layoutFor(3)).toBe('vertical');
        expect(v.settingsFor(0).logs).toBe(true);
    });
    it('Free: first monitor only, original layout, logs off', () => {
        const v = freeView({ isPro: false, monitors, activeMonitorId: 3, layouts, settings });
        expect(v.monitors).toEqual([{ id: 0 }]);
        expect(v.activeId).toBe(0);
        expect(v.layoutFor(0)).toBe('original');
        expect(v.settingsFor(0)).toEqual({ config: true, ceDepth: true, peDepth: true, logs: false });
    });
    it('Free with no saved settings still hides logs', () => {
        const v = freeView({ isPro: false, monitors: [{ id: 0 }], activeMonitorId: 0, layouts: {}, settings: {} });
        expect(v.settingsFor(0)).toEqual({ config: true, ceDepth: true, peDepth: true, logs: false });
    });
    it('Free: activeId falls back to the visible monitor when the stored active id points at a hidden one (lapsed Pro)', () => {
        // e.g. a user downgrades from Pro (3 tabs) to Free while tab 2 was active.
        const manyMonitors = [{ id: 0 }, { id: 1 }, { id: 2 }];
        const manySettings = {
            0: { config: true, ceDepth: true, peDepth: true, logs: false },
            2: { config: true, ceDepth: true, peDepth: true, logs: true },
        };
        const v = freeView({ isPro: false, monitors: manyMonitors, activeMonitorId: 2, layouts: {}, settings: manySettings });
        expect(v.activeId).toBe(0);
        // Any write keyed to v.activeId must land on the visible monitor (0), never the hidden one (2).
        expect(v.settingsFor(v.activeId)).toEqual(manySettings[0]);
        expect(v.layoutFor(v.activeId)).toBe('original');
    });
});
