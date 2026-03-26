<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';

	import type { WidgetDefinition } from './types';

	let {
		widgets,
		prometheusDriver,
		cluster,
		start,
		end,
		isReloading = $bindable()
	}: {
		widgets: WidgetDefinition[];
		prometheusDriver: PrometheusDriver;
		cluster: string;
		start?: Date;
		end?: Date;
		isReloading: boolean;
	} = $props();
</script>

{#each widgets as widget (widget.key)}
	{@const Component = widget.component}
	{@const props = widget.props ?? {}}
	<div class={widget.class}>
		<Component
			{prometheusDriver}
			bind:isReloading
			{...start != null && end != null ? { start, end } : {}}
			{...widget.needsCluster ? { cluster } : {}}
			{...props}
		/>
	</div>
{/each}
