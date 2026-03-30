<script lang="ts">
	import { GpuAllocationDialog } from '$lib/components/gpu-allocation';

	let {
		cluster,
		namespace,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		namespace: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		object: any;
		onOpenChangeComplete?: () => void;
	} = $props();
</script>

<GpuAllocationDialog {cluster} {namespace} view="model-service" {object} {onOpenChangeComplete} />
