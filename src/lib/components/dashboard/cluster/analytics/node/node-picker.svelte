<script lang="ts">
	import {
		type Config,
		createForm,
		type FieldPath,
		type Schema,
		setFormContext,
		type UiOption
	} from '@sjsf/form';
	import type { PrometheusDriver } from 'prometheus-query';
	import { onMount } from 'svelte';
	import { get, writable } from 'svelte/store';

	import * as defaults from '$lib/components/dynamic-form/defaults';
	import ComboboxWidget, {
		type ComboboxEnumeration
	} from '$lib/components/dynamic-form/widgets/combobox.svelte';
	import { m } from '$lib/messages';

	// `selectedNode` holds the node_exporter `instance` value (e.g. `host:9100`) — the form the
	// per-node `node_*` charts filter on. The dropdown shows the friendly `nodename` as its label.
	let {
		prometheusDriver,
		selectedNode = $bindable()
	}: { prometheusDriver: PrometheusDriver; selectedNode: string | undefined } = $props();

	type InstanceOption = { value: string; label: string };
	const instanceOptions = writable<InstanceOption[]>([]);

	let isLoaded = $state(false);

	const schema: Schema = {
		type: 'object',
		properties: {
			picker: { type: 'string', title: ' ' }
		}
	};

	const form = createForm<{ picker: string | undefined }>({
		...defaults,
		schema,
		initialValue: { picker: undefined }
	});
	setFormContext(form);

	const pickerPath = ['picker'] as unknown as FieldPath;

	const config: Config = $derived({
		path: pickerPath,
		title: ' ',
		schema: { type: 'string' },
		uiSchema: {
			'ui:options': {
				TailoredComboboxEnumerations: async (): Promise<ComboboxEnumeration[]> =>
					get(instanceOptions) as ComboboxEnumeration[],
				TailoredComboboxVisibility: 50,
				TailoredComboboxEmptyText: m.no_result(),
				TailoredComboboxInput: { placeholder: '' },
				TailoredComboboxPopoverClass: 'w-full min-w-[200px] max-w-md'
			}
		},
		required: false
	});

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
			// Default to the "All Nodes" sentinel so the picker shows a label instead of an
			// empty box; Section B treats `.*` as "no node drilled in" and keeps its placeholder.
			if (selectedNode === undefined && instances.length > 0) {
				selectedNode = '.*';
			}
		} catch {
			instanceOptions.set([]);
			selectedNode = undefined;
		}
		isLoaded = true;
	});
</script>

{#if isLoaded && $instanceOptions.length > 0}
	<ComboboxWidget
		type="widget"
		bind:value={selectedNode}
		{config}
		handlers={{}}
		options={[]}
		errors={[]}
		uiOption={(() => undefined) as UiOption}
	/>
{/if}
