<script lang="ts">
	import {
		createForm,
		setFormContext,
		type Config,
		type FieldPath,
		type Schema,
		type UiOption
	} from '@sjsf/form';
	import type { PrometheusDriver } from 'prometheus-query';
	import { onMount } from 'svelte';
	import { get, writable } from 'svelte/store';

	import * as defaults from '$lib/components/dynamic-form/defaults';
	import ComboboxWidget, {
		type ComboboxEnumeration
	} from '$lib/components/dynamic-form/widgets/combobox.svelte';
	import { m } from '$lib/paraglide/messages';

	let {
		prometheusDriver,
		selectedInstance = $bindable()
	}: { prometheusDriver: PrometheusDriver; selectedInstance: string | undefined } = $props();

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
				TailoredComboboxEnumerations: async (
					_filter: string
				): Promise<ComboboxEnumeration[]> => get(instanceOptions) as ComboboxEnumeration[],
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
			selectedInstance = instances[0]?.value;
		} catch {
			instanceOptions.set([]);
			selectedInstance = undefined;
		}
		isLoaded = true;
	});
</script>

{#if isLoaded && $instanceOptions.length > 0}
	<ComboboxWidget
		type="widget"
		bind:value={selectedInstance}
		{config}
		handlers={{}}
		options={[]}
		errors={[]}
		uiOption={(() => undefined) as UiOption}
	/>
{/if}
