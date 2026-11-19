<script lang="ts">
	import MousePointerClickIcon from '@lucide/svelte/icons/mouse-pointer-click';

	import WidgetCard from '$lib/components/dashboard/shared/widget-card.svelte';
	import WidgetState from '$lib/components/dashboard/shared/widget-state.svelte';

	// Shown in place of a detail section until a node or a namespace is picked.
	let {
		title,
		message
	}: {
		title: string;
		message: string;
	} = $props();
</script>

<WidgetCard {title} bodyClass="min-h-[200px]">
	<WidgetState
		kind="empty"
		title={message}
		description=""
		icon={MousePointerClickIcon}
		class="flex-1"
	/>
</WidgetCard>
