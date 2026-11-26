import { MIB } from '$lib/components/dashboard/kit/format';

/**
 * Below this, a gap between DCGM and HAMi is rounding: DCGM reports whole MiB and an idle card
 * shows a few MiB used by the driver. Same tolerance as the overview's GPU governance check.
 */
export const OUTSIDE_TOLERANCE_BYTES = 256 * MIB;

/** DCGM's `modelName` without the vendor, which every card on the page shares. */
export function gpuModelName(model: string | undefined): string {
	return (model ?? '').replace(/^NVIDIA\s+/, '');
}

export type CardInput = {
	uuid: string;
	/** `nvidia0` */
	device: string;
	index: number;
	model: string;
	/** DCGM used + free + reserved, in bytes. */
	capacity: number;
	/** DCGM FB_USED, in bytes. */
	used: number;
};

/** One pod's share of one card, from HAMi. */
export type PodShare = { namespace: string; pod: string; uuid: string; bytes: number };

export type PodOnCard = {
	namespace: string;
	pod: string;
	/** HAMi scheduler allocation on this card. */
	allocated: number;
	/** HAMi-core's tracked use on this card; undefined when the container is not reporting. */
	tracked: number | undefined;
};

export type GpuCard = CardInput & {
	pods: PodOnCard[];
	allocated: number;
	tracked: number;
	/**
	 * Card use HAMi tracked to no pod: DCGM used − Σ tracked, zero under the tolerance. Undefined
	 * when a pod with an allocation on this card is not reporting, since its use and anything
	 * outside HAMi can't be told apart then.
	 */
	outside: number | undefined;
	/** When `outside` is undefined: the used memory that can't be attributed. */
	unattributed: number;
	/** Pods with an allocation here and no tracked use. */
	unreported: string[];
};

export type CardItem =
	| { kind: 'pod'; key: string; namespace: string; pod: string; value: number }
	| { kind: 'outside'; key: string; value: number }
	| { kind: 'unreported'; key: string; value: number }
	| { kind: 'free'; key: string; value: number };

export type GpuMeasure = 'usage' | 'allocated';

export function buildGpuCards(
	cards: CardInput[],
	allocations: PodShare[],
	tracked: PodShare[]
): GpuCard[] {
	return cards
		.slice()
		.sort((a, b) => a.index - b.index || a.device.localeCompare(b.device))
		.map((card) => {
			const pods = new Map<string, PodOnCard>();
			for (const a of allocations) {
				if (a.uuid !== card.uuid) continue;
				const key = `${a.namespace}/${a.pod}`;
				const row = pods.get(key) ?? {
					namespace: a.namespace,
					pod: a.pod,
					allocated: 0,
					tracked: undefined
				};
				row.allocated += a.bytes;
				pods.set(key, row);
			}
			for (const t of tracked) {
				if (t.uuid !== card.uuid) continue;
				const key = `${t.namespace}/${t.pod}`;
				const row = pods.get(key) ?? {
					namespace: t.namespace,
					pod: t.pod,
					allocated: 0,
					tracked: undefined
				};
				row.tracked = (row.tracked ?? 0) + t.bytes;
				pods.set(key, row);
			}
			const list = [...pods.values()].sort(
				(a, b) => b.allocated - a.allocated || a.pod.localeCompare(b.pod)
			);
			const allocated = list.reduce((s, p) => s + p.allocated, 0);
			const trackedSum = list.reduce((s, p) => s + (p.tracked ?? 0), 0);
			const unreported = list
				.filter((p) => p.allocated > 0 && p.tracked === undefined)
				.map((p) => p.pod);
			const gap = card.used - trackedSum;
			const clamp = (v: number) => (v > OUTSIDE_TOLERANCE_BYTES ? v : 0);
			return {
				...card,
				pods: list,
				allocated,
				tracked: trackedSum,
				outside: unreported.length > 0 ? undefined : clamp(gap),
				unattributed: unreported.length > 0 ? clamp(gap) : 0,
				unreported
			};
		});
}

/**
 * What one card's map draws, largest first, with the free or unallocated space last. The items
 * always add up to at least the capacity's worth of area or to what is drawn, whichever is more,
 * so a card never shows more free space than it has.
 */
export function cardItems(card: GpuCard, measure: GpuMeasure): CardItem[] {
	const items: CardItem[] = [];
	for (const p of card.pods) {
		const value = measure === 'allocated' ? p.allocated : (p.tracked ?? 0);
		if (value > 0) {
			items.push({
				kind: 'pod',
				key: `${p.namespace}/${p.pod}`,
				namespace: p.namespace,
				pod: p.pod,
				value
			});
		}
	}
	if (measure === 'usage') {
		if (card.outside !== undefined && card.outside > 0) {
			items.push({ kind: 'outside', key: 'outside', value: card.outside });
		}
		if (card.unattributed > 0)
			items.push({ kind: 'unreported', key: 'unreported', value: card.unattributed });
	}
	items.sort((a, b) => b.value - a.value);
	const drawn = items.reduce((s, i) => s + i.value, 0);
	// Usage frees what DCGM says is free; HAMi's tracked numbers count the driver's reserved
	// memory too, so the larger of the two keeps the free tile honest.
	const taken = measure === 'usage' ? Math.max(drawn, card.used) : drawn;
	const free = card.capacity - taken;
	if (free > OUTSIDE_TOLERANCE_BYTES / 4) items.push({ kind: 'free', key: 'free', value: free });
	return items;
}

/** How many cards each pod holds an allocation on, across the cluster. */
export function cardsPerPod(allocations: PodShare[]): Map<string, number> {
	const seen = new Map<string, Set<string>>();
	for (const a of allocations) {
		if (!(a.bytes > 0)) continue;
		const key = `${a.namespace}/${a.pod}`;
		const set = seen.get(key) ?? new Set<string>();
		set.add(a.uuid);
		seen.set(key, set);
	}
	return new Map([...seen].map(([k, v]) => [k, v.size]));
}

/** SPEC 3.3: one row of 1–4 cards, 4 columns beyond that. */
export function gpuGrid(count: number): { columns: number; height: number } {
	return count <= 4 ? { columns: Math.max(1, count), height: 316 } : { columns: 4, height: 150 };
}
