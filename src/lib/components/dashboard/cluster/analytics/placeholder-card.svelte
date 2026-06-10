<script lang="ts">
	import MousePointerClick from '@lucide/svelte/icons/mouse-pointer-click';

	import * as Statistics from '$lib/components/custom/statistics/index';

	let {
		title,
		message
	}: {
		title: string;
		message: string;
	} = $props();
</script>

<Statistics.Root type="count" class="overflow-visible">
	<Statistics.Header class="flex flex-row items-center gap-2 space-y-0">
		<div class="grid flex-1 gap-1">
			<Statistics.Title class="text-base leading-normal text-foreground">
				{title}
			</Statistics.Title>
		</div>
	</Statistics.Header>
	<Statistics.Content class="min-h-16">
		<div class="flex h-[200px] w-full flex-col items-center justify-center gap-2">
			<MousePointerClick class="size-10 text-muted-foreground/60" />
			<p class="text-center text-sm text-muted-foreground">{message}</p>
		</div>
	</Statistics.Content>
</Statistics.Root>
