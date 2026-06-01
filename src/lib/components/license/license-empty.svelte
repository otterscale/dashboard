<script lang="ts">
	let {
		onUpload,
		fingerprint,
		onTriggerExport
	}: {
		onUpload: any; // eslint-disable-line @typescript-eslint/no-explicit-any
		fingerprint?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
		onTriggerExport: any; // eslint-disable-line @typescript-eslint/no-explicit-any
	} = $props();

	// svelte-ignore state_referenced_locally
	void onUpload;
	// svelte-ignore state_referenced_locally
	void fingerprint;
	// svelte-ignore state_referenced_locally
	void onTriggerExport;
</script>
