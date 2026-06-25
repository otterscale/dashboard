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
	import { m } from '$lib/paraglide/messages';

	// `.*` is the "all namespaces" sentinel, matching the analytics filter convention.
	let {
		prometheusDriver,
		selectedNamespace = $bindable()
	}: { prometheusDriver: PrometheusDriver; selectedNamespace: string | undefined } = $props();

	type NamespaceOption = { value: string; label: string };
	const namespaceOptions = writable<NamespaceOption[]>([]);

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
					get(namespaceOptions) as ComboboxEnumeration[],
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
			const response = await prometheusDriver.instantQuery('group by (namespace) (kube_pod_info)');
			const series = (response.result ?? []) as { metric: { labels: Record<string, string> } }[];
			const namespaces = [
				...new Set(series.map((s) => s.metric?.labels?.namespace).filter(Boolean))
			].sort((a, b) => a.localeCompare(b));
			const options: NamespaceOption[] = namespaces.map((ns) => ({ value: ns, label: ns }));
			if (options.length > 0) {
				options.unshift({ value: '.*', label: m.all_namespaces() });
			}
			namespaceOptions.set(options);
			// Default to the "All Namespaces" sentinel so the picker shows a label instead of an
			// empty box; Section B treats `.*` as "no namespace drilled in" and keeps its placeholder.
			if (selectedNamespace === undefined && options.length > 0) {
				selectedNamespace = '.*';
			}
		} catch {
			namespaceOptions.set([]);
			selectedNamespace = undefined;
		}
		isLoaded = true;
	});
</script>

{#if isLoaded && $namespaceOptions.length > 0}
	<ComboboxWidget
		type="widget"
		bind:value={selectedNamespace}
		{config}
		handlers={{}}
		options={[]}
		errors={[]}
		uiOption={(() => undefined) as UiOption}
	/>
{/if}
