<script lang="ts">
	import { CalendarDate } from '@internationalized/date';

	import { Button } from '$lib/components/ui/button/index.js';

	let {
		date = $bindable(),
		time = $bindable()
	}: { date: CalendarDate | undefined; time: string | null } = $props();

	const presents = [
		{ label: 'Last 1 minute', value: -1 },
		{ label: 'Last 5 minute', value: -5 },
		{ label: 'Last 15 minutes', value: -15 },
		{ label: 'Last 1 hour', value: -60 },
		{ label: 'Last 3 hour', value: -60 * 3 },
		{ label: 'Last 24 hours', value: -60 * 24 },
		{ label: 'Last 7 days', value: -60 * 24 * 7 },
		{ label: 'Last 30 days', value: -60 * 24 * 30 }
	];
</script>

Commonly used

<div class="grid grid-cols-2 flex-wrap gap-2">
	{#each presents as preset (preset.label)}
		<Button
			variant="outline"
			size="sm"
			class="flex-1"
			onclick={() => {
				value = todayDate?.add({ days: preset.value });
			}}
		>
			{preset.label}
		</Button>
	{/each}
</div>

Refresh every
