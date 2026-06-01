<script lang="ts">
	let {
		license,
		fingerprint,
		onRefresh,
		onReplace,
		onTriggerExport
	}: {
		license: any; // eslint-disable-line @typescript-eslint/no-explicit-any
		fingerprint: any; // eslint-disable-line @typescript-eslint/no-explicit-any
		onRefresh: any; // eslint-disable-line @typescript-eslint/no-explicit-any
		onReplace: any; // eslint-disable-line @typescript-eslint/no-explicit-any
		onTriggerExport: any; // eslint-disable-line @typescript-eslint/no-explicit-any
	} = $props();

	// svelte-ignore state_referenced_locally
	void license;
	// svelte-ignore state_referenced_locally
	void fingerprint;
	// svelte-ignore state_referenced_locally
	void onRefresh;
	// svelte-ignore state_referenced_locally
	void onReplace;
	// svelte-ignore state_referenced_locally
	void onTriggerExport;
</script>
