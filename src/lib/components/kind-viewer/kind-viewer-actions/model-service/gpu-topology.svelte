<script lang="ts">
	import { GpuTopologyDialog } from '$lib/components/gpu-topology';

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

<GpuTopologyDialog {cluster} {namespace} view="model-service" {object} {onOpenChangeComplete} />
