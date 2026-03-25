<script lang="ts">
	import { CalendarDate, getLocalTimeZone } from '@internationalized/date';
	import { ArrowRightIcon, CalendarSearchIcon } from '@lucide/svelte';

	import { Button } from '$lib/components/ui/button/index.js';
	import * as ButtonGroup from '$lib/components/ui/button-group/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { getLocale } from '$lib/paraglide/runtime';

	import DatetimePicker from './datetime-picker.svelte';
	import DatetimePresets from './datetime-presets.svelte';

	let fromDate = $state<CalendarDate | undefined>(new CalendarDate(2025, 6, 12));
	let fromTime = $state<string | null>('12:00');

	let toDate = $state<CalendarDate | undefined>(new CalendarDate(2025, 6, 12));
	let toTime = $state<string | null>('12:00');
</script>

<div class="flex justify-end">
	<ButtonGroup.Root>
		<Popover.Root>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="outline" size="icon" aria-label="Open Calendar">
						<CalendarSearchIcon />
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content align="end" class="w-full rounded-lg p-0">
				<DatetimePresets />
			</Popover.Content>
		</Popover.Root>
		<Popover.Root>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="outline" class="border-r-0" aria-label="Open From">
						<span class="font-medium">
							{fromDate?.toDate(getLocalTimeZone()).toLocaleDateString(getLocale(), {
								weekday: 'long',
								day: 'numeric',
								month: 'short'
							})} @ {fromTime}
						</span>
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content align="end" class="w-full rounded-lg p-0">
				<DatetimePicker bind:date={fromDate} bind:time={fromTime} />
			</Popover.Content>
		</Popover.Root>
		<Button variant="outline" size="icon" class="border-r-0 disabled:opacity-100" disabled>
			<ArrowRightIcon />
		</Button>
		<Popover.Root>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="outline" aria-label="Open To">
						<span class="font-medium">
							{toDate?.toDate(getLocalTimeZone()).toLocaleDateString(getLocale(), {
								weekday: 'long',
								day: 'numeric',
								month: 'short'
							})} @ {toTime}
						</span>
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content align="end" class="w-full rounded-lg p-0">
				<DatetimePicker bind:date={toDate} bind:time={toTime} />
			</Popover.Content>
		</Popover.Root>
	</ButtonGroup.Root>
</div>
