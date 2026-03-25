<script lang="ts">
	import { CalendarDateTime, getLocalTimeZone } from '@internationalized/date';
	import { ArrowRightIcon, CalendarSearchIcon } from '@lucide/svelte';

	import { Button } from '$lib/components/ui/button/index.js';
	import * as ButtonGroup from '$lib/components/ui/button-group/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';

	import DatetimePicker from './datetime-picker.svelte';
	import DatetimePresets from './datetime-presets.svelte';

	let from = $state<CalendarDateTime | undefined>(new CalendarDateTime(2025, 6, 12, 12, 0));
	let to = $state<CalendarDateTime | undefined>(new CalendarDateTime(2025, 6, 12, 12, 0));
	let toIsNow = $state(false);

	function formatDatetime(value: CalendarDateTime | undefined) {
		if (!value) return '';
		const dateStr = value.toDate(getLocalTimeZone()).toLocaleDateString(getLocale(), {
			weekday: 'long',
			day: 'numeric',
			month: 'short'
		});
		const timeStr = `${value.hour.toString().padStart(2, '0')}:${value.minute.toString().padStart(2, '0')}`;
		return `${dateStr} @ ${timeStr}`;
	}
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
				<DatetimePresets bind:from bind:to bind:toIsNow />
			</Popover.Content>
		</Popover.Root>
		<Popover.Root>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="outline" class="border-r-0" aria-label="Open From">
						<span class="font-medium">
							{formatDatetime(from)}
						</span>
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content align="end" class="w-full rounded-lg p-0">
				<DatetimePicker bind:value={from} />
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
							{toIsNow ? m.now() : formatDatetime(to)}
						</span>
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content align="end" class="w-full rounded-lg p-0">
				<DatetimePicker bind:value={to} onchange={() => (toIsNow = false)} />
			</Popover.Content>
		</Popover.Root>
	</ButtonGroup.Root>
</div>
