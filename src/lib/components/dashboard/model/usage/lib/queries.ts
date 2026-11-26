import type { PrometheusDriver } from 'prometheus-query';

import { escapePromqlStringLiteral } from '$lib/prometheus';

import { emptyTotals, type SeriesFact, type Totals, type UsageFact } from './usage';

/*
 * AI Gateway metrics, from the Agent Router ext_proc (`:1064/metrics`). Both are OTel histograms
 * whose `namespace` label the PodMonitor rewrites to the tenant_id prefix, so a Workspace member's
 * namespace scope (prometheus-tenancy) sees its own keys.
 */
export const REQUESTS = 'gen_ai_server_request_duration_seconds_count';
export const TOKENS = 'gen_ai_client_token_usage_sum';
/** `cache_creation_input` is recorded too but not shown. */
export const TOKEN_TYPES = ['input', 'output', 'cached_input', 'reasoning'] as const;

/**
 * How much a counter grew over the `seconds` before each evaluation time.
 *
 * `increase()` alone misses a series that first appears inside the window: its first sample is
 * already the count so far, and there is no earlier one to subtract it from. On this gateway
 * every new key, model or token type starts that way, so those series count from zero instead.
 */
export function counterIncrease(metric: string, matchers: string[], seconds: number): string {
	const selector = `${metric}{${matchers.join(',')}}`;
	const w = `${Math.max(1, Math.round(seconds))}s`;
	return `(increase(${selector}[${w}]) and ${selector} offset ${w}) or (${selector} unless ${selector} offset ${w})`;
}

/** Matchers for one Workspace at cluster scope; none at namespace scope, which the server adds. */
export function scopeMatchers(namespace: string, clusterScope: boolean): string[] {
	return clusterScope && namespace ? [`namespace="${escapePromqlStringLiteral(namespace)}"`] : [];
}

const BY_FACT = 'tenant_id, gen_ai_request_model, gen_ai_operation_name';
const BY_SERIES = 'tenant_id, gen_ai_request_model';

export function usageQueries(matchers: string[], seconds: number) {
	const tokenTypes = `gen_ai_token_type=~"${TOKEN_TYPES.join('|')}"`;
	return {
		requests: `sum by (${BY_FACT}) (${counterIncrease(REQUESTS, matchers, seconds)})`,
		failed: `sum by (${BY_FACT}) (${counterIncrease(REQUESTS, [...matchers, 'error_type!=""'], seconds)})`,
		tokens: `sum by (${BY_FACT}, gen_ai_token_type) (${counterIncrease(TOKENS, [...matchers, tokenTypes], seconds)})`
	};
}

export function seriesQueries(matchers: string[], step: number) {
	const io = 'gen_ai_token_type=~"input|output"';
	return {
		requests: `sum by (${BY_SERIES}) (${counterIncrease(REQUESTS, matchers, step)})`,
		failed: `sum by (${BY_SERIES}) (${counterIncrease(REQUESTS, [...matchers, 'error_type!=""'], step)})`,
		tokens: `sum by (${BY_SERIES}, gen_ai_token_type) (${counterIncrease(TOKENS, [...matchers, io], step)})`
	};
}

/** Whether the gateway has reported anything in the retention window; cluster scope only. */
export const COLLECTED_PROBE = `count(last_over_time(${REQUESTS}[30d]))`;

export type Sample = { labels: Record<string, string>; value: number };
export type SampleSeries = {
	labels: Record<string, string>;
	values: { time: number; value: number }[];
};

const finite = (v: number) => (Number.isFinite(v) ? Math.max(0, v) : 0);

/** Three instant answers → one fact per key × model × operation. */
export function toFacts(requests: Sample[], failed: Sample[], tokens: Sample[]): UsageFact[] {
	const facts = new Map<string, UsageFact>();
	const at = (labels: Record<string, string>): Totals | undefined => {
		const tenant = labels.tenant_id;
		if (!tenant) return undefined;
		const model = labels.gen_ai_request_model ?? '';
		const operation = labels.gen_ai_operation_name ?? '';
		const id = `${tenant}\u0000${model}\u0000${operation}`;
		let fact = facts.get(id);
		if (!fact) {
			fact = { tenant, model, operation, totals: emptyTotals() };
			facts.set(id, fact);
		}
		return fact.totals;
	};
	for (const s of requests) {
		const t = at(s.labels);
		if (t) t.requests += finite(s.value);
	}
	for (const s of failed) {
		const t = at(s.labels);
		if (t) t.failed += finite(s.value);
	}
	for (const s of tokens) {
		const t = at(s.labels);
		if (!t) continue;
		const v = finite(s.value);
		switch (s.labels.gen_ai_token_type) {
			case 'input':
				t.input += v;
				break;
			case 'output':
				t.output += v;
				break;
			case 'cached_input':
				t.cached += v;
				break;
			case 'reasoning':
				t.reasoning += v;
				break;
		}
	}
	return [...facts.values()];
}

export type Bucket = { start: number; end: number };

/**
 * Time buckets on whole steps of local time (whole hours, local midnights), so the axis reads
 * 09:00 rather than 09:28. Each ends on a boundary, except the last, which ends at `end`: the
 * current hour so far. The first one may start a little before `start`.
 */
export function makeBuckets(
	start: number,
	end: number,
	stepSeconds: number,
	tzOffsetMs = -new Date(end).getTimezoneOffset() * 60_000
): Bucket[] {
	const step = stepSeconds * 1000;
	const floor = (t: number) => Math.floor((t + tzOffsetMs) / step) * step - tzOffsetMs;
	const out: Bucket[] = [];
	for (let b = floor(start) + step; b <= end; b += step) out.push({ start: b - step, end: b });
	const last = out.length > 0 ? out[out.length - 1].end : floor(end);
	if (end > last) out.push({ start: last, end });
	return out;
}

/** Three answers → per key × model arrays, one value per bucket; points land on bucket ends. */
export function toSeries(
	buckets: Bucket[],
	requests: SampleSeries[],
	failed: SampleSeries[],
	tokens: SampleSeries[]
): SeriesFact[] {
	const out = new Map<string, SeriesFact>();
	const n = buckets.length;
	const index = new Map(buckets.map((b, i) => [Math.round(b.end / 1000), i]));
	const at = (labels: Record<string, string>): SeriesFact | undefined => {
		const tenant = labels.tenant_id;
		if (!tenant) return undefined;
		const model = labels.gen_ai_request_model ?? '';
		const id = `${tenant}\u0000${model}`;
		let s = out.get(id);
		if (!s) {
			const z = () => Array.from({ length: n }, () => 0);
			s = { tenant, model, input: z(), output: z(), requests: z(), failed: z() };
			out.set(id, s);
		}
		return s;
	};
	const fill = (target: number[], values: SampleSeries['values']) => {
		for (const p of values) {
			const i = index.get(Math.round(p.time / 1000));
			if (i !== undefined) target[i] += finite(p.value);
		}
	};
	for (const r of requests) {
		const s = at(r.labels);
		if (s) fill(s.requests, r.values);
	}
	for (const r of failed) {
		const s = at(r.labels);
		if (s) fill(s.failed, r.values);
	}
	for (const r of tokens) {
		const s = at(r.labels);
		if (!s) continue;
		if (r.labels.gen_ai_token_type === 'input') fill(s.input, r.values);
		else if (r.labels.gen_ai_token_type === 'output') fill(s.output, r.values);
	}
	return [...out.values()];
}

type InstantRow = { metric: { labels: Record<string, string> }; value: { value: number } };
type RangeRow = {
	metric: { labels: Record<string, string> };
	values: { time: Date; value: number }[];
};

async function instant(client: PrometheusDriver, query: string, time: Date): Promise<Sample[]> {
	const response = await client.instantQuery(query, time);
	return (response.result as InstantRow[]).map((r) => ({
		labels: r.metric.labels,
		value: Number(r.value.value)
	}));
}

async function range(
	client: PrometheusDriver,
	query: string,
	start: Date,
	end: Date,
	step: number
): Promise<SampleSeries[]> {
	const response = await client.rangeQuery(query, start, end, step);
	return (response.result as RangeRow[]).map((r) => ({
		labels: r.metric.labels,
		values: r.values.map((p) => ({ time: new Date(p.time).getTime(), value: Number(p.value) }))
	}));
}

/** Totals for the window that ends at `end`. */
export async function fetchFacts(
	client: PrometheusDriver,
	matchers: string[],
	start: number,
	end: number
): Promise<UsageFact[]> {
	const q = usageQueries(matchers, (end - start) / 1000);
	const time = new Date(end);
	const [requests, failed, tokens] = await Promise.all([
		instant(client, q.requests, time),
		instant(client, q.failed, time),
		instant(client, q.tokens, time)
	]);
	return toFacts(requests, failed, tokens);
}

/** Per-bucket values: one range query for the whole steps, one instant query for the last part. */
export async function fetchSeries(
	client: PrometheusDriver,
	matchers: string[],
	buckets: Bucket[],
	step: number
): Promise<SeriesFact[]> {
	if (buckets.length === 0) return [];
	const whole = buckets.filter((b) => b.end - b.start === step * 1000);
	const partial = buckets.find((b) => b.end - b.start !== step * 1000);

	const wholeQueries = async (): Promise<SampleSeries[][]> => {
		if (whole.length === 0) return [[], [], []];
		const q = seriesQueries(matchers, step);
		const s = new Date(whole[0].end);
		const e = new Date(whole[whole.length - 1].end);
		return Promise.all([
			range(client, q.requests, s, e, step),
			range(client, q.failed, s, e, step),
			range(client, q.tokens, s, e, step)
		]);
	};
	const partialQueries = async (): Promise<SampleSeries[][]> => {
		if (!partial) return [[], [], []];
		const q = seriesQueries(matchers, (partial.end - partial.start) / 1000);
		const time = new Date(partial.end);
		const asSeries = (samples: Sample[]) =>
			samples.map((x) => ({ labels: x.labels, values: [{ time: partial.end, value: x.value }] }));
		const answers = await Promise.all([
			instant(client, q.requests, time),
			instant(client, q.failed, time),
			instant(client, q.tokens, time)
		]);
		return answers.map(asSeries);
	};

	const [[r1, f1, t1], [r2, f2, t2]] = await Promise.all([wholeQueries(), partialQueries()]);
	return toSeries(buckets, [...r1, ...r2], [...f1, ...f2], [...t1, ...t2]);
}

export async function fetchCollected(client: PrometheusDriver): Promise<boolean> {
	const response = await client.instantQuery(COLLECTED_PROBE);
	return response.result.length > 0;
}

/** Bucket length for a window: 5 minutes up to 3 hours, hours up to 48 hours, then days. */
export function bucketSeconds(windowMs: number): number {
	const hours = windowMs / 3_600_000;
	if (hours <= 3) return 300;
	if (hours <= 48) return 3600;
	return 86_400;
}
