<script lang="ts">
	// Placeholder — the enterprise edition overlays this file (ee/src).

	let {
		method,
		featureEnabled
	}: {
		method: unknown;
		featureEnabled: boolean | undefined;
	} = $props();

	// svelte-ignore state_referenced_locally
	void method;
	// svelte-ignore state_referenced_locally
	void featureEnabled;
</script>
