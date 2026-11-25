import { describe, expect, it } from 'vitest';

import { fmtTokens, niceTop } from './format';
import { usageFromParams, usageToParams } from './params';
import { counterIncrease, makeBuckets, scopeMatchers, toFacts, toSeries } from './queries';
import {
	buildRows,
	DELETED_KEYS,
	type Directory,
	emptyTotals,
	failedIsHigh,
	filterFacts,
	resolveOwner,
	type SeriesFact,
	sortRows,
	summarize,
	type Totals,
	type UsageFact
} from './usage';

const WOODY = '9f5741bd-520a-4f93-b283-214f3b7b469a';
const CI_BOT = 'system:serviceaccount:team-ai:ci-bot';

function totals(t: Partial<Totals>): Totals {
	return { ...emptyTotals(), ...t };
}

function fact(tenant: string, model: string, t: Partial<Totals>, operation = 'chat'): UsageFact {
	return { tenant, model, operation, totals: totals(t) };
}

function dir(keys: Directory['keys'] = defaultKeys()): Directory {
	return {
		keys,
		workspaces: new Map([
			['db286l', 'admin'],
			['k2qsnr', 'team-ai']
		]),
		people: new Map([[WOODY, 'Woody Lin']])
	};
}

function defaultKeys() {
	return new Map([
		[
			'db286l.woody',
			{ namespace: 'db286l', name: 'woody', createdBy: WOODY, created: '2026-11-03T00:00:00Z' }
		],
		['db286l.woody-2', { namespace: 'db286l', name: 'woody-2', createdBy: WOODY }],
		['k2qsnr.rag-eval', { namespace: 'k2qsnr', name: 'rag-eval', createdBy: CI_BOT }],
		['k2qsnr.unused', { namespace: 'k2qsnr', name: 'unused', createdBy: WOODY }]
	]);
}

const FACTS: UsageFact[] = [
	fact('db286l.woody', 'qwen3-32b', {
		requests: 10,
		failed: 1,
		input: 1000,
		cached: 300,
		output: 200,
		reasoning: 50
	}),
	fact('db286l.woody-2', 'qwen3-32b', { requests: 5, input: 500, output: 100 }),
	fact('k2qsnr.rag-eval', 'qwen3-32b', { requests: 20, failed: 2, input: 4000, output: 400 }),
	fact('k2qsnr.rag-eval', 'bge-m3', { requests: 7, input: 70 }, 'embeddings'),
	// `test` was deleted after it was used.
	fact('db286l.test', 'qwen3-32b', { requests: 2, input: 108, output: 32, reasoning: 32 }),
	// An idle series: answered by Prometheus with zeros, never a row.
	fact('db286l.woody-2', 'llama', {})
];

describe('resolveOwner', () => {
	it('names people through the Workspace member list', () => {
		expect(resolveOwner(WOODY, dir().people)).toEqual({
			id: WOODY,
			name: 'Woody Lin',
			serviceAccount: false,
			named: true
		});
	});

	it('shortens a subject UUID nobody can name', () => {
		const owner = resolveOwner('90fbec61-588c-432b-8be9-5a1ee0c27909', new Map());
		expect(owner.name).toBe('90fbec61…');
		expect(owner.named).toBe(false);
	});

	it('marks service accounts and names them by their last segment', () => {
		expect(resolveOwner(CI_BOT, new Map())).toMatchObject({
			id: CI_BOT,
			name: 'ci-bot',
			serviceAccount: true
		});
	});

	it('keeps other usernames as they are', () => {
		expect(resolveOwner('alice@corp', new Map()).name).toBe('alice@corp');
	});
});

describe('buildRows: users', () => {
	const rows = sortRows(buildRows('user', FACTS, [], dir()), 'tokens');

	it('adds up every key a person created', () => {
		const woody = rows.find((r) => r.id === WOODY)!;
		expect(woody.label).toBe('Woody Lin');
		expect(woody.keys).toEqual(['db286l.woody', 'db286l.woody-2']);
		expect(woody.totals).toEqual(
			totals({ requests: 15, failed: 1, input: 1500, cached: 300, output: 300, reasoning: 50 })
		);
	});

	it('gives a service account its own row', () => {
		const bot = rows.find((r) => r.id === CI_BOT)!;
		expect(bot.owner?.serviceAccount).toBe(true);
		expect(bot.totals.requests).toBe(27);
	});

	it('collects usage of deleted keys in a pinned last row', () => {
		const last = rows[rows.length - 1];
		expect(last.id).toBe(DELETED_KEYS);
		expect(last.pinned).toBe(true);
		expect(last.keys).toEqual(['db286l.test']);
		// Pinned even when sorted by something it would win.
		const byReasoningHeavy = sortRows(
			buildRows('user', [...FACTS, fact('db286l.gone', 'x', { requests: 999 })], [], dir()),
			'requests'
		);
		expect(byReasoningHeavy[byReasoningHeavy.length - 1].id).toBe(DELETED_KEYS);
	});

	it('leaves out series with no usage', () => {
		expect(rows.flatMap((r) => r.keys)).not.toContain('k2qsnr.unused');
	});
});

describe('buildRows: keys', () => {
	const rows = buildRows('key', FACTS, [], dir());

	it('names a key by the part after the namespace and flags deleted ones', () => {
		const test = rows.find((r) => r.id === 'db286l.test')!;
		expect(test.label).toBe('test');
		expect(test.deleted).toBe(true);
		expect(test.owner).toBeUndefined();
		const woody = rows.find((r) => r.id === 'db286l.woody')!;
		expect(woody.deleted).toBeUndefined();
		expect(woody.owner?.name).toBe('Woody Lin');
		expect(woody.created).toBe('2026-11-03T00:00:00Z');
	});

	it('flags nothing as deleted when the keys could not be read', () => {
		const unknown = buildRows('key', FACTS, [], dir(null));
		expect(unknown.some((r) => r.deleted)).toBe(false);
	});
});

describe('buildRows: models', () => {
	const facts = [
		fact('db286l.woody', 'qwen3-32b', { requests: 1, input: 10 }),
		fact('k2qsnr.rag-eval', 'qwen3-32b', { requests: 3, input: 30 })
	];

	it('keeps one row per model and namespace, since short names repeat', () => {
		const rows = sortRows(buildRows('model', facts, [], dir()), 'tokens');
		expect(rows.map((r) => r.id)).toEqual(['k2qsnr/qwen3-32b', 'db286l/qwen3-32b']);
		expect(rows.map((r) => r.label)).toEqual(['qwen3-32b', 'qwen3-32b']);
		expect(rows.map((r) => r.namespaces)).toEqual([['k2qsnr'], ['db286l']]);
	});

	it('selects only the namespace it belongs to', () => {
		expect(filterFacts(facts, 'model', 'db286l/qwen3-32b', dir())).toHaveLength(1);
	});

	it('lists the operations a model served', () => {
		const rows = buildRows('model', FACTS, [], dir());
		expect(rows.find((r) => r.id === 'k2qsnr/bge-m3')!.operations).toEqual(['embeddings']);
	});
});

describe('buildRows: workspaces', () => {
	it('counts people and keys with usage, through the key creators', () => {
		const rows = buildRows('workspace', FACTS, [], dir());
		const admin = rows.find((r) => r.id === 'db286l')!;
		expect(admin.label).toBe('admin');
		expect(admin.users).toEqual([WOODY]);
		expect(admin.keys).toEqual(['db286l.test', 'db286l.woody', 'db286l.woody-2']);
	});
});

describe('trends', () => {
	it('sums each row’s series per bucket', () => {
		const series: SeriesFact[] = [
			{
				tenant: 'db286l.woody',
				model: 'qwen3-32b',
				input: [1, 2],
				output: [1, 0],
				requests: [1, 1],
				failed: [0, 1]
			},
			{
				tenant: 'db286l.woody-2',
				model: 'qwen3-32b',
				input: [5, 0],
				output: [0, 0],
				requests: [2, 0],
				failed: [0, 0]
			}
		];
		const woody = buildRows('user', FACTS, series, dir(), 2).find((r) => r.id === WOODY)!;
		expect(woody.trend).toEqual({ tokens: [7, 2], requests: [3, 1], failed: [0, 1] });
	});
});

describe('summarize', () => {
	it('counts keys, people, Workspaces and models with usage', () => {
		const s = summarize(FACTS, dir());
		expect(s.totals.requests).toBe(44);
		expect(s.keysUsed).toBe(4);
		// Four ApiKeys plus `test`, deleted after it was used.
		expect(s.keysTotal).toBe(5);
		expect(s.users).toBe(2);
		expect(s.workspaces).toBe(2);
		expect(s.models).toBe(3);
	});

	it('narrows the key count to one Workspace', () => {
		expect(summarize(FACTS, dir(), 'k2qsnr').keysTotal).toBe(2);
	});

	it('has no key count when the keys could not be read', () => {
		expect(summarize(FACTS, dir(null)).keysTotal).toBeNull();
	});
});

describe('failedIsHigh', () => {
	it('warns from 2 % of requests', () => {
		expect(failedIsHigh(totals({ requests: 100, failed: 2 }))).toBe(true);
		expect(failedIsHigh(totals({ requests: 100, failed: 1 }))).toBe(false);
		expect(failedIsHigh(totals({}))).toBe(false);
	});
});

describe('queries', () => {
	it('counts series that start inside the window from zero', () => {
		expect(counterIncrease('m', ['a="b"'], 86400)).toBe(
			'(increase(m{a="b"}[86400s]) and m{a="b"} offset 86400s) or (m{a="b"} unless m{a="b"} offset 86400s)'
		);
	});

	it('filters by namespace only at cluster scope', () => {
		expect(scopeMatchers('db286l', true)).toEqual(['namespace="db286l"']);
		expect(scopeMatchers('db286l', false)).toEqual([]);
		expect(scopeMatchers('', true)).toEqual([]);
	});

	it('folds the three answers into facts', () => {
		const labels = {
			tenant_id: 'db286l.test',
			gen_ai_request_model: 'qwen',
			gen_ai_operation_name: 'chat'
		};
		const facts = toFacts(
			[{ labels, value: 2 }],
			[],
			[
				{ labels: { ...labels, gen_ai_token_type: 'input' }, value: 108 },
				{ labels: { ...labels, gen_ai_token_type: 'output' }, value: 32 },
				{ labels: { ...labels, gen_ai_token_type: 'reasoning' }, value: 32 },
				{ labels: { ...labels, gen_ai_token_type: 'cache_creation_input' }, value: 9 }
			]
		);
		expect(facts).toEqual([
			fact('db286l.test', 'qwen', { requests: 2, input: 108, output: 32, reasoning: 32 })
		]);
	});

	it('cuts buckets on whole hours, with the hour so far last', () => {
		const H = 3600_000;
		const buckets = makeBuckets(0.5 * H, 3.25 * H, 3600, 0);
		expect(buckets).toEqual([
			{ start: 0, end: H },
			{ start: H, end: 2 * H },
			{ start: 2 * H, end: 3 * H },
			{ start: 3 * H, end: 3.25 * H }
		]);
		// Local midnights in UTC+8.
		const days = makeBuckets(0, 2 * 24 * H, 86_400, 8 * H);
		expect(days[0]).toEqual({ start: -8 * H, end: 16 * H });
	});

	it('puts each point in the bucket it ends', () => {
		const H = 3600_000;
		const buckets = makeBuckets(0, 2.5 * H, 3600, 0);
		const series = toSeries(
			buckets,
			[
				{
					labels: { tenant_id: 't.a', gen_ai_request_model: 'm' },
					values: [
						{ time: 2 * H, value: 4 },
						{ time: 2.5 * H, value: 1 }
					]
				}
			],
			[],
			[]
		);
		expect(series[0].requests).toEqual([0, 4, 1]);
	});
});

describe('URL params', () => {
	it('defaults to Users, Tokens and the last 24 hours', () => {
		const p = usageFromParams(new URLSearchParams('tab=usage'));
		expect(p).toEqual({
			view: 'user',
			sort: 'tokens',
			selected: undefined,
			namespace: '',
			range: { kind: 'relative', minutes: 1440 }
		});
		expect(usageToParams(p)).toEqual([]);
	});

	it('round-trips a selection', () => {
		const query = 'by=key&sort=failed&sel=db286l.woody-2&ws=db286l&range=10080';
		const p = usageFromParams(new URLSearchParams(query));
		expect(new URLSearchParams(usageToParams(p)).toString()).toBe(query);
	});

	it('ignores values it does not know', () => {
		const p = usageFromParams(new URLSearchParams('by=nope&sort=nope'));
		expect(p.view).toBe('user');
		expect(p.sort).toBe('tokens');
	});
});

describe('format', () => {
	it('writes tokens in three significant digits', () => {
		expect([53, 999, 60_000, 920_000, 1_870_000, 6_320_000].map(fmtTokens)).toEqual([
			'53',
			'999',
			'60.0 K',
			'920 K',
			'1.87 M',
			'6.32 M'
		]);
	});

	it('rounds the y axis top so its half is round too', () => {
		expect([0, 1, 6, 7, 201, 880_000].map(niceTop)).toEqual([0, 2, 6, 8, 240, 1_000_000]);
	});
});
