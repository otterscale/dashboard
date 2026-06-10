<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';

	import { default as CPUCoreProcessor } from './area-chart-cpu-core.svelte';
	import { default as DiskIOTime } from './area-chart-disk-io-time.svelte';
	import { default as BasicDisk } from './area-chart-disk-rw.svelte';
	import { default as NetworkIO } from './area-chart-network.svelte';
	import { default as CPUCommitment } from './chart-node-cpu-commit.svelte';
	import { default as MemoryCommitment } from './chart-node-mem-commit.svelte';
	import { default as UsageRateCPU } from './usage-rate-chart-cpu.svelte';
	import { default as UsageRatePods } from './usage-rate-chart-pods.svelte';
	import { default as UsageRateRAM } from './usage-rate-chart-ram.svelte';
	import { default as UsageRateRootFS } from './usage-rate-chart-root-fs.svelte';

	// `fqdn` is the node_exporter `instance`; `nodeName` is the Kubernetes node name used by
	// the cAdvisor / kube-state-metrics commitment + pods cards.
	let {
		client,
		fqdn,
		nodeName,
		start,
		end,
		endIsNow,
		isReloading = $bindable()
	}: {
		client: PrometheusDriver;
		fqdn: string;
		nodeName: string | undefined;
		start: Date;
		end: Date;
		endIsNow: boolean;
		isReloading?: boolean;
	} = $props();
</script>

{#key `${fqdn}-${start.getTime()}-${endIsNow ? 'now' : end.getTime()}`}
	<div class="flex flex-col gap-4">
		<!-- KPI summary: OS utilisation (node_exporter) + pod capacity (kube-state-metrics) -->
		<div class="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<UsageRateCPU {client} {fqdn} {isReloading} />
			<UsageRateRAM {client} {fqdn} {isReloading} />
			<UsageRatePods {client} {nodeName} {isReloading} />
			<UsageRateRootFS {client} {fqdn} {isReloading} />
		</div>

		<!-- Scheduling commitment (cAdvisor + KSM): usage vs request vs limit of allocatable -->
		<div class="grid w-full gap-4 lg:grid-cols-2">
			<CPUCommitment {client} {nodeName} {start} {end} {endIsNow} {isReloading} />
			<MemoryCommitment {client} {nodeName} {start} {end} {endIsNow} {isReloading} />
		</div>

		<!-- OS-level detail (node_exporter) -->
		<div class="grid w-full gap-4 lg:grid-cols-2">
			<CPUCoreProcessor {client} {fqdn} {start} {end} {endIsNow} {isReloading} />
			<NetworkIO {client} {fqdn} {start} {end} {endIsNow} {isReloading} />
			<BasicDisk {client} {fqdn} {start} {end} {endIsNow} {isReloading} />
			<DiskIOTime {client} {fqdn} {start} {end} {endIsNow} {isReloading} />
		</div>
	</div>
{/key}
