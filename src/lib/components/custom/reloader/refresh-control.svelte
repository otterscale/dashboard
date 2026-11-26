<script lang="ts">
	import ChevronsRightIcon from '@lucide/svelte/icons/chevrons-right';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import PauseIcon from '@lucide/svelte/icons/pause';
	import RotateCwIcon from '@lucide/svelte/icons/rotate-cw';

	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	// Auto update, when the data was last fetched and "update now", in one pill: ↻ on the left,
	// the state on the right, with the data's age beside Live (`3 s`). Clicking the state switches
	// between Live (auto update on) and Paused. A page that only updates on demand shows when it
	// last fetched. A window that ends in the past has nothing new to fetch, so the right side
	// offers to come back to now instead.
	let {
		live = $bindable(),
		updatedAt,
		updating = false,
		past = false,
		onrefresh,
		onnow,
		class: className
	}: {
		/** Auto update; leave it out on a page that only updates on demand. */
		live?: boolean;
		/** When the data was last fetched, in ms. */
		updatedAt?: number;
		/** A fetch is under way: ↻ spins. */
		updating?: boolean;
		/** The window ends before now. */
		past?: boolean;
		onrefresh: () => void;
		/** Move a past window to now; shown while `past`. */
		onnow?: () => void;
		class?: string;
	} = $props();

	let now = $state(Date.now());
	$effect(() => {
		const id = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(id);
	});

	/** `3 s`, `2 min`, `5 h`, `2 d`, rounded down. */
	function ago(at: number): string {
		const s = Math.max(0, Math.floor((now - at) / 1000));
		if (s < 60) return m.duration_seconds({ count: String(s) });
		const minutes = Math.floor(s / 60);
		if (minutes < 60) return m.duration_minutes({ count: String(minutes) });
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return m.duration_hours({ count: String(hours) });
		return m.duration_days({ count: String(Math.floor(hours / 24)) });
	}

	const part =
		'inline-flex items-center gap-2 px-3 whitespace-nowrap transition-colors outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-50 dark:hover:bg-input/50';
	const meta = 'text-xs font-normal text-muted-foreground tabular-nums';
</script>

<div
	class={cn(
		'inline-flex h-9 shrink-0 items-stretch overflow-hidden rounded-full border border-border bg-background text-sm font-medium shadow-xs dark:border-input dark:bg-input/30',
		className
	)}
>
	<button
		type="button"
		class={cn(part, 'w-9 justify-center px-0')}
		aria-label={m.refresh_now()}
		title={m.refresh_now()}
		disabled={past || updating}
		onclick={onrefresh}
	>
		{#if updating}
			<LoaderCircleIcon class="size-4 animate-spin text-muted-foreground" />
		{:else}
			<RotateCwIcon class="size-4" />
		{/if}
	</button>
	<span class="w-px bg-border dark:bg-input" aria-hidden="true"></span>
	{#if past && onnow}
		<button type="button" class={part} onclick={onnow}>
			<ChevronsRightIcon class="size-4 text-muted-foreground" />{m.refresh_back_to_now()}
		</button>
	{:else if live !== undefined}
		<!-- As wide as the wider of "● Live 9 s" and "‖ Paused" in either language, so pausing
		     and resuming move nothing beside it. -->
		<button
			type="button"
			class={cn(part, 'min-w-[6.25rem]')}
			aria-pressed={live}
			title={[
				live ? m.refresh_pause() : m.refresh_resume(),
				updatedAt === undefined ? '' : m.refresh_updated_ago({ ago: ago(updatedAt) })
			]
				.filter(Boolean)
				.join(' · ')}
			onclick={() => (live = !live)}
		>
			{#if live}
				<span class="relative flex size-2" aria-hidden="true">
					<span
						class="absolute inset-0 animate-ping rounded-full bg-chart-2 opacity-50 motion-reduce:hidden"
					></span>
					<span class="relative size-2 rounded-full bg-chart-2"></span>
				</span>
				{m.refresh_live()}
				{#if updatedAt !== undefined}
					<span class="{meta} max-sm:hidden">{ago(updatedAt)}</span>
				{/if}
			{:else}
				<PauseIcon class="size-3.5 text-muted-foreground" />
				<!-- No age here: Paused is wider than Live, and the age is in the tooltip. -->
				<span class="text-muted-foreground">{m.refresh_paused()}</span>
			{/if}
		</button>
	{:else}
		<span class="flex items-center px-3 text-[0.8125rem] font-normal text-muted-foreground">
			<span class="tabular-nums">
				{updatedAt === undefined
					? m.refresh_updating()
					: m.refresh_updated_ago({ ago: ago(updatedAt) })}
			</span>
		</span>
	{/if}
</div>
