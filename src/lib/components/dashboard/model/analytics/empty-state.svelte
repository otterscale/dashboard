<script lang="ts">
	import BoxIcon from '@lucide/svelte/icons/box';
	import { prefersReducedMotion } from 'svelte/motion';
	import { fade } from 'svelte/transition';

	import { m } from '$lib/messages';

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

	const link =
		'inline-flex min-h-9 items-center rounded-md px-1.5 text-sm font-medium text-chart-2 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none';
</script>

<!-- The ranking's own height, so the page above and beside it stays put when the placeholder
     turns out to be empty; it fades in rather than cutting over. -->
<section
	class="flex min-h-[26.5rem] flex-col items-center justify-center rounded-2xl bg-card px-6 py-12 text-center shadow-(--card-frame)"
	in:fade|global={{ duration: prefersReducedMotion.current ? 0 : 150 }}
>
	<span class="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
		<BoxIcon class="size-5" />
	</span>
	<h2 class="mt-4 text-lg leading-7 font-semibold">
		{history
			? m.model_analytics_empty_history_title({ window: windowLabel })
			: m.model_analytics_empty_now_title()}
	</h2>
	<p class="mt-2 max-w-md text-sm text-muted-foreground">{m.model_analytics_empty_desc()}</p>
	{#if deployHref || onLonger}
		<div class="mt-4 flex flex-wrap items-center justify-center gap-x-3">
			{#if deployHref}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved by the caller -->
				<a href={deployHref} class={link}>{m.model_analytics_empty_deploy()}</a>
			{/if}
			{#if onLonger}
				<button type="button" class={link} onclick={onLonger}>
					{m.model_analytics_empty_longer()}
				</button>
			{/if}
		</div>
	{/if}
</section>
