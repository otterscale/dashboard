<script lang="ts">
	import { PrometheusDriver } from 'prometheus-query';

	import Latency from './latency.svelte';
	import Model from './model.svelte';
	import Request from './request.svelte';
	import Throughput from './throughtput.svelte';
	import TimeToFirstToken from './time-to-first-token.svelte';
	import VGPU from './vgpu.svelte';

	let {
		prometheusDriver,
		cluster,
		namespace,
		start,
		end,
		endIsNow,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		cluster: string;
		namespace: string;
		start: Date;
		end: Date;
		endIsNow: boolean;
		isReloading: boolean;
	} = $props();
</script>

<div class="grid auto-rows-auto grid-cols-2 gap-5 pt-4 md:grid-cols-4 lg:grid-cols-8">
	<div class="col-span-2 grid gap-5">
		<div class="col-span-2">
			<Model {prometheusDriver} {namespace} {cluster} {start} {end} {endIsNow} bind:isReloading />
		</div>
		<div class="col-span-2">
			<Latency {prometheusDriver} {cluster} {start} {end} {endIsNow} bind:isReloading />
		</div>
	</div>

	<div class="col-span-2 h-full">
		<VGPU {prometheusDriver} bind:isReloading />
	</div>

	<div class="col-span-4">
		<TimeToFirstToken {prometheusDriver} {cluster} {start} {end} {endIsNow} bind:isReloading />
	</div>
	<div class="col-span-4 row-start-2">
		<Throughput {prometheusDriver} {cluster} {start} {end} {endIsNow} bind:isReloading />
	</div>
	<div class="col-span-4 row-start-2">
		<Request {prometheusDriver} {cluster} {start} {end} {endIsNow} bind:isReloading />
	</div>
</div>
