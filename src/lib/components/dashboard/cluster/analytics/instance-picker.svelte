<script lang="ts">
	import Monitor from '@lucide/svelte/icons/monitor';
	import type { PrometheusDriver } from 'prometheus-query';
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';

	import { Single as SingleSelect } from '$lib/components/custom/select';
	import { m } from '$lib/paraglide/messages';

	let {
		prometheusDriver,
		selectedInstance = $bindable()
	}: { prometheusDriver: PrometheusDriver; selectedInstance: string | undefined } = $props();

	type InstanceOption = { value: string; label: string };
	const instanceOptions = writable<InstanceOption[]>([]);

	let isLoaded = $state(false);
	onMount(async () => {
		try {
			const response = await prometheusDriver.instantQuery('node_uname_info');
			const series = (response.result ?? []) as { metric: { labels: Record<string, string> } }[];
			const instances: InstanceOption[] = series.map((s) => {
				const labels = s.metric?.labels ?? {};
				const instance = labels.instance ?? '';
				const nodename = labels.nodename ?? instance;
				return { value: instance, label: nodename };
			});
			if (instances.length > 0) {
				instances.push({ value: '.*', label: m.all_nodes() });
			}
			instanceOptions.set(instances);
			selectedInstance = instances[0]?.value;
		} catch {
			instanceOptions.set([]);
			selectedInstance = undefined;
		}
		isLoaded = true;
	});
</script>

{#if isLoaded && $instanceOptions.length > 0}
	<SingleSelect.Root options={instanceOptions} bind:value={selectedInstance}>
		<SingleSelect.Trigger />
		<SingleSelect.Content>
			<SingleSelect.Options>
				<SingleSelect.Input />
				<SingleSelect.List>
					<SingleSelect.Empty>{m.no_result()}</SingleSelect.Empty>
					<SingleSelect.Group>
						{#each $instanceOptions as option (option.value)}
							<SingleSelect.Item {option}>
								<Monitor class="size-5" />
								{option.label}
								<SingleSelect.Check {option} />
							</SingleSelect.Item>
						{/each}
					</SingleSelect.Group>
				</SingleSelect.List>
			</SingleSelect.Options>
		</SingleSelect.Content>
	</SingleSelect.Root>
{/if}
