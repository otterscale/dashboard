import { parseHamiAllocation } from '$lib/components/dashboard/model/analytics/lib/pods';

const MIB = 1024 ** 2;

type PodLike = {
	metadata?: { annotations?: Record<string, string> };
	status?: { phase?: string };
};

export type GpuMemory = {
	/** Bytes the HAMi scheduler booked for the live pods. */
	allocated: number;
	/** Cards those bookings are on. */
	cards: number;
	/** Bytes in use on the cards this namespace has to itself; `null` when it has none. */
	used: number | null;
	/** Cards shared with other workloads, whose usage cannot be told apart. */
	sharedCards: number;
};

/**
 * A namespace's GPU memory, without PromQL over HAMi's series (those can name other tenants'
 * pods; a Workspace page takes GPU numbers from the shared scope). The allocation is what the
 * scheduler wrote on each pod (`hami.io/vgpu-devices-allocated`); the usage is per card, so it
 * counts only on a card no other workload uses, as the Model pages do.
 *
 * @param usedByCard bytes in use per card, the shared scope's `vgpu-memory-used`
 * @param tenantsByCard workloads per card, the shared scope's `gpu-shared-count`
 */
export function gpuMemory(
	pods: PodLike[],
	usedByCard: Map<string, number>,
	tenantsByCard: Map<string, number>
): GpuMemory {
	let allocated = 0;
	const cards = new Set<string>();
	for (const pod of pods) {
		// Pods that still hold their booking, the set a quota counts.
		if (pod.status?.phase !== 'Pending' && pod.status?.phase !== 'Running') continue;
		for (const device of parseHamiAllocation(
			pod.metadata?.annotations?.['hami.io/vgpu-devices-allocated']
		)) {
			allocated += device.mib * MIB;
			cards.add(device.uuid);
		}
	}
	let used: number | null = null;
	let sharedCards = 0;
	for (const card of cards) {
		if ((tenantsByCard.get(card) ?? 1) > 1) {
			sharedCards++;
			continue;
		}
		const bytes = usedByCard.get(card);
		if (bytes !== undefined) used = (used ?? 0) + bytes;
	}
	return { allocated, cards: cards.size, used, sharedCards };
}
