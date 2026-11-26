<script lang="ts">
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import type { PrometheusDriver } from 'prometheus-query';

	import { NUM, Panel } from '$lib/components/dashboard/kit';
	import * as Card from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import { checkAge, isReminder, shownLevel } from './ceph';
	import { fmtAge, fmtPct } from './format';
	import { describeCheck, errorImpact } from './health-checks';
	import { LAYOUT } from './layout';
	import { InstantPoll } from './poll.svelte';
	import { CHECK_STEP, CHECK_WINDOW, HEALTH_QUERIES } from './queries';
	import { byLabel, first } from './vectors';

	// The Ceph health state (Healthy, Needs attention, Error) and, beside it, the checks Ceph
	// raises right now that need action, in words. Laid out as Cluster Status's state card and
	// Needs attention card: the same heights, type and marks. Configuration reminders (weak key types, one
	// copy on a one-disk cluster) are only counted, and do not colour the state. One request.
	let { client, isReloading = $bindable() }: { client: PrometheusDriver; isReloading: boolean } =
		$props();

	const poll = new InstantPoll(() => client, HEALTH_QUERIES);
	$effect(() => poll.run(isReloading));

	const status = $derived(first(poll.data, 'status'));
	const cardState = $derived(poll.state(() => status !== undefined));

	const allChecks = $derived.by(() => {
		const data = poll.data;
		if (!data) return [];
		const now = first(data, 'now') ?? Date.now() / 1000;
		const cleared = byLabel(data, 'cleared', 'name');
		const firstActive = byLabel(data, 'firstActive', 'name');
		// The fullest OSD, for the checks that name one.
		const used = byLabel(data, 'osdUsed', 'ceph_daemon');
		const total = byLabel(data, 'osdTotal', 'ceph_daemon');
		let osd: { id: string; pct: string } | undefined;
		let worst = -1;
		for (const [id, size] of total) {
			const pct = size > 0 ? (100 * (used.get(id) ?? 0)) / size : -1;
			if (pct > worst) {
				worst = pct;
				osd = { id, pct: fmtPct(pct) };
			}
		}
		const fullRatio = first(data, 'fullRatio');
		const context = { osd, full: fullRatio === undefined ? undefined : fmtPct(fullRatio * 100) };
		return (data.checks ?? [])
			.map((vector) => {
				const labels = vector.metric.labels as Record<string, string>;
				const code = labels.name ?? '';
				const age = checkAge(
					now,
					CHECK_WINDOW,
					CHECK_STEP,
					cleared.get(code),
					firstActive.get(code)
				);
				return {
					code,
					error: labels.severity === 'HEALTH_ERR',
					age,
					...describeCheck(code, context)
				};
			})
			.sort((a, b) => Number(b.error) - Number(a.error) || a.age.seconds - b.age.seconds);
	});

	const checks = $derived(allChecks.filter((check) => !isReminder(check)));
	const reminders = $derived(allChecks.filter(isReminder));
	const level = $derived(shownLevel(status, allChecks));
	const tone = $derived(cardState !== 'ready' ? 'default' : level);
	const headline = $derived(
		level === 'err'
			? m.storage_health_err()
			: level === 'warn'
				? m.storage_health_warn()
				: m.storage_health_ok()
	);
	// Ceph's own status stays in view, so the card never hides what `ceph health` says.
	const code = $derived(status === 2 ? 'HEALTH_ERR' : status === 1 ? 'HEALTH_WARN' : 'HEALTH_OK');
	const errors = $derived(checks.filter((check) => check.error).length);
	const warnings = $derived(checks.length - errors);
	const sentence = $derived.by(() => {
		const impact = errorImpact(checks.map((c) => c.code));
		if (impact === 'unfound') return m.storage_health_line_unfound();
		if (level === 'ok') return m.storage_health_line_ok();
		if (level === 'warn') return m.storage_health_line_warn();
		if (impact === 'unavailable') return m.storage_health_line_unavailable();
		if (impact === 'full') return m.storage_health_line_full();
		return m.storage_health_line_err();
	});
	const pill = $derived(
		cn(
			'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs whitespace-nowrap slashed-zero tabular-nums',
			tone === 'warn'
				? 'bg-attention-foreground/10 text-attention-foreground'
				: tone === 'ok'
					? 'bg-card/60 text-mint-foreground'
					: 'bg-card/60 text-foreground'
		)
	);
	const muted = $derived(
		tone === 'warn'
			? 'text-attention-muted'
			: tone === 'ok'
				? 'text-mint-foreground/75'
				: tone === 'err'
					? 'text-foreground/70'
					: 'text-muted-foreground'
	);
</script>

<div class={LAYOUT.health}>
	<Card.Root
		class={cn(
			'h-full min-h-[11.5rem] justify-between gap-6 rounded-2xl p-4 shadow-(--card-frame) ring-0 @md:px-5 @md:py-[1.125rem]',
			tone === 'warn' &&
				'bg-attention text-attention-foreground shadow-none dark:shadow-(--card-frame)',
			tone === 'ok' && 'bg-mint text-mint-foreground shadow-none',
			tone === 'err' && 'bg-destructive/10 shadow-none dark:ring-1 dark:ring-destructive/30'
		)}
		aria-live="polite"
	>
		<div class="min-w-0">
			<p class={cn('text-xs leading-4 font-[450]', muted)}>{m.storage_ceph_health()}</p>
			{#if cardState === 'loading'}
				<Skeleton class="mt-2 h-11 w-44" />
				<Skeleton class="mt-2 h-4 w-40" />
			{:else if cardState === 'error' || cardState === 'empty'}
				<p class="mt-3 text-[1.75rem] leading-8 text-muted-foreground" aria-hidden="true">—</p>
				<p class="text-xs leading-4 text-muted-foreground">
					{cardState === 'error' ? m.dashboard_couldnt_load() : m.no_data_display()}
				</p>
			{:else}
				<p
					class={cn(
						'mt-1 flex items-center gap-3 text-[2.5rem] leading-[2.75rem] font-[350] tracking-tight',
						tone === 'err' && 'text-destructive'
					)}
				>
					<span
						class={cn(
							'size-3 shrink-0 rounded-full',
							level === 'err' ? 'bg-destructive' : level === 'warn' ? 'bg-chart-1' : 'bg-chart-2'
						)}
						aria-hidden="true"
					></span>
					{headline}
				</p>
				<p class={cn('mt-1 text-sm leading-5', muted)}>{sentence}</p>
			{/if}
		</div>
		<!-- Ceph's own status, then the checks that need action by severity. -->
		<div class="flex min-h-6 flex-wrap gap-1.5">
			{#if cardState === 'ready'}
				<span class={cn(pill, 'font-mono text-[11px] tracking-wide')}>{code}</span>
				{#if checks.length === 0}
					<span class={pill}>
						<span class="size-2 rounded-full bg-chart-2" aria-hidden="true"></span>
						{m.storage_no_important_checks()}
					</span>
				{:else}
					{#if errors > 0}
						<span class={pill}>
							<span class="size-2 rounded-full bg-destructive" aria-hidden="true"></span>
							{errors}
							{m.alert_severity_critical()}
						</span>
					{/if}
					{#if warnings > 0}
						<span class={pill}>
							<span class="size-2 rounded-full bg-chart-1" aria-hidden="true"></span>
							{warnings}
							{m.alert_severity_warning()}
						</span>
					{/if}
				{/if}
			{/if}
		</div>
	</Card.Root>
</div>

<div class={LAYOUT.checks}>
	<Panel
		title={m.storage_health_checks()}
		tooltip={m.storage_health_checks_tooltip()}
		state={cardState === 'loading' ? 'ready' : cardState}
		class="min-h-[11.5rem]"
	>
		{#snippet badge()}
			{#if cardState === 'ready'}
				<span
					class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs text-muted-foreground {NUM}"
				>
					{checks.length}
				</span>
			{/if}
		{/snippet}
		{#if cardState === 'loading'}
			<div class="flex gap-3 py-2.5" aria-hidden="true">
				<Skeleton class="mt-0.5 size-4 rounded-full" />
				<div class="flex-1 space-y-1.5">
					<Skeleton class="h-4 w-56" />
					<Skeleton class="h-3 w-full max-w-md" />
				</div>
			</div>
		{:else if checks.length === 0}
			<div class="flex flex-1 items-center gap-3 py-2">
				<CircleCheckIcon class="size-6 shrink-0 text-chart-2" aria-hidden="true" />
				<div class="min-w-0">
					{#if reminders.length > 0}
						<p class="text-sm leading-5 font-[550]">{m.storage_no_important_checks()}</p>
					{:else}
						<p class="text-sm leading-5 font-[550]">{m.storage_no_health_checks()}</p>
						<p class="text-[0.8125rem] leading-5 text-muted-foreground">
							{m.storage_no_health_checks_detail()}
						</p>
					{/if}
				</div>
			</div>
		{:else}
			<!-- Long lists scroll inside the card so the state card beside it keeps its height. -->
			<ul class="-mx-1 max-h-[17.5rem] overflow-y-auto px-1">
				{#each checks as check (check.code)}
					<li class="flex gap-3 border-b py-2.5 last:border-b-0">
						{#if check.error}
							<CircleXIcon class="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
						{:else}
							<TriangleAlertIcon class="mt-0.5 size-4 shrink-0 text-chart-1" aria-hidden="true" />
						{/if}
						<div class="min-w-0 flex-1">
							<p class="text-sm leading-5 font-[550] break-words">
								<span class="sr-only">{check.error ? 'HEALTH_ERR' : 'HEALTH_WARN'}:</span>
								{check.title}
							</p>
							<p class="text-[0.8125rem] leading-5 break-words text-muted-foreground">
								{check.description}
							</p>
							<p class="mt-0.5 font-mono text-[11px] leading-4 text-muted-foreground">
								{check.code}
							</p>
						</div>
						<span
							class={cn('shrink-0 text-xs leading-5 whitespace-nowrap text-muted-foreground', NUM)}
						>
							{fmtAge(check.age.seconds, check.age.atLeast)}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
		{#if cardState === 'ready' && reminders.length > 0}
			<Tooltip.Root>
				<Tooltip.Trigger
					class="mt-auto w-fit pt-2 text-left text-xs leading-5 text-muted-foreground underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					{reminders.length === 1
						? m.storage_reminders_hidden_one()
						: m.storage_reminders_hidden({ count: String(reminders.length) })}
				</Tooltip.Trigger>
				<Tooltip.Content side="top" align="start" class="max-w-sm">
					<p>{m.storage_reminders_tooltip()}</p>
					<ul class="mt-1.5 font-mono text-[11px] leading-4">
						{#each reminders as reminder (reminder.code)}
							<li>{reminder.code}</li>
						{/each}
					</ul>
				</Tooltip.Content>
			</Tooltip.Root>
		{/if}
	</Panel>
</div>
