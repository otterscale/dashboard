<script lang="ts">
	import BoxIcon from '@lucide/svelte/icons/box';
	import { prefersReducedMotion } from 'svelte/motion';
	import { fade } from 'svelte/transition';

	import { m } from '$lib/messages';

	import EmptyCard from '../empty-card.svelte';

	// Takes the ranking's place when there is no model to rank, in the Usage tab's empty style:
	// what is missing, where models come from, and the two ways forward.
	let {
		history,
		windowLabel,
		deployHref,
		onLonger
	}: {
		history: boolean;
		/** "the last 12 h", for the History title. */
		windowLabel: string;
		/** AI Studio's Model list, where a model is deployed. */
		deployHref?: string;
		/** Absent in Now, and when the window is already the longest. */
		onLonger?: () => void;
	} = $props();
</script>

<!-- The ranking's own height, so the page above and beside it stays put when the placeholder
     turns out to be empty; it fades in rather than cutting over. -->
<div in:fade|global={{ duration: prefersReducedMotion.current ? 0 : 150 }}>
	<EmptyCard
		Icon={BoxIcon}
		class="min-h-[26.5rem]"
		title={history
			? m.model_analytics_empty_history_title({ window: windowLabel })
			: m.model_analytics_empty_now_title()}
		description={m.model_analytics_empty_desc()}
		href={deployHref}
		hrefLabel={m.model_analytics_empty_deploy()}
		onAction={onLonger}
		actionLabel={m.model_analytics_empty_longer()}
	/>
</div>
