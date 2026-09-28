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
});
