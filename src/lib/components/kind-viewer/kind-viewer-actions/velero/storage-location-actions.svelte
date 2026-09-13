<script lang="ts">
	// Placeholder — the enterprise edition overlays this file (ee/src).
	import type { Schema } from '@sjsf/form';
	import { type ValidateFunction } from 'ajv';

	import type { ResourceRuleVerbs } from '$lib/components/resources/types';

	let {
		schema,
		validate,
		object,
		cluster,
		namespace,
		group,
		version,
		kind,
		resource,
		resourceRuleVerbs
	}: {
		schema: Schema;
		validate: ValidateFunction;
		object: unknown;
		cluster: string;
		namespace: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		resourceRuleVerbs?: ResourceRuleVerbs;
	} = $props();

	// svelte-ignore state_referenced_locally
	void schema;
	// svelte-ignore state_referenced_locally
	void validate;
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
	void kind;
	// svelte-ignore state_referenced_locally
	void resource;
	// svelte-ignore state_referenced_locally
	void resourceRuleVerbs;
</script>
