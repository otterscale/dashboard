<script lang="ts">
	import { Plus } from '@lucide/svelte';
	import type { FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
	import { SubmitButton } from '@sjsf/form';
	import type { SchemaObjectValue } from '@sjsf/form/core';
	import Ajv from 'ajv';
	import lodash from 'lodash';
	import { stringify } from 'yaml';

	import * as Code from '$lib/components/custom/code';
	import Form from '$lib/components/dynamic-form/form.svelte';
	import { toVersionedJSONSchema } from '$lib/components/dynamic-form/utils.svelte';
	import ComboboxWidget from '$lib/components/dynamic-form/widgets/combobox.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	let {
		schema: apiSchema
	}: {
		schema?: any;
	} = $props();

	const schema = $derived(toVersionedJSONSchema(apiSchema));

	// const transport: Transport = getContext('transport');
	// const resourceClient = createClient(ResourceService, transport);

	// const cluster = $derived(page.params.cluster ?? page.params.scope ?? '');

	// Validation
	const jsonSchemaValidator = new Ajv({
		allErrors: true,
		formats: {
			int64: true,
			'date-time': true
		}
	});
	const validate = jsonSchemaValidator.compile(schema);
	let values: any = $state({
		metadata: { name: {} },
		spec: { users: {}, resourceQuota: {}, networkIsolation: {} }
	});
	let open = $state(false);

	// TODO: Refactor into Manager.
	const steps = Array.from({ length: 5 }, (_, index) => String(index + 1));
	const [firstStep] = steps;
	let currentStep = $state(firstStep);
	const currentIndex = $derived(steps.indexOf(currentStep));
	function handleNext() {
		currentStep = steps[Math.min(currentIndex + 1, steps.length - 1)];
	}
	function handlePrevious() {
		currentStep = steps[Math.max(currentIndex - 1, 0)];
	}
	function reset() {
		currentStep = firstStep;
	}

	// Users
	interface KeycloakUser {
		id: string;
		username: string;
		email?: string;
		firstName?: string;
		lastName?: string;
	}
	let usernameToIdentifier = $state<Record<string, string>>({});
	async function fetchUsersAsEnumerations(
		search: string
	): Promise<{ label: string; value: string }[]> {
		try {
			const response = await fetch(`/rest/users?search=${encodeURIComponent(search)}`);
			if (response.ok) {
				const fetchedUsers: KeycloakUser[] = await response.json();
				for (const user of fetchedUsers) {
					usernameToIdentifier[user.username] = user.id;
				}
				return fetchedUsers.map((user) => ({
					label: user.username,
					value: user.username
				}));
			} else {
				console.error('Failed to fetch users:', response.statusText);
				return [];
			}
		} catch (error) {
			console.error('Error fetching users:', error);
			return [];
		}
	}
</script>

<Dialog.Root
	bind:open
	onOpenChangeComplete={() => {
		reset();
	}}
>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline" size="icon">
				<Plus />
			</Button>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="max-h-[95vh] min-w-[38vw] overflow-auto">
		<Item.Root class="p-0">
			<Item.Content class="text-left">
				<Item.Title class="text-xl">Workspace</Item.Title>
				<Item.Description>{lodash.get(schema, 'description')}</Item.Description>
			</Item.Content>
		</Item.Root>
		<Tabs.Root bind:value={currentStep} class="*:data-[slot=tabs-content]:min-h-[50vh]">
			<Tabs.Content value={steps[0]}>
				<Form
					schema={{
						...(lodash.get(schema, 'properties.metadata.properties.name') as any),
						title: 'Name'
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						}
					} as UiSchemaRoot}
					initialValue={'workspace' as FormValue}
					handleSubmit={() => {
						handleNext();
					}}
					bind:values={values['metadata']['name']}
				>
					{#snippet actions()}
						<div class="flex w-full items-center justify-between gap-3">
							<Button
								onclick={() => {
									handlePrevious();
								}}
							>
								Previous
							</Button>
							<SubmitButton />
						</div>
					{/snippet}
				</Form>
			</Tabs.Content>
			<Tabs.Content value={steps[1]}>
				<Form
					schema={{
						...lodash.omit(lodash.get(schema, 'properties.spec.properties.users') as any, 'items'),
						title: 'Users',
						items: {
							...lodash.omit(lodash.get(schema, 'properties.spec.properties.users.items') as any, [
								'properties'
							]),
							properties: {
								name: {
									...(lodash.get(
										schema,
										'properties.spec.properties.users.items.properties.name'
									) as any),
									title: 'Name'
								},
								role: {
									...(lodash.get(
										schema,
										'properties.spec.properties.users.items.properties.role'
									) as any)
								}
							}
						}
					} as Schema}
					uiSchema={{
						'ui:options': {
							itemTitle: () => 'User',
							translations: {
								submit: 'Next'
							}
						},
						items: {
							name: {
								'ui:components': {
									stringField: 'enumField',
									selectWidget: ComboboxWidget
								},
								'ui:options': {
									TailoredComboboxEnumerations: fetchUsersAsEnumerations,
									TailoredComboboxVisibility: 10,
									TailoredComboboxInput: {
										placeholder: 'Name'
									},
									TailoredComboboxEmptyText: 'No names available.'
								}
							},
							role: {
								'ui:components': {
									stringField: 'enumField',
									selectWidget: 'comboboxWidget'
								},
								'ui:options': {
									TailoredComboboxVisibility: 10,
									TailoredComboboxInput: {
										placeholder: 'Role'
									},
									TailoredComboboxEmptyText: 'No roles available.'
								}
							}
						}
					} as UiSchemaRoot}
					initialValue={[{ name: 'enyao_chang', role: 'admin' }] as FormValue}
					transformer={(value: FormValue) => {
						let users = value as SchemaObjectValue[];
						users = users.map((user) => ({
							...user,
							subject: usernameToIdentifier[user.name! as string]
						}));
						return users;
					}}
					handleSubmit={() => {
						handleNext();
					}}
					bind:values={values['spec']['users']}
				>
					{#snippet actions()}
						<div class="flex w-full items-center justify-between gap-3">
							<Button
								onclick={() => {
									handlePrevious();
								}}
							>
								Previous
							</Button>
							<SubmitButton />
						</div>
					{/snippet}
				</Form>
			</Tabs.Content>
			<Tabs.Content value={steps[2]}>
				<Form
					schema={{
						...(lodash.omit(
							lodash.get(schema, 'properties.spec.properties.resourceQuota'),
							'properties'
						) as any),
						title: 'Resource Quota',
						properties: {
							hard: {
								...(lodash.get(
									schema,
									'properties.spec.properties.resourceQuota.properties.hard'
								) as any),
								additionalProperties: {
									...(lodash.omit(
										lodash.get(
											schema,
											'properties.spec.properties.resourceQuota.properties.hard.additionalProperties'
										),
										'anyOf'
									) as any),
									type: 'string'
								}
							}
						}
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						},
						hard: {
							'ui:options': {
								layouts: {
									'object-properties': {
										class: 'grid grid-cols-2 gap-3'
									}
								}
							},
							additionalProperties: {
								'ui:options': {
									translations: {
										'key-input-title': 'limit'
									},
									hideTitle: true
								}
							}
						}
					} as UiSchemaRoot}
					initialValue={{
						hard: {
							'requests.cpu': '16',
							'requests.memory': '32Gi',
							'requests.otterscale.com/vgpu': '0'
						}
					} as FormValue}
					handleSubmit={() => {
						handleNext();
					}}
					bind:values={values['spec']['resourceQuota']}
				>
					{#snippet actions()}
						<div class="flex w-full items-center justify-between gap-3">
							<Button
								onclick={() => {
									handlePrevious();
								}}
							>
								Previous
							</Button>
							<SubmitButton />
						</div>
					{/snippet}
				</Form>
			</Tabs.Content>
			<Tabs.Content value={steps[3]}>
				<Form
					schema={{
						...lodash.get(schema, 'properties.spec.properties.networkIsolation'),
						title: 'Network Isolation'
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						}
					} as UiSchemaRoot}
					initialValue={{
						allowedNamespaces: ['namespace'],
						enabled: false
					} as FormValue}
					handleSubmit={() => {
						handleNext();
					}}
					bind:values={values['spec']['networkIsolation']}
				>
					{#snippet actions()}
						<div class="flex w-full items-center justify-between gap-3">
							<Button
								onclick={() => {
									handlePrevious();
								}}
							>
								Previous
							</Button>
							<SubmitButton />
						</div>
					{/snippet}
				</Form>
			</Tabs.Content>
			<Tabs.Content value={steps[4]}>
				<div class="flex h-full flex-col gap-3">
					<Code.Root lang="yaml" class="w-full" hideLines code={stringify(values, null, 2)} />
					<Button
						class="mt-auto w-full"
						onclick={() => {
							lodash.set(values, 'spec.namespace', lodash.get(values, 'metadata.name'));
							const isValid = validate(values);
							console.log(isValid, validate.errors, values);
						}}
					>
						Validation
					</Button>
				</div>
			</Tabs.Content>
		</Tabs.Root>
	</Dialog.Content>
</Dialog.Root>
