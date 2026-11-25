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
		hideTrigger = false,
		isPublic = false,
		apiSchema = 'OpenAI',
		onBack
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
		/** Deploy the service callable without an API key. */
		isPublic?: boolean;
		/** Written to maas.phison.com/api-schema; picks the AIServiceBackend. */
		apiSchema?: string;
		/** Enables Previous on the first step, to return to the parent's form. */
		onBack?: () => void;
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
	// svelte-ignore state_referenced_locally
	void isPublic;
	// svelte-ignore state_referenced_locally
	void apiSchema;
	// svelte-ignore state_referenced_locally
	void onBack;
</script>
