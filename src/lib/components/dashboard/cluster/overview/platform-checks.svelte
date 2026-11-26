<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { PrometheusDriver } from 'prometheus-query';
	import { getContext, onDestroy, onMount } from 'svelte';

	import { page } from '$app/state';
	import { Panel, type Tone, TONE_DOT, TONE_TEXT } from '$lib/components/dashboard/kit';
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
		if (isReloading) {
			source.start();
		} else {
			source.stop();
		}
	});
	onMount(() => {
		// Starting the poll already read them; read here only while auto update is off.
		if (!isReloading) void source.refresh();
	});
	onDestroy(() => {
		source.stop();
	});

	const TITLES: Record<CheckId, () => string> = {
		modules: m.check_title_modules,
		backup: m.check_title_backup,
		certificates: m.check_title_certificates,
		notifications: m.check_title_notifications,
		license: m.license
	};
	// The dashboards' one status scale; a check that cannot be judged is neither good nor bad.
	const TONE: Record<CheckState, Tone> = {
		ok: 'ok',
		warning: 'warn',
		critical: 'bad',
		none: 'muted',
		unknown: 'muted'
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
			<!-- Cells on a 1px border-coloured ground: the gaps draw the dividers at any column count.
			     Wide, one column per check however many an edition has; two across, the last of an
			     odd number takes the whole row so no empty cell shows the ground. -->
			<ul
				class="grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border @md/panel:grid-cols-2 @4xl/panel:auto-cols-fr @4xl/panel:grid-flow-col @4xl/panel:grid-cols-none"
			>
				{#each source.checks ?? [] as check (check.id)}
					{@const tone = TONE[check.state]}
					<li
						class="min-w-0 bg-card px-3.5 py-3 @md/panel:last:odd:col-span-2 @4xl/panel:last:odd:col-span-1"
					>
						<p class="truncate text-xs leading-4 text-muted-foreground">{TITLES[check.id]()}</p>
						<p
							class={cn(
								'mt-1.5 flex items-center gap-2 text-base leading-6 font-[450] tabular-nums',
								TONE_TEXT[tone]
							)}
						>
							<span class={cn('size-2 shrink-0 rounded-full', TONE_DOT[tone])} aria-hidden="true"
							></span>
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
