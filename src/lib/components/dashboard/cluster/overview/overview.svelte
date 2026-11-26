<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';

	import ControlPlane from './control-plane.svelte';
	import CpuUsage from './cpu.svelte';
	import Gpu from './gpu.svelte';
	import { LAYOUT } from './layout';
	import MemoryUsage from './memory.svelte';
	import NeedsAttention from './needs-attention.svelte';
	import NodePressure from './node-pressure.svelte';
	import PlatformChecks from './platform-checks.svelte';
	import PlatformServices from './platform-services.svelte';
	import type { ClusterSignals } from './signals.svelte';
	import StateCard from './state-card.svelte';
	import Storage from './storage.svelte';

	// Top to bottom, the order an operator asks in: is it healthy and what needs a look, how much
	// room is left, are the control plane and the platform's own services up, then node by node.
	let {
		prometheusDriver,
		signals,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		signals: ClusterSignals;
		isReloading: boolean;
	} = $props();

	// While a node is not Ready, capacity counts what the Ready nodes can still offer.
	const readyOnly = $derived(signals.status === 'ready' && !signals.allReady);
</script>

<div class={LAYOUT.grid}>
	<div class={LAYOUT.state}><StateCard {signals} /></div>
	<div class={LAYOUT.attention}><NeedsAttention {signals} /></div>
	<div class={LAYOUT.capacity}><CpuUsage {prometheusDriver} {readyOnly} bind:isReloading /></div>
	<div class={LAYOUT.capacity}><MemoryUsage {prometheusDriver} {readyOnly} bind:isReloading /></div>
	<div class={LAYOUT.capacity}><Gpu {prometheusDriver} {readyOnly} bind:isReloading /></div>
	<div class={LAYOUT.capacity}><Storage {prometheusDriver} bind:isReloading /></div>
	<div class={LAYOUT.controlPlane}>
		<ControlPlane {prometheusDriver} {signals} bind:isReloading />
	</div>
	<div class={LAYOUT.services}>
		<PlatformServices {prometheusDriver} {signals} bind:isReloading />
	</div>
	<!-- Draws its own full-width cell, and none at all for users who cannot read the checks. -->
	<PlatformChecks {prometheusDriver} bind:isReloading />
	<div class={LAYOUT.full}><NodePressure {prometheusDriver} {signals} bind:isReloading /></div>
</div>
