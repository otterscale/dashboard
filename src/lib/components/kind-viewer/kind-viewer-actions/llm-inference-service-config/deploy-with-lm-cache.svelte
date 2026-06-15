<script lang="ts">
	import type { ServingKserveIoV1Alpha2LLMInferenceServiceConfig } from '@otterscale/types';

	let {
		cluster,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		object: ServingKserveIoV1Alpha2LLMInferenceServiceConfig;
		onOpenChangeComplete: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	void cluster;
	// svelte-ignore state_referenced_locally
	void object;
	// svelte-ignore state_referenced_locally
	void onOpenChangeComplete;
</script>
