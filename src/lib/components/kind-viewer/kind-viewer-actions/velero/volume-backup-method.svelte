<script lang="ts">
	// Placeholder — the enterprise edition overlays this file (ee/src).

	let {
		idPrefix,
		readiness,
		method = $bindable(),
		storageClasses = $bindable()
	}: {
		idPrefix: string;
		readiness: unknown;
		method: unknown;
		storageClasses: string[];
	} = $props();

	// svelte-ignore state_referenced_locally
	void idPrefix;
	// svelte-ignore state_referenced_locally
	void readiness;
	void method;
	void storageClasses;
</script>
