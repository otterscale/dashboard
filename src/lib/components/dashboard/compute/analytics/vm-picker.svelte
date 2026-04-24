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
	import { SvelteSet } from 'svelte/reactivity';
	import { get, writable } from 'svelte/store';

	import * as defaults from '$lib/components/dynamic-form/defaults';
	import ComboboxWidget, {
		type ComboboxEnumeration
	} from '$lib/components/dynamic-form/widgets/combobox.svelte';
	import { m } from '$lib/paraglide/messages';

	let {
		prometheusDriver,
		namespace,
		selectedVM = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		namespace: string | undefined;
		selectedVM: string | undefined;
	} = $props();

	type VMOption = { value: string; label: string };
	const vmOptions = writable<VMOption[]>([]);

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
					get(vmOptions) as ComboboxEnumeration[],
				TailoredComboboxVisibility: 50,
				TailoredComboboxEmptyText: m.no_result(),
				TailoredComboboxInput: { placeholder: '' },
				TailoredComboboxPopoverClass: 'w-full min-w-[200px] max-w-md'
			}
		},
		required: false
	});

	/** Re-fetch when namespace changes — not only on first mount. */
	$effect(() => {
		const ns = namespace;
		let cancelled = false;

		(async () => {
			isLoaded = false;
			try {
				const response = await prometheusDriver.instantQuery(
					`kubevirt_vmi_info{` + (ns ? `exported_namespace="${ns}"` : '') + `}`
				);
				if (cancelled) return;
				const series = (response.result ?? []) as {
					metric: { labels: Record<string, string> };
				}[];
				const seen = new SvelteSet<string>();
				const options: VMOption[] = [];
				for (const s of series) {
					const labels = s.metric?.labels ?? {};
					const name = labels['name'] ?? labels['vmi'] ?? '';
					if (name && !seen.has(name)) {
						seen.add(name);
						options.push({ value: name, label: name });
					}
				}
				options.sort((a, b) => a.label.localeCompare(b.label));
				if (options.length > 0) {
					options.push({ value: '.*', label: m.all_vms() });
				}
				vmOptions.set(options);
				selectedVM = options[0]?.value;
			} catch {
				if (cancelled) return;
				vmOptions.set([]);
				selectedVM = undefined;
			}
			isLoaded = true;
		})();

		return () => {
			cancelled = true;
		};
	});
</script>

{#if isLoaded && $vmOptions.length > 0}
	<ComboboxWidget
		type="widget"
		bind:value={selectedVM}
		{config}
		handlers={{}}
		options={[]}
		errors={[]}
		uiOption={(() => undefined) as UiOption}
	/>
{/if}
