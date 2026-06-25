<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import {
		type Config,
		createForm,
		type FieldPath,
		type Schema,
		setFormContext,
		type UiOption
	} from '@sjsf/form';
	import { PrometheusDriver } from 'prometheus-query';
	import { getContext } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { get, writable } from 'svelte/store';

	import * as defaults from '$lib/components/dynamic-form/defaults';
	import ComboboxWidget, {
		type ComboboxEnumeration
	} from '$lib/components/dynamic-form/widgets/combobox.svelte';
	import { m } from '$lib/paraglide/messages';
	import { encodeStandaloneModelId, escapePromqlStringLiteral } from '$lib/prometheus';

	let {
		cluster,
		namespace,
		prometheusDriver,
		selectedModel = $bindable()
	}: {
		cluster: string | undefined;
		namespace: string | undefined;
		prometheusDriver?: PrometheusDriver | null;
		selectedModel: string | undefined;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	type ModelOption = { value: string; label: string };
	const modelOptions = writable<ModelOption[]>([]);

	function nameFromResourceItem(item: { object?: unknown }): string {
		const obj = item.object as Record<string, unknown> | undefined;
		const meta = obj?.metadata as Record<string, unknown> | undefined;
		const name = meta?.name;
		return typeof name === 'string' ? name : '';
	}

	let isLoaded = $state(false);

	/** Discover standalone models (no `llm_inference_service` label) via Prometheus. */
	async function fetchStandaloneModels(ns: string): Promise<ModelOption[]> {
		if (!prometheusDriver) return [];
		const nsSel = ns ? `namespace="${escapePromqlStringLiteral(ns)}",` : '';
		const query = `group by(model_name) (vllm:kv_cache_usage_perc{${nsSel}llm_inference_service=""})`;
		try {
			const response = await prometheusDriver.instantQuery(query);
			const names = new SvelteSet<string>();
			for (const v of response.result) {
				const name = (v.metric.labels as Record<string, string>).model_name;
				if (name) names.add(name);
			}
			return [...names]
				.sort((a, b) => a.localeCompare(b))
				.map((name) => {
					const shown = name.length > 28 ? name.slice(0, 25) + '...' : name;
					return { value: encodeStandaloneModelId(name), label: `${shown} · ${m.standalone()}` };
				});
		} catch (error) {
			console.error('Failed to list standalone models for analytics picker:', error);
			return [];
		}
	}

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
					get(modelOptions) as ComboboxEnumeration[],
				TailoredComboboxVisibility: 50,
				TailoredComboboxEmptyText: m.no_result(),
				TailoredComboboxInput: { placeholder: '' },
				TailoredComboboxPopoverClass: 'w-full min-w-[200px] max-w-md'
			}
		},
		required: false
	});

	/** Re-fetch when cluster or workspace (namespace) changes — not only on first mount. */
	$effect(() => {
		const clusterId = (cluster ?? '').trim();
		const ns = (namespace ?? '').trim();
		let cancelled = false;

		(async () => {
			isLoaded = false;
			const modelNames = new SvelteSet<string>();

			if (clusterId) {
				try {
					const response = await resourceClient.list({
						cluster: clusterId,
						group: 'serving.kserve.io',
						version: 'v1alpha2',
						resource: 'llminferenceservices',
						namespace: ns
					});
					for (const item of response.items) {
						const name = nameFromResourceItem(item);
						if (name) modelNames.add(name);
					}
				} catch (error) {
					console.error('Failed to list LLMInferenceServices for analytics picker:', error);
				}
			}

			const standaloneModels = await fetchStandaloneModels(ns);

			if (cancelled) return;

			const managedModels: ModelOption[] = [...modelNames]
				.sort((a, b) => a.localeCompare(b))
				.map((name) => ({
					value: name,
					label: name.length > 40 ? name.slice(0, 37) + '...' : name
				}));

			const models = [...managedModels, ...standaloneModels];
			const options = models.length > 0 ? [{ value: '.*', label: m.all_models() }, ...models] : [];
			modelOptions.set(options);
			selectedModel = models.length > 0 ? options[0]!.value : '.*';
			isLoaded = true;
		})();

		return () => {
			cancelled = true;
		};
	});
</script>

{#if isLoaded && $modelOptions.length > 0}
	<ComboboxWidget
		type="widget"
		bind:value={selectedModel}
		{config}
		handlers={{}}
		options={[]}
		errors={[]}
		uiOption={(() => undefined) as UiOption}
	/>
{/if}
