<script lang="ts">
	import { m } from '$lib/messages';

	// What a capacity card counts, at the right of its title.
	let { readyOnly = false, label }: { readyOnly?: boolean; label?: string } = $props();
</script>

<span class="px-1.5 text-xs leading-7 whitespace-nowrap text-muted-foreground">
	{label ?? (readyOnly ? m.cluster_scope_ready_nodes() : m.cluster_scope_all_nodes())}
</span>
