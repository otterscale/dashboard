<script lang="ts">
	import { PrometheusDriver } from 'prometheus-query';

	import { WidgetGrid } from '$lib/components/custom/widget-grid';

	import { widgets } from './widgets';

	let {
		cluster,
		prometheusDriver,
		isReloading = $bindable()
	}: {
		cluster: string;
		prometheusDriver: PrometheusDriver;
		isReloading: boolean;
	} = $props();
</script>

<div class="grid auto-rows-auto grid-cols-2 gap-5 md:grid-cols-4 lg:grid-cols-12">
	<WidgetGrid {widgets} {prometheusDriver} {cluster} bind:isReloading />
</div>
