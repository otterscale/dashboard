<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';

	import type { WidgetDefinition } from './types';

	let {
		widgets,
		prometheusDriver,
		cluster,
		namespace,
		start,
		end,
		endIsNow = false,
		isReloading = $bindable()
	}: {
		widgets: WidgetDefinition[];
		prometheusDriver: PrometheusDriver;
		cluster: string;
		namespace?: string;
		start?: Date;
		end?: Date;
		endIsNow?: boolean;
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
			{...start != null && end != null ? { start, end, endIsNow } : {}}
			{...widget.needsCluster ? { cluster } : {}}
			{...widget.needsNamespace ? { namespace } : {}}
			{...props}
		/>
	</div>
{/each}
