<script lang="ts">
	import { GpuAllocationDialog } from '$lib/components/gpu-allocation';

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

<GpuAllocationDialog {cluster} view="node" {object} {onOpenChangeComplete} />
