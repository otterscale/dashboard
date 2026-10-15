<script lang="ts">
	let {
		cluster,
		overview,
		onChange
	}: {
		cluster: any; // eslint-disable-line @typescript-eslint/no-explicit-any
		overview: any; // eslint-disable-line @typescript-eslint/no-explicit-any
		onChange: any; // eslint-disable-line @typescript-eslint/no-explicit-any
	} = $props();

	// svelte-ignore state_referenced_locally
	void cluster;
	// svelte-ignore state_referenced_locally
	void overview;
	// svelte-ignore state_referenced_locally
	void onChange;
</script>
