<script lang="ts">
	import ChevronsRightIcon from '@lucide/svelte/icons/chevrons-right';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import PauseIcon from '@lucide/svelte/icons/pause';
	import RotateCwIcon from '@lucide/svelte/icons/rotate-cw';

	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as ButtonGroup from '$lib/components/ui/button-group';
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

	// Text beside a state: smaller, quieter, and in figures that do not shift as they count.
	const meta = 'text-xs font-normal text-muted-foreground tabular-nums';
</script>

<!-- One pill out of outline buttons: the group squares the inner corners and shares the border
     between them, and the classes here round the two ends fully. -->
<ButtonGroup.Root
	class={cn(
		'shrink-0 [&>[data-slot]:first-child]:rounded-l-full! [&>[data-slot]:not(:has(~[data-slot]))]:rounded-r-full!',
		className
	)}
>
	<!-- The group shares one border between its parts; the widths below give that pixel back, so
	     the control is as wide as it was when each part had its own divider. -->
	<Button
		variant="outline"
		size="icon"
		class="w-[2.375rem]"
		aria-label={m.refresh_now()}
		title={m.refresh_now()}
		disabled={past || updating}
		onclick={onrefresh}
	>
		{#if updating}
			<LoaderCircleIcon class="animate-spin text-muted-foreground" />
		{:else}
			<RotateCwIcon />
		{/if}
	</Button>
	{#if past && onnow}
		<Button variant="outline" class="gap-2 px-3" onclick={onnow}>
			<ChevronsRightIcon class="text-muted-foreground" />{m.refresh_back_to_now()}
		</Button>
	{:else if live !== undefined}
		<!-- As wide as the wider of "● Live 9 s" and "‖ Paused" in either language, so pausing
		     and resuming move nothing beside it. -->
		<Button
			variant="outline"
			class="min-w-[6.3125rem] justify-start gap-2 px-3"
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
					<span class={cn(meta, 'max-sm:hidden')}>{ago(updatedAt)}</span>
				{/if}
			{:else}
				<PauseIcon class="size-3.5 text-muted-foreground" />
				<!-- No age here: Paused is wider than Live, and the age is in the tooltip. -->
				<span class="text-muted-foreground">{m.refresh_paused()}</span>
			{/if}
		</Button>
	{:else}
		<!-- Not a control, but the same ground and border as the button it sits against. -->
		<span
			data-slot="button-group-text"
			class={cn(
				buttonVariants({ variant: 'outline' }),
				'pointer-events-none px-3 text-[0.8125rem] font-normal text-muted-foreground tabular-nums'
			)}
		>
			{updatedAt === undefined
				? m.refresh_updating()
				: m.refresh_updated_ago({ ago: ago(updatedAt) })}
		</span>
	{/if}
</ButtonGroup.Root>
