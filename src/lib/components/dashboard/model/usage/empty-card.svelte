<script lang="ts">
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import PlugZapIcon from '@lucide/svelte/icons/plug-zap';

	import { m } from '$lib/messages';

	import EmptyCard from '../empty-card.svelte';

	// Replaces the charts, ranking and detail when the window has nothing to show: either no
	// request was made with an API key, or the gateway's metrics are not collected at all.
	let {
		kind,
		title,
		manageHref,
		onLonger
	}: {
		kind: 'no-requests' | 'not-collected';
		title: string;
		manageHref?: string;
		/** Absent when the window is already the longest. */
		onLonger?: () => void;
	} = $props();

	// Not collected is not something the reader can fix from here, so it offers no way forward.
	const actions = $derived(kind === 'no-requests');
</script>

<EmptyCard
	Icon={kind === 'not-collected' ? PlugZapIcon : KeyRoundIcon}
	class="min-h-[22.5rem]"
	{title}
	description={kind === 'not-collected' ? m.usage_not_collected_desc() : m.usage_empty_desc()}
	href={actions ? manageHref : undefined}
	hrefLabel={m.usage_manage_keys()}
	onAction={actions ? onLonger : undefined}
	actionLabel={m.usage_longer_range()}
/>
