<script lang="ts">
	import LayersIcon from '@lucide/svelte/icons/layers';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { useSidebar } from '$lib/components/ui/sidebar';
	import { m } from '$lib/paraglide/messages';
	import { breadcrumbs } from '$lib/stores';
	import { cn } from '$lib/utils';

	// Set breadcrumbs navigation
	breadcrumbs.set([
		{
			title: m.console(),
			url: resolve('/(auth)/[cluster]/console', { cluster: page.params.cluster! })
		}
	]);

	const sidebar = useSidebar();
</script>

<div
	class={cn(
		'pointer-events-none fixed inset-0 flex flex-col items-center justify-center gap-2 transition-all duration-200 ease-linear',
		sidebar.open ? 'ml-(--sidebar-width)' : ''
	)}
>
	<LayersIcon class="size-10" />

	<div class="space-y-2 text-center">
		<p class="text-lg font-semibold tracking-tight">{m.console_title_add_workspace()}</p>
		<p class="max-w-md text-sm text-muted-foreground">
			{m.console_description_add_workspace({ cluster: page.params.cluster! })}
		</p>
	</div>
</div>
