<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';

	import type { WidgetDefinition } from './types';

	let {
		widgets,
		prometheusDriver,
		cluster,
		isReloading = $bindable()
	}: {
		widgets: WidgetDefinition[];
		prometheusDriver: PrometheusDriver;
		cluster: string;
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
			{...widget.needsCluster ? { cluster } : {}}
			{...props}
		/>
	</div>
{/each}
