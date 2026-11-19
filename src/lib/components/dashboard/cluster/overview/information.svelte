<script lang="ts">
	import InfoIcon from '@lucide/svelte/icons/info';
	import type { PrometheusDriver } from 'prometheus-query';

	import { useLoadable } from '$lib/components/dashboard/shared/loadable.svelte';
	import StatCard from '$lib/components/dashboard/shared/stat-card.svelte';
	import { m } from '$lib/messages';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	const build = useLoadable(
		async () => {
			const response = await prometheusDriver.instantQuery(
				`kubernetes_build_info{job="apiserver"}`
			);
			const labels = response.result[0]?.metric?.labels as Record<string, string> | undefined;
			const version = labels?.git_version;
			return version ? { version, platform: labels?.platform } : null;
		},
		() => isReloading
	);

	// `v1.35.8+rke2r1` may break after the `+`, and nowhere else unless it has to.
	const versionParts = $derived.by(() => {
		const version = build.data?.version ?? '';
		const plus = version.indexOf('+');
		return plus < 0 ? [version, ''] : [version.slice(0, plus + 1), version.slice(plus + 1)];
	});
</script>

<StatCard label={m.information()} icon={InfoIcon} status={build.status} stale={build.stale}>
	<!-- One run of text: the only thing between the two halves is a break opportunity. -->
	<span class="min-w-0 font-mono text-lg leading-6 [overflow-wrap:anywhere]"
		>{versionParts[0]}<wbr />{versionParts[1]}</span
	>
	{#snippet detail()}
		<span class="[overflow-wrap:anywhere]">{build.data?.platform ?? ''}</span>
	{/snippet}
</StatCard>
