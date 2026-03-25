<script lang="ts">
	import { CalendarDateTime } from '@internationalized/date';

	import { Button } from '$lib/components/ui/button/index.js';
	import { m } from '$lib/paraglide/messages';

	let {
		from = $bindable(),
		to = $bindable(),
		toIsNow = $bindable(false)
	}: { from: CalendarDateTime | undefined; to: CalendarDateTime | undefined; toIsNow: boolean } =
		$props();

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
		const now = new Date();
		const past = new Date(now.getTime() - minutes * 60 * 1000);

		to = new CalendarDateTime(
			now.getFullYear(),
			now.getMonth() + 1,
			now.getDate(),
			now.getHours(),
			now.getMinutes()
		);
		from = new CalendarDateTime(
			past.getFullYear(),
			past.getMonth() + 1,
			past.getDate(),
			past.getHours(),
			past.getMinutes()
		);
		toIsNow = true;
	}
</script>

<div class="p-4">
	<p class="mb-3 text-sm font-medium">{m.commonly_used()}</p>
	<div class="grid grid-cols-2 gap-2">
		{#each presets as preset (preset.minutes)}
			<Button
				variant="outline"
				size="sm"
				class="flex-1"
				onclick={() => applyPreset(preset.minutes)}
			>
				{preset.label()}
			</Button>
		{/each}
	</div>
</div>
