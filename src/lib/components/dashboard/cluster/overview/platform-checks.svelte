<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { PrometheusDriver } from 'prometheus-query';
	import { getContext, onMount } from 'svelte';

	import { page } from '$app/state';
	import { Panel } from '$lib/components/dashboard/kit';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import { LAYOUT } from './layout';
	import {
		type CheckId,
		type CheckState,
		PlatformChecksSource
	} from './platform-checks-source.svelte';

	// One row of platform facts (SPEC 3.7). Only cluster admins can read them; for anyone else
	// the card is left out entirely, not shown empty.
	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	const source = new PlatformChecksSource(
		createClient(ResourceService, getContext<Transport>('transport')),
		() => prometheusDriver,
		page.params.cluster ?? ''
	);
	$effect(() => {
		if (isReloading) source.start();
		else source.stop();
		return () => source.stop();
	});
	onMount(() => {
		if (!isReloading) void source.refresh();
	});

	const TITLES: Record<CheckId, () => string> = {
		modules: m.check_title_modules,
		backup: m.check_title_backup,
		certificates: m.check_title_certificates,
		notifications: m.check_title_notifications
	};
	const TONE: Record<CheckState, { text: string; dot: string }> = {
		ok: { text: 'text-chart-2', dot: 'bg-chart-2' },
		warning: { text: 'text-chart-1', dot: 'bg-chart-1' },
		critical: { text: 'text-destructive', dot: 'bg-destructive' },
		none: { text: 'text-muted-foreground', dot: 'bg-muted-foreground' },
		unknown: { text: 'text-muted-foreground', dot: 'bg-muted-foreground' }
	};
</script>

{#if !source.loaded || source.checks}
	<div class={LAYOUT.full}>
		<Panel
			title={m.platform_checks()}
			tooltip={m.platform_checks_tooltip()}
			state={source.loaded ? 'ready' : 'loading'}
			class="min-h-44"
		>
			<!-- Cells on a 1px border-coloured ground: the gaps draw the dividers at any column count. -->
			<ul
				class="grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border @md/panel:grid-cols-2 @4xl/panel:grid-cols-4"
			>
				{#each source.checks ?? [] as check (check.id)}
					{@const tone = TONE[check.state]}
					<li class="min-w-0 bg-card px-3.5 py-3">
						<p class="truncate text-xs leading-4 text-muted-foreground">{TITLES[check.id]()}</p>
						<p
							class={cn(
								'mt-1.5 flex items-center gap-2 text-base leading-6 font-[450] tabular-nums',
								tone.text
							)}
						>
							<span class={cn('size-2 shrink-0 rounded-full', tone.dot)} aria-hidden="true"></span>
							<span class="truncate">{check.value}</span>
						</p>
						<p
							class="mt-1 min-h-4 truncate text-xs leading-4 text-muted-foreground"
							title={check.detail}
						>
							{check.detail ?? ''}
						</p>
					</li>
				{/each}
			</ul>
		</Panel>
	</div>
{/if}
