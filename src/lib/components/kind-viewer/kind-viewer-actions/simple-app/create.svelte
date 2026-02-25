<script lang="ts">
	import Create from '$lib/components/dynamic-form/simpleapp/create-sheet.svelte';

	let { schema }: { schema: any } = $props();
</script>

<Create {schema} />
