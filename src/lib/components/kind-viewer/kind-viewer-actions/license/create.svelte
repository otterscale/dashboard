<script lang="ts">
	let {
		cluster,
		group,
		version,
		resource
	}: {
		cluster: string;
		group: string;
		version: string;
		resource: string;
	} = $props();

	// svelte-ignore state_referenced_locally
	void cluster;
	// svelte-ignore state_referenced_locally
	void group;
	// svelte-ignore state_referenced_locally
	void version;
	// svelte-ignore state_referenced_locally
	void resource;
</script>
