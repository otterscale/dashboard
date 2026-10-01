import { describe, expect, it } from 'vitest';

import { readStatus, worstStatus } from './status';

describe('readStatus', () => {
	it('reads ready counts', () => {
		expect(readStatus('3/3')).toEqual({ tone: 'healthy', ratio: { ready: 3, total: 3 } });
		expect(readStatus('1/3')).toEqual({ tone: 'degraded', ratio: { ready: 1, total: 3 } });
		expect(readStatus('0/3')).toEqual({ tone: 'failed', ratio: { ready: 0, total: 3 } });
		// Scaled to zero on purpose.
		expect(readStatus('0/0')).toEqual({ tone: 'stopped', ratio: { ready: 0, total: 0 } });
	});

	it('reads phase words across kinds', () => {
		expect(readStatus('Running').tone).toBe('healthy');
		expect(readStatus('Bound').tone).toBe('healthy');
		expect(readStatus('True').tone).toBe('healthy');
		expect(readStatus('Pending').tone).toBe('progressing');
		expect(readStatus('Init:0/1').tone).toBe('progressing');
		expect(readStatus('CrashLoopBackOff').tone).toBe('failed');
		expect(readStatus('Stopped').tone).toBe('stopped');
	});

	it('does not read NotReady as Ready', () => {
		expect(readStatus('NotReady').tone).toBe('failed');
		expect(readStatus('Not Ready').tone).toBe('failed');
	});

	it('falls back to unknown', () => {
		expect(readStatus(null).tone).toBe('unknown');
		expect(readStatus('').tone).toBe('unknown');
		expect(readStatus('Somewhere in between').tone).toBe('unknown');
	});
});

describe('worstStatus', () => {
	it('lets the most urgent reading speak for the row', () => {
		// A pod reported Running whose container is not ready needs attention.
		const ready = { id: 'Ready', tone: 'failed' as const };
		const status = { id: 'Status', tone: 'healthy' as const };
		expect(worstStatus([status, ready])).toBe(ready);
	});

	it('does not let an unrecognised word hide a known state', () => {
		const state = { id: 'State', tone: 'unknown' as const };
		const ready = { id: 'Ready', tone: 'healthy' as const };
		expect(worstStatus([state, ready])).toBe(ready);
		expect(worstStatus([state])).toBe(state);
	});

	it('keeps the preferred column on a tie', () => {
		const status = { id: 'Status', tone: 'healthy' as const };
		const ready = { id: 'Ready', tone: 'healthy' as const };
		expect(worstStatus([status, ready])).toBe(status);
	});

	it('returns nothing for a row without status', () => {
		expect(worstStatus([])).toBeUndefined();
	});
});
