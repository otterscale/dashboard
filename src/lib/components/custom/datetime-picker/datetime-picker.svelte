<script lang="ts">
	import { CalendarDateTime, getLocalTimeZone } from '@internationalized/date';
	import { ArrowRightIcon, CalendarSearchIcon } from '@lucide/svelte';

	import { Button } from '$lib/components/ui/button/index.js';
	import * as ButtonGroup from '$lib/components/ui/button-group/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';

	import Calendar from './calendar.svelte';

	function nowCalendarDateTime(): CalendarDateTime {
		const d = new Date();
		return new CalendarDateTime(
			d.getFullYear(),
			d.getMonth() + 1,
			d.getDate(),
			d.getHours(),
			d.getMinutes()
		);
	}

	function minutesAgoCalendarDateTime(minutes: number): CalendarDateTime {
		const d = new Date(Date.now() - minutes * 60 * 1000);
		return new CalendarDateTime(
			d.getFullYear(),
			d.getMonth() + 1,
			d.getDate(),
			d.getHours(),
			d.getMinutes()
		);
	}

	let {
		from = $bindable(minutesAgoCalendarDateTime(60)),
		to = $bindable(nowCalendarDateTime()),
		toIsNow = $bindable(true)
	}: {
		from?: CalendarDateTime;
		to?: CalendarDateTime;
		toIsNow?: boolean;
	} = $props();

	const presets = [
		{ label: () => m.last_1_minute(), minutes: 1 },
		{ label: () => m.last_5_minutes(), minutes: 5 },
		{ label: () => m.last_15_minutes(), minutes: 15 },
		{ label: () => m.last_1_hour(), minutes: 60 },
		{ label: () => m.last_3_hours(), minutes: 60 * 3 },
		{ label: () => m.last_24_hours(), minutes: 60 * 24 },
		{ label: () => m.last_7_days(), minutes: 60 * 24 * 7 },
		{ label: () => m.last_30_days(), minutes: 60 * 24 * 30 }
	];

	function applyPreset(minutes: number) {
		to = nowCalendarDateTime();
		from = minutesAgoCalendarDateTime(minutes);
		toIsNow = true;
	}

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
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="outline" size="icon" aria-label="Open Calendar">
						<CalendarSearchIcon />
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="w-full rounded-lg p-0">
				<DropdownMenu.Group>
					<DropdownMenu.Label>{m.commonly_used()}</DropdownMenu.Label>
					<DropdownMenu.Separator />
					{#each presets as preset (preset.minutes)}
						<DropdownMenu.Item onclick={() => applyPreset(preset.minutes)}>
							{preset.label()}
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Group>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
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
				<Calendar bind:value={from} />
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
				<Calendar bind:value={to} onchange={() => (toIsNow = false)} />
			</Popover.Content>
		</Popover.Root>
	</ButtonGroup.Root>
</div>
