<script lang="ts" module>
	const jsonSchemaValidator = ajvErrors(
		new Ajv({
			allErrors: true,
			strict: true
		})
	);
</script>

<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
	import { SubmitButton } from '@sjsf/form';
	import type { Row } from '@tanstack/table-core';
	import Ajv from 'ajv';
	import ajvErrors from 'ajv-errors';
	import lodash from 'lodash';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';

	import Form from '$lib/components/dynamic-form/form.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';

	import type { ModuleAttribute } from '../table-layout';
	import type { ModuleType } from '../types';

	let {
		cluster,
		schema,
		row,
		onOpenChangeComplete
	}: {
		cluster: string;
		schema: Schema;
		row: Row<Record<ModuleAttribute, JsonValue>>;
		onOpenChangeComplete: () => void;
	} = $props();

	const group = 'helm.toolkit.fluxcd.io';
	const version = 'v2';
	const kind = 'HelmRelease';
	const resource = 'helmreleases';
	const namespace = 'otterscale-system';

	const module = $derived(row.original.chart as unknown as ModuleType);

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	let values = $state(getInitialValues());
	let open = $state(false);
	let isDeleting = $state(false);

	const jsonSchema = $derived({
		type: 'object',
		required: ['name'],
		properties: {
			name: {
				title: 'Name',
				type: 'string',
				const: module.name,
				errorMessage: `Please enter "${module.name ?? ''}" to confirm.`
			}
		}
	} as Schema);

	function getInitialValues() {
		return { name: '' };
	}

	function initiate() {
		values = getInitialValues();
		isDeleting = false;
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
			<Item.Root {...props} class="w-full p-0 text-xs **:text-destructive" size="sm">
				<Item.Media>
					<Trash2Icon />
				</Item.Media>
				<Item.Content>
					<Item.Title>Uninstall</Item.Title>
				</Item.Content>
			</Item.Root>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content
		class="max-h-[95vh] min-w-[24vw] overflow-auto"
		onInteractOutside={(e) => e.preventDefault()}
	>
		<Item.Root class="p-0">
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold">{kind}</Item.Title>
				<Item.Description>{lodash.get(schema, 'description')}</Item.Description>
			</Item.Content>
		</Item.Root>
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
				name: {
					'ui:options': {
						help: `Entering the ${kind.toLowerCase()} name.`,
						shadcn4Text: {
							placeholder: module.name
						}
					}
				}
			} as UiSchemaRoot}
			initialValue={getInitialValues() as FormValue}
			bind:values
			handleSubmit={{
				posthook: () => {
					if (isDeleting) return;
					isDeleting = true;

					const validate = jsonSchemaValidator.compile(jsonSchema);

					const isValid = validate(values);
					if (!isValid) return;

					const name = values.name as string;

					toast.promise(
						async () => {
							await resourceClient.delete({
								cluster,
								namespace,
								group,
								version,
								resource,
								name
							});
						},
						{
							loading: `Requesting deletion of ${kind.toLowerCase()} ${name}...`,
							success: () => {
								return `Deletion requested for ${kind.toLowerCase()} ${name}`;
							},
							error: (error) => {
								console.error(`Failed to delete ${kind.toLowerCase()} ${name}:`, error);
								return `Failed to delete ${kind.toLowerCase()} ${name}: ${(error as ConnectError).message}`;
							},
							finally() {
								isDeleting = false;
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
