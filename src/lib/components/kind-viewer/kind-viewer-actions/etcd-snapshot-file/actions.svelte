<script lang="ts">
	// Placeholder — the enterprise edition overlays this file (ee/src).
	import type { Schema } from '@sjsf/form';

	let {
		schema,
		object,
		cluster,
		namespace,
		group,
		version,
		resource
	}: {
		schema: Schema;
		object: unknown;
		cluster: string;
		namespace?: string;
		group: string;
		version: string;
		resource: string;
	} = $props();

	// svelte-ignore state_referenced_locally
	void schema;
	// svelte-ignore state_referenced_locally
	void object;
	// svelte-ignore state_referenced_locally
	void cluster;
	// svelte-ignore state_referenced_locally
	void namespace;
	// svelte-ignore state_referenced_locally
	void group;
	// svelte-ignore state_referenced_locally
	void version;
	// svelte-ignore state_referenced_locally
	void resource;
</script>
