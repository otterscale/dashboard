<script lang="ts">
	import type { Snippet } from 'svelte';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import { canOpen, type LinkTarget, type RulesReview, tooltipNames } from './links';

	// A number or a name that opens the resource it counts. No target, or a kind the viewer may
	// not open, leaves it plain text: a link must not lead to an error page.
	let {
		target,
		names = [],
		class: className,
		label,
		block = false,
		children
	}: {
		target: LinkTarget | null;
		/** Listed in a tooltip, up to five. */
		names?: string[];
		class?: string;
		/** Accessible name when the visible text alone does not say what opens. */
		label?: string;
		/**
		 * A whole tile that opens: no underline on the tile, only on what is marked
		 * `group-hover/link:underline` inside it.
		 */
		block?: boolean;
		children: Snippet;
	} = $props();

	const review = $derived(page.data.selfsubjectrulesreviewStatus as RulesReview);
	const allowed = $derived(target !== null && canOpen(review, target.kind));

	function hrefOf(link: LinkTarget): string {
		const cluster = page.params.cluster ?? '';
		const workspace = page.params.workspace ?? '';
		const path = link.name
			? resolve('/(auth)/[cluster]/[workspace]/[name]', { cluster, workspace, name: link.name })
			: resolve('/(auth)/[cluster]/[workspace]', { cluster, workspace });
		return `${path}?${link.search}`;
	}

	const href = $derived(target && allowed ? hrefOf(target) : undefined);
	const listed = $derived(tooltipNames(names));
	const linkClass = $derived(
		cn(
			'outline-none focus-visible:ring-2 focus-visible:ring-ring',
			block
				? 'group/link'
				: 'underline decoration-border underline-offset-[3px] hover:decoration-current focus-visible:rounded-sm',
			className
		)
	);
</script>

{#if href}
	{#if listed.shown.length > 0}
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<!-- The href is built with resolve() in hrefOf(); the query string is appended. -->
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a {...props} {href} class={linkClass} aria-label={label}>{@render children()}</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content side="top" align="end" class="max-w-none">
				<ul class="font-mono text-[11px] leading-4">
					{#each listed.shown as name (name)}
						<li class="whitespace-nowrap">{name}</li>
					{/each}
					{#if listed.more > 0}
						<li class="font-sans">{m.workspace_tooltip_more({ count: String(listed.more) })}</li>
					{/if}
				</ul>
			</Tooltip.Content>
		</Tooltip.Root>
	{:else}
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a {href} class={linkClass} aria-label={label}>{@render children()}</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{/if}
{:else}
	<span class={className}>{@render children()}</span>
{/if}
