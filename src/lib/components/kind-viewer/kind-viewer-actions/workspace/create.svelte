<script lang="ts" module>
	export interface Member {
		subject: string;
		role: string;
		name: string;
		username: string;
		isServiceAccount: boolean;
	}
</script>

<script lang="ts">
	import type { Schema } from '@sjsf/form';
	import type { Snippet } from 'svelte';

	let {
		cluster,
		group,
		version,
		kind,
		resource,
		schema,
		role,
		onSuccess,
		open,
		trigger
	}: {
		cluster: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema: Schema;
		role?: string;
		onSuccess?: (name: string) => void;
		open?: boolean;
		trigger?: Snippet<
			[
				{
					get open(): boolean;
					set open(value: boolean);
				}
			]
		>;
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
	void role;
	// svelte-ignore state_referenced_locally
	void onSuccess;
	// svelte-ignore state_referenced_locally
	void open;
	// svelte-ignore state_referenced_locally
	void trigger;
</script>
