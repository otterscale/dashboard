<script lang="ts" module>
	/**
	 * Deploying a model template is an Enterprise Edition feature. The EE
	 * overlay replaces this file and exports `true`, which lets the model card
	 * offer Deploy only where it works.
	 */
	export const isAvailable = false;
</script>

<script lang="ts">
	import type { ServingKserveIoV1Alpha2LLMInferenceServiceConfig } from '@otterscale/types';
	import type { Schema } from '@sjsf/form';

	let {
		cluster,
		namespace,
		schema,
		object,
		onOpenChangeComplete,
		open = $bindable(false),
		hideTrigger = false
	}: {
		cluster: string;
		namespace: string;
		schema: Schema;
		object: ServingKserveIoV1Alpha2LLMInferenceServiceConfig;
		onOpenChangeComplete: (isOpen: boolean) => void;
		/** Bindable, so a parent (the model picker) can open the wizard itself. */
		open?: boolean;
		/** Omit the dropdown "Deploy" item when a parent drives `open`. */
		hideTrigger?: boolean;
	} = $props();

	// svelte-ignore state_referenced_locally
	void cluster;
	// svelte-ignore state_referenced_locally
	void namespace;
	// svelte-ignore state_referenced_locally
	void schema;
	// svelte-ignore state_referenced_locally
	void object;
	// svelte-ignore state_referenced_locally
	void onOpenChangeComplete;
	void open;
	// svelte-ignore state_referenced_locally
	void hideTrigger;
</script>
