<script lang="ts">
	// Placeholder — the enterprise edition overlays this file (ee/src).
	import type { Schema } from '@sjsf/form';
	import { type ValidateFunction } from 'ajv';

	let {
		cluster,
		group,
		version,
		kind,
		resource,
		schema,
		validate
	}: {
		cluster: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema: Schema;
		validate?: ValidateFunction;
	} = $props();

	// svelte-ignore state_referenced_locally
	void cluster;
	// svelte-ignore state_referenced_locally
	void group;
	// svelte-ignore state_referenced_locally
	void version;
	// svelte-ignore state_referenced_locally
	void kind;
	// svelte-ignore state_referenced_locally
	void resource;
	// svelte-ignore state_referenced_locally
	void schema;
	// svelte-ignore state_referenced_locally
	void validate;
</script>
