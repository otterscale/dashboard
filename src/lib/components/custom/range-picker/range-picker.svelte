<script lang="ts">
	import {
		CalendarDate,
		type DateValue,
		getLocalTimeZone,
		today as todayIn
	} from '@internationalized/date';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

	import { Button } from '$lib/components/ui/button';
	import { Calendar } from '$lib/components/ui/calendar';
	import * as Popover from '$lib/components/ui/popover';
	import { m } from '$lib/messages';
	import { getLocale } from '$lib/paraglide/runtime';

	import {
		formatSpan,
		onDay,
		PRESET_MINUTES,
		rangeMinutes,
		resolveRange,
		shiftRange,
		type TimeRange,
		withLength
	} from './time-range';

	// A dashboard's time window, in two choices: how long it is (the x axis) and which day it ends
	// on. Arrows beside it page the window by its own length. Updating it to now is the page's
	// refresh control's job.
	let {
		range = $bindable(),
		anchor = $bindable()
	}: {
		range: TimeRange;
		/** When a window ending "now" was last anchored, in ms. */
		anchor: number;
	} = $props();

	let open = $state(false);

	const current = $derived(resolveRange(range, anchor));
	const minutes = $derived(rangeMinutes(range));
	const atNow = $derived(range.kind === 'relative');
	const zone = getLocalTimeZone();
	// Read when the popover opens: a page left open past midnight can still pick the new day.
	const today = $derived.by(() => {
		void open;
		return todayIn(zone);
	});

	function lengthLabel(min: number): string {
		if (min === 1440) return m.time_range_span_one_day();
		if (min % 1440 === 0) return m.time_range_span_days({ count: String(min / 1440) });
		if (min === 60) return m.time_range_span_one_hour();
		if (min % 60 === 0) return m.time_range_span_hours({ count: String(min / 60) });
		return m.time_range_span_minutes({ count: String(min) });
	}

	// The day the window ends on; a window ending at midnight belongs to the day before.
	const selectedDay = $derived.by(() => {
		const d = new Date(current.end - 1);
		return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
	});

	function pickLength(min: number) {
		range = withLength(range, min);
		if (range.kind === 'relative') anchor = Date.now();
	}

	function pickDay(day: DateValue | undefined) {
		if (!day) return;
		const now = Date.now();
		range = onDay(range, day.toDate(zone).getTime(), now);
		if (range.kind === 'relative') anchor = now;
		open = false;
	}

	function shift(direction: -1 | 1) {
		const now = Date.now();
		range = shiftRange(range, anchor, direction, now);
		if (range.kind === 'relative') anchor = now;
	}

	const caption = 'px-2 pt-1.5 pb-2 text-xs text-muted-foreground';
</script>

<div class="flex items-center gap-1">
	<Button
		variant="outline"
		size="icon"
		class="size-9 rounded-full"
		aria-label={m.time_range_earlier()}
		title={m.time_range_earlier()}
		onclick={() => shift(-1)}
	>
		<ChevronLeftIcon />
	</Button>
	<Popover.Root bind:open>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="outline" class="h-9 gap-2 rounded-full px-3.5">
					<CalendarIcon class="text-muted-foreground" />
					<span class="font-medium">
						{atNow ? m.time_range_last_span({ span: lengthLabel(minutes) }) : lengthLabel(minutes)}
					</span>
					<span class="text-xs text-muted-foreground tabular-nums max-sm:hidden">
						{formatSpan(current.start, current.end)}
					</span>
					<ChevronDownIcon class="text-muted-foreground" />
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content
			align="end"
			class="w-auto max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-xl p-0"
		>
			<div class="flex flex-col sm:flex-row">
				<div class="border-b border-border p-2 sm:w-40 sm:border-r sm:border-b-0">
					<p class={caption}>{m.time_range_time_span()}</p>
					<ul class="grid grid-cols-2 gap-0.5 sm:grid-cols-1">
						{#each PRESET_MINUTES as min (min)}
							{@const on = minutes === min}
							<li>
								<!-- The picked span and the hovered one share the accent ground in both modes;
								     the ghost variant's dark hover has to be named to be beaten. -->
								<Button
									variant="ghost"
									aria-pressed={on}
									class="w-full justify-start px-2 font-normal hover:bg-accent aria-pressed:bg-accent aria-pressed:font-medium dark:hover:bg-accent"
									onclick={() => pickLength(min)}
								>
									{lengthLabel(min)}
								</Button>
							</li>
						{/each}
					</ul>
				</div>
				<div class="p-2">
					<p class={caption}>{m.time_range_date()}</p>
					<Calendar
						type="single"
						value={selectedDay}
						onValueChange={pickDay}
						locale={getLocale()}
						maxValue={today}
						preventDeselect
						class="px-2 pt-0 pb-1 [--cell-size:--spacing(8)]"
					/>
					<p class="px-2 pb-1 text-xs text-muted-foreground">
						{atNow ? m.time_range_ends_now() : m.time_range_ends_midnight()}
					</p>
				</div>
			</div>
		</Popover.Content>
	</Popover.Root>
	<Button
		variant="outline"
		size="icon"
		class="size-9 rounded-full"
		aria-label={m.time_range_later()}
		title={m.time_range_later()}
		disabled={atNow}
		onclick={() => shift(1)}
	>
		<ChevronRightIcon />
	</Button>
</div>
