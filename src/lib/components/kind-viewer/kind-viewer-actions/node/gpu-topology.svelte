<script lang="ts">
	import { GpuTopologyDialog } from '$lib/components/gpu-topology';

	let {
		cluster,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		object: any;
		onOpenChangeComplete?: () => void;
	} = $props();
</script>

<GpuTopologyDialog {cluster} view="node" {object} {onOpenChangeComplete} />
