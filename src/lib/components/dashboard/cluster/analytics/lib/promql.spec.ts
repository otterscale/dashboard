import { describe, expect, it } from 'vitest';

import { averaged, hamiWorkload, inNamespace, nodePodQueries, q } from './promql';

describe('hamiWorkload', () => {
	it('copies exported_namespace and exported_pod over the exporter’s own labels when set', () => {
		const expr = hamiWorkload('hami_vgpu_memory_allocated_bytes');
		expect(expr).toContain('"namespace", "$1", "exported_namespace", "(.+)"');
		expect(expr).toContain('"pod", "$1", "exported_pod", "(.+)"');
	});
});

describe('inNamespace', () => {
	it('filters a relabelled expression with a join, since a selector cannot follow label_replace', () => {
		expect(inNamespace('x', 'team-ai')).toBe(
			'(x) and on (namespace) label_replace(vector(1), "namespace", "team-ai", "", "")'
		);
	});
});

describe('averaged', () => {
	it('averages every number over the window except restarts, which are already a window total', () => {
		const out = averaged({ cpuUse: 'a', restarts: 'b' }, '3600s', 60);
		expect(out.cpuUse).toBe('avg_over_time((a)[3600s:60s])');
		expect(out.restarts).toBe('b');
	});
});

describe('nodePodQueries', () => {
	it('escapes the node name', () => {
		expect(q('a"b')).toBe('"a\\"b"');
		expect(nodePodQueries('gpu-01').pods).toContain('node="gpu-01"');
	});

	it('keys GPU capacity and use by device_uuid so DCGM lines up with HAMi', () => {
		const queries = nodePodQueries('gpu-01');
		expect(queries.gpuTotal).toContain('"device_uuid", "$1", "UUID"');
		expect(queries.gpuTotal).toContain('DCGM_FI_DEV_FB_RESERVED{hostname="gpu-01"}');
		expect(queries.gpuUsed).toContain('DCGM_FI_DEV_FB_USED{hostname="gpu-01"}');
	});
});
