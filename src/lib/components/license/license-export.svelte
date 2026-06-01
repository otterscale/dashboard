<script lang="ts">
	let {
		open = $bindable(),
		clusterFingerprint,
		onTrigger
	}: {
		open?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
		clusterFingerprint: any; // eslint-disable-line @typescript-eslint/no-explicit-any
		onTrigger: any; // eslint-disable-line @typescript-eslint/no-explicit-any
	} = $props();

	void open;
	// svelte-ignore state_referenced_locally
	void clusterFingerprint;
	// svelte-ignore state_referenced_locally
	void onTrigger;
</script>
