<script lang="ts">
	// Placeholder — the enterprise edition overlays this file (ee/src).
	let {
		cluster,
		namespace,
		name,
		targetKind,
		label,
		onOpenChangeComplete
	}: {
		cluster: string;
		namespace: string;
		name: string;
		targetKind: string;
		label: string;
		onOpenChangeComplete?: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	void cluster;
	// svelte-ignore state_referenced_locally
	void namespace;
	// svelte-ignore state_referenced_locally
	void name;
	// svelte-ignore state_referenced_locally
	void targetKind;
	// svelte-ignore state_referenced_locally
	void label;
	// svelte-ignore state_referenced_locally
	void onOpenChangeComplete;
</script>
