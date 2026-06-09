<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import ArrowUpCircleIcon from '@lucide/svelte/icons/arrow-up-circle';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { HelmToolkitFluxcdIoV2HelmRelease } from '@otterscale/types';
	import type { FormState, FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
	import { getValueSnapshot, SubmitButton } from '@sjsf/form';
	import type { Row } from '@tanstack/table-core';
	import { type ValidateFunction } from 'ajv';
	import { JSON_SCHEMA, load } from 'js-yaml';
	import lodash from 'lodash';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import Form from '$lib/components/dynamic-form/form.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';

	import type { ModuleAttribute } from '../table-layout';
	import { type ModuleType } from '../types';

	let {
		row,
		cluster,
		schema,
		validate,
		onOpenChangeComplete
	}: {
		row: Row<Record<ModuleAttribute, JsonValue>>;
		cluster: string;
		schema?: Schema;
		validate?: ValidateFunction;
		onOpenChangeComplete: () => void;
	} = $props();

	const group = 'helm.toolkit.fluxcd.io';
	const version = 'v2';
	const kind = 'HelmRelease';
	const resource = 'helmreleases';
	const namespace = 'otterscale-system';

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const module = $derived(row.original.chart as unknown as ModuleType);
	const versions = $derived(
		module.versions.map((moduleVersion) => moduleVersion.version).filter(Boolean)
	);
	const latestVersion = $derived(module.version);

	let values = $state(getInitialValues());
	let open = $state(false);
	let isSubmitting = $state(false);

	const jsonSchema = $derived({
		type: 'object',
		required: ['version'],
		properties: {
			version: {
				title: 'Version',
				type: 'string',
				enum: versions.length > 0 ? versions : [latestVersion]
			}
		}
	} as Schema);

	function getInitialValues() {
		return { version: latestVersion };
	}

	function initiate() {
		values = { version: latestVersion };
		isSubmitting = false;
	}
</script>

<Dialog.Root
	bind:open
	onOpenChangeComplete={(isOpen) => {
		onOpenChangeComplete?.();

		if (isOpen) return;

		initiate();
	}}
>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Item.Root {...props} class="w-full p-0 text-xs" size="sm">
				<Item.Media>
					<ArrowUpCircleIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>Upgrade</Item.Title>
				</Item.Content>
			</Item.Root>
		{/snippet}
	</Dialog.Trigger>

	<Dialog.Content class="max-h-[95vh] overflow-auto" onInteractOutside={(e) => e.preventDefault()}>
		<Dialog.Header>
			<Item.Root class="p-0">
				<Item.Content class="text-left">
					<Item.Title class="text-xl font-bold">Upgrade</Item.Title>
					<Item.Description>
						{module.description}
					</Item.Description>
				</Item.Content>
			</Item.Root>
		</Dialog.Header>

		<Form
			schema={jsonSchema}
			uiSchema={{
				'ui:options': {
					layouts: {
						'object-properties': {
							class: 'gap-3'
						}
					}
				},
				version: {
					'ui:options': {
						help: 'Select a Version'
					},
					'ui:components': {
						stringField: 'enumField',
						selectWidget: 'comboboxWidget'
					}
				}
			} as UiSchemaRoot}
			initialValue={getInitialValues() as FormValue}
			bind:values
			handleSubmit={{
				posthook: (form: FormState<FormValue>) => {
					if (isSubmitting || !schema || !validate) return;
					isSubmitting = true;

					const formValue = getValueSnapshot(form);

					const name = module.name;
					const targetVersion = formValue
						? lodash.get(formValue, 'version')
						: (latestVersion as string);

					toast.promise(
						async () => {
							const response = await resourceClient.get({
								cluster,
								namespace,
								name,
								group,
								version,
								resource
							});

							const helmRelease: HelmToolkitFluxcdIoV2HelmRelease = lodash.cloneDeep(
								response.object ?? {}
							);
							lodash.set(helmRelease, ['spec', 'chart', 'spec', 'version'], targetVersion);
							const manifest = stringify(helmRelease, { schema: 'yaml-1.1' });

							let isValid: boolean | undefined = undefined;
							try {
								isValid = validate(load(manifest, { schema: JSON_SCHEMA }));
							} catch (error) {
								console.error(`Failed to parse HelmRelease manifest for ${name}:`, error);
								throw new Error(`Invalid YAML for ${name}.`);
							}
							if (!isValid) {
								console.error(`Validation errors for ${name}:`, validate.errors);
								throw new Error(`Validation failed for ${name}.`);
							}

							await resourceClient.update({
								cluster,
								namespace,
								group,
								version,
								resource,
								name,
								manifest: new TextEncoder().encode(manifest),
								fieldManager: 'otterscale-web-ui'
							});
						},
						{
							loading: `Upgrading ${kind} ${name} to ${targetVersion}…`,
							success: () => `Successfully upgraded ${kind} ${name} to ${targetVersion}`,
							error: (error) => {
								console.error(`Failed to upgrade ${kind} ${name}:`, error);
								return `Failed to upgrade ${kind} ${name}: ${(error as ConnectError).message}`;
							},
							finally() {
								isSubmitting = false;
								open = false;
							}
						}
					);
				}
			}}
			class="**:data-[slot=dynamic-form-mode-controller]:hidden"
		>
			{#snippet actions()}
				<div class="*:w-full">
					<SubmitButton />
				</div>
			{/snippet}
		</Form>
	</Dialog.Content>
</Dialog.Root>
