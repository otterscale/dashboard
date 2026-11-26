<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';

	import { m } from '$lib/messages';

	import Capacity from './capacity.svelte';
	import Daemons from './daemons.svelte';
	import Health from './health.svelte';
	import { LAYOUT } from './layout';
	import Performance from './performance.svelte';
	import PlacementGroups from './placement-groups.svelte';
	import Pools from './pools.svelte';

	// Top to bottom, the order an operator asks in: is storage healthy and why not, will it fill
	// and when, are the daemons and placement groups whole, is it slow, then pool by pool.
	let {
		client,
		start,
		end,
		isReloading = $bindable()
	}: {
		client: PrometheusDriver;
		start: Date;
		end: Date;
		isReloading: boolean;
	} = $props();
</script>

<div class={LAYOUT.grid}>
	<Health {client} bind:isReloading />
	<Capacity {client} bind:isReloading />
	<Daemons {client} bind:isReloading />
	<PlacementGroups {client} bind:isReloading />
	<h2 class="{LAYOUT.full} mt-5 mb-1 text-base leading-6 font-[550]">{m.storage_performance()}</h2>
	<Performance {client} {start} {end} />
	<Pools {client} bind:isReloading />
</div>
