<script lang="ts">
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import PlugZapIcon from '@lucide/svelte/icons/plug-zap';

	import { m } from '$lib/messages';

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

	const link =
		'inline-flex min-h-9 items-center rounded-md px-1.5 text-sm font-medium text-chart-2 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none';
</script>

<section
	class="flex min-h-[22.5rem] flex-col items-center justify-center rounded-2xl bg-card px-6 py-12 text-center shadow-(--card-frame)"
>
	<span class="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
		{#if kind === 'not-collected'}
			<PlugZapIcon class="size-5" />
		{:else}
			<KeyRoundIcon class="size-5" />
		{/if}
	</span>
	<h2 class="mt-4 text-lg leading-7 font-semibold">{title}</h2>
	<p class="mt-2 max-w-md text-sm text-muted-foreground">
		{kind === 'not-collected' ? m.usage_not_collected_desc() : m.usage_empty_desc()}
	</p>
	{#if kind === 'no-requests'}
		<div class="mt-4 flex flex-wrap items-center justify-center gap-x-3">
			{#if manageHref}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved by the caller -->
				<a href={manageHref} class={link}>{m.usage_manage_keys()}</a>
			{/if}
			{#if onLonger}
				<button type="button" class={link} onclick={onLonger}>{m.usage_longer_range()}</button>
			{/if}
		</div>
	{/if}
</section>
