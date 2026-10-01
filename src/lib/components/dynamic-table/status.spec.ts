import { describe, expect, it } from 'vitest';

import { readStatus } from './status';

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
