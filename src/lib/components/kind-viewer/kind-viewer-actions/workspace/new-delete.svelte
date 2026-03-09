<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { Trash2Icon } from '@lucide/svelte';
	import type { TenantOtterscaleIoV1Alpha1Workspace } from '@otterscale/types';
	import type { FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
	import { SubmitButton } from '@sjsf/form';
	import Ajv from 'ajv';
	import lodash from 'lodash';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { resolve } from '$app/paths';
	import { ResourceService } from '$lib/api/resource/v1/resource_pb';
	import Form from '$lib/components/dynamic-form/form.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Item from '$lib/components/ui/item';

	let {
		cluster,
		group,
		version,
		kind,
		resource,
		schema,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema?: any;
		object: TenantOtterscaleIoV1Alpha1Workspace;
		onOpenChangeComplete: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const jsonSchema = {
		type: 'object',
		required: ['name'],
		properties: {
			name: {
				title: 'Name',
				type: 'string',
				pattern: object?.metadata?.name
			}
		}
	} as Schema;

	// Validation
	const jsonSchemaValidator = new Ajv({
		allErrors: true,
		strict: true
	});
	const validate = jsonSchemaValidator.compile(jsonSchema);

	// Container for Data.
	let values: any = $state({
		name: ''
	});

	// Flags
	let open = $state(false);
	let isDeleting = $state(false);
</script>

<AlertDialog.Root bind:open {onOpenChangeComplete}>
	<AlertDialog.Trigger>
		{#snippet child({ props })}
			<Item.Root {...props} class="w-full p-0 text-xs **:text-destructive" size="sm">
				<Item.Media>
					<Trash2Icon />
				</Item.Media>
				<Item.Content>
					<Item.Title>Delete</Item.Title>
				</Item.Content>
			</Item.Root>
		{/snippet}
	</AlertDialog.Trigger>
	<AlertDialog.Content class="max-h-[95vh] min-w-[23vw] overflow-auto">
		<Item.Root class="p-0">
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold">{kind}</Item.Title>
				<Item.Description>{lodash.get(schema, 'description')}</Item.Description>
			</Item.Content>
		</Item.Root>
		<Form
			schema={lodash.get(jsonSchema, 'properties.name') as any}
			uiSchema={{
				'ui:options': {
					help: 'Entering the workspace name.',
					shadcn4Text: {
						placeholder: object.metadata?.name
					}
				}
			} as UiSchemaRoot}
			initialValue={'' as FormValue}
			bind:values={values['name']}
			handleSubmit={{
				posthook: () => {
					if (isDeleting) return;
					isDeleting = true;

					const isValid = validate(values);
					if (!isValid) return;

					const name = values.name as string;

					// console.log(isValid, validate.errors, values);
					toast.promise(
						async () => {
							await resourceClient.delete({
								cluster,
								group,
								version,
								resource,
								name
							});
						},
						{
							loading: `Deleting workspace ${name}...`,
							success: () => {
								// Use window.location.href to force a full page reload and re-trigger fetchWorkspaces
								window.location.href = resolve(`/(auth)/scope/${cluster}`);
								return `Successfully deleted workspace ${name}`;
							},
							error: (error) => {
								console.error(`Failed to delete workspace ${name}:`, error);
								return `Failed to delete workspace ${name}: ${(error as ConnectError).message}`;
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
	</AlertDialog.Content>
</AlertDialog.Root>
