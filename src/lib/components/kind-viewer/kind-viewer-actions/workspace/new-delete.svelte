<script lang="ts">
	import { Trash2Icon } from '@lucide/svelte';
	import type { FormValue, Schema } from '@sjsf/form';
	import { SubmitButton } from '@sjsf/form';
	import Ajv from 'ajv';
	import lodash from 'lodash';

	import Form from '$lib/components/dynamic-form/form.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Item from '$lib/components/ui/item';

	// const transport: Transport = getContext('transport');
	// const resourceClient = createClient(ResourceService, transport);

	// const cluster = $derived(page.params.cluster ?? page.params.scope ?? '');

	const schema = {
		type: 'object',
		required: ['name'],
		properties: {
			apiVersion: {
				type: 'string'
			},
			kind: {
				type: 'string'
			},
			name: {
				title: 'Name',
				description: 'description',
				type: 'string',
				pattern: 'enyao'
			}
		}
	} as Schema;

	// Validation
	const jsonSchemaValidator = new Ajv({
		allErrors: true
	});
	const validate = jsonSchemaValidator.compile(schema);

	// Container for Data.
	let values: any = $state({
		apiVersion: 'tenant.otterscale.io/v1alpha1',
		kind: 'Workspace',
		name: ''
	});

	// Flag for Dialog
	let open = $state(false);
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="destructive" size="icon">
				<Trash2Icon />
			</Button>
		{/snippet}
	</AlertDialog.Trigger>
	<AlertDialog.Content class="max-h-[95vh] min-w-[38vw] overflow-auto">
		<Item.Root class="p-0">
			<Item.Content class="text-left">
				<Item.Title class="text-xl">Workspace</Item.Title>
				<Item.Description>description</Item.Description>
			</Item.Content>
		</Item.Root>
		<Form
			schema={lodash.get(schema, 'properties.name') as any}
			uiSchema={{
				'ui:options': {
					help: 'help'
				}
			}}
			initialValue={'' as FormValue}
			bind:values={values['name']}
			handleSubmit={{
				posthook: () => {
					const isValid = validate(values);
					console.log(isValid, validate.errors, values);
				}
			}}
			class="**:data-[slot=dynamic-form-mode-controller]:hidden"
		>
			{#snippet actions()}
				<SubmitButton />
			{/snippet}
		</Form>
	</AlertDialog.Content>
</AlertDialog.Root>
