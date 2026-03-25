<script lang="ts">
	import { CalendarDate } from '@internationalized/date';

	import { Button } from '$lib/components/ui/button/index.js';
	import Calendar from '$lib/components/ui/calendar/calendar.svelte';

	let {
		date = $bindable(),
		time = $bindable()
	}: { date: CalendarDate | undefined; time: string | null } = $props();

	const timeSlots = Array.from({ length: 96 }, (_, i) => {
		const totalMinutes = i * 15;
		const hour = Math.floor(totalMinutes / 60);
		const minute = totalMinutes % 60;
		return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
	});
</script>

<div class="md:pe-48">
	<div class="p-6">
		<Calendar
			type="single"
			bind:value={date}
			class="bg-transparent p-0 [--cell-size:--spacing(8)]"
			weekdayFormat="short"
		/>
	</div>
	<div
		class="inset-y-0 inset-e-0 no-scrollbar flex max-h-72 w-full scroll-pb-6 flex-col gap-4 overflow-y-auto border-t p-6 md:absolute md:max-h-none md:w-48 md:border-s md:border-t-0"
	>
		<div class="grid gap-2">
			{#each timeSlots as slot (slot)}
				<Button
					variant={time === slot ? 'default' : 'outline'}
					onclick={() => (time = slot)}
					class="w-full shadow-none"
				>
					{slot}
				</Button>
			{/each}
		</div>
	</div>
</div>
