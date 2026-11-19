<script lang="ts">
	import type { Component, Snippet } from 'svelte';

	import type { LoadStatus } from '$lib/components/dashboard/shared/loadable.svelte';
	import StatCard from '$lib/components/dashboard/shared/stat-card.svelte';
	import { cn } from '$lib/utils';

	// The KPI tile of the Analytics detail sections: the shared stat tile, with the card's
	// one-line description and its longer explanation both behind the info button.
	let {
		title,
		description,
		tooltip,
		icon,
		status,
		stale = false,
		valueClass,
		class: className,
		children,
		detail
	}: {
		title: string;
		description: string;
		tooltip: string;
		icon: Component;
		status: LoadStatus;
		stale?: boolean;
		valueClass?: string;
		class?: string;
		/** The value. */
		children: Snippet;
		/** A line under the value. */
		detail?: Snippet;
	} = $props();
</script>

<StatCard
	label={title}
	{icon}
	info={`${description} — ${tooltip}`}
	{status}
	{stale}
	{valueClass}
	class={cn(className)}
	{detail}
>
	{@render children()}
</StatCard>
