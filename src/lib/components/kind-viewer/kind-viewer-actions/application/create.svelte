<script lang="ts">
	import Create from '$lib/components/dynamic-form/application/create-sheet.svelte';

	let { schema }: { schema: any } = $props();
</script>

<Create {schema} />
