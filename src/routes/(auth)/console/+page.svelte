<script lang="ts">
	import CompassIcon from '@lucide/svelte/icons/compass';
	import { onMount } from 'svelte';

	import { resolve } from '$app/paths';
	import { startTour } from '$lib/components/layout';
	import ImportCluster from '$lib/components/layout/dialog-import-cluster.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Empty from '$lib/components/ui/empty/index.ts';
	import { useSidebar } from '$lib/components/ui/sidebar';
	import { m } from '$lib/messages';
	import { breadcrumbs } from '$lib/stores';
	import { cn } from '$lib/utils';

	// Set breadcrumbs navigation
	breadcrumbs.set([
		{
			title: m.console(),
			url: resolve('/(auth)/console')
		}
	]);

	const STORAGE_KEY = 'otterscale_tutorial';
	const sidebar = useSidebar();

	onMount(() => {
		const hasSeenTutorial = localStorage.getItem(STORAGE_KEY);
		if (hasSeenTutorial) return;

		startTour();
		localStorage.setItem(STORAGE_KEY, 'true');
	});

	let open = $state(false);
</script>

<ImportCluster bind:open />

<div
	class={cn(
		'pointer-events-none fixed inset-0 flex flex-col items-center justify-center gap-2 transition-all duration-200 ease-linear',
		sidebar.open ? 'ml-(--sidebar-width)' : ''
	)}
>
	<Empty.Root>
		<Empty.Header>
			<Empty.Media variant="icon">
				<CompassIcon />
			</Empty.Media>
			<Empty.Title>{m.console_title()}</Empty.Title>
			<Empty.Description>
				{m.console_description()}
			</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<Button
				class="pointer-events-auto"
				onclick={() => {
					open = !open;
				}}
			>
				Add
			</Button>
		</Empty.Content>
	</Empty.Root>
</div>
