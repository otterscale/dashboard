<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { ScalingIcon } from '@lucide/svelte';
	import { RuntimeService } from '@otterscale/api/runtime/v1';
	import type { FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
	import { SubmitButton } from '@sjsf/form';
	import Ajv from 'ajv';
	import lodash from 'lodash';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';

	import Form from '$lib/components/dynamic-form/form.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Item from '$lib/components/ui/item';

	let {
		cluster,
		namespace,
		group,
		version,
		kind,
		resource,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		namespace: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		object: any;
		onOpenChangeComplete?: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const client = createClient(RuntimeService, transport);

	const name: string = $derived(object?.metadata?.name ?? '');
	const currentReplicas: number = $derived(object?.spec?.replicas ?? 1);

	const jsonSchema = {
		type: 'object',
		required: ['replicas'],
		properties: {
			replicas: {
				title: 'Replicas',
				type: 'integer',
				minimum: 0
			}
		}
	} as Schema;

	const jsonSchemaValidator = new Ajv({
		allErrors: true,
		strict: true
	});
	const validate = jsonSchemaValidator.compile(jsonSchema);

	let values: any = $state({
		replicas: 0
	});

	let open = $state(false);
	let isScaling = $state(false);

	function handleScale() {
		if (isScaling) return;
		isScaling = true;

		toast.promise(
			async () => {
				const response = await client.scale({
					cluster,
					namespace,
					group,
					version,
					resource,
					name,
					replicas: values.replicas
				});
				return response;
			},
			{
				loading: `Scaling ${kind.toLowerCase()} ${name} to ${values.replicas} replicas...`,
				success: (response) => {
					return `Successfully scaled ${kind.toLowerCase()} ${name} to ${response.replicas} replicas`;
				},
				error: (error) => {
					console.error(`Failed to scale ${kind.toLowerCase()} ${name}:`, error);
					return `Failed to scale ${kind.toLowerCase()} ${name}: ${(error as ConnectError).message}`;
				},
				finally() {
					isScaling = false;
					open = false;
				}
			}
		);
	}
</script>

<AlertDialog.Root
	bind:open
	{onOpenChangeComplete}
	onOpenChange={(isOpen) => {
		if (isOpen) {
			values.replicas = currentReplicas;
		}
	}}
>
	<AlertDialog.Trigger>
		{#snippet child({ props })}
			<Item.Root {...props} class="w-full p-0 text-xs" size="sm">
				<Item.Media>
					<ScalingIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>Scale</Item.Title>
				</Item.Content>
			</Item.Root>
		{/snippet}
	</AlertDialog.Trigger>
	<AlertDialog.Content class="max-h-[95vh] min-w-[23vw] overflow-auto">
		<Item.Root class="p-0">
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold">Scale {kind}</Item.Title>
				<Item.Description>
					Adjust the number of replicas for <strong>{name}</strong> in namespace
					<strong>{namespace}</strong>. Current replicas: <strong>{currentReplicas}</strong>.
				</Item.Description>
			</Item.Content>
		</Item.Root>
		<Form
			schema={lodash.get(jsonSchema, 'properties.replicas') as any}
			uiSchema={{
				'ui:options': {
					help: 'Enter the desired number of replicas.'
				}
			} as UiSchemaRoot}
			initialValue={currentReplicas as FormValue}
			bind:values={values['replicas']}
			handleSubmit={{
				posthook: () => {
					if (isScaling) return;

					// Validate entire form or single field manually? The ajv schema covers the object
					// values object looks like: { replicas: 3 }
					const isValid = validate(values);
					if (!isValid) return;

					handleScale();
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
