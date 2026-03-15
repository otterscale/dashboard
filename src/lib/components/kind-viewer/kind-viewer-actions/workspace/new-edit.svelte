<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { PencilIcon } from '@lucide/svelte';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
	import { SubmitButton } from '@sjsf/form';
	import type { SchemaObjectValue } from '@sjsf/form/core';
	import Ajv from 'ajv';
	import lodash from 'lodash';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import * as Code from '$lib/components/custom/code';
	import Form from '$lib/components/dynamic-form/form.svelte';
	import ComboboxWidget from '$lib/components/dynamic-form/widgets/combobox.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Item from '$lib/components/ui/item';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';

	let {
		cluster,
		group,
		version,
		kind,
		resource,
		schema: jsonSchema,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema?: any;
		object?: any;
		onOpenChangeComplete: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	// Validation
	const jsonSchemaValidator = new Ajv({
		allErrors: true,
		strict: false
	});
	const validate = jsonSchemaValidator.compile(jsonSchema);

	// Container for Data.
	let values: any = $state({
		apiVersion: group ? `${group}/${version}` : version,
		kind,
		spec: { members: {}, resourceQuota: {}, networkIsolation: {} }
	});

	// TODO: Refactor into StepsManager.
	const steps = Array.from({ length: 4 }, (_, index) => String(index + 1));
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

	// TODO: Refactor into UserManager
	// Users
	interface KeycloakUser {
		id: string;
		username: string;
		email?: string;
		firstName?: string;
		lastName?: string;
	}
	let usernameToKeycloakUser = $state<Record<string, KeycloakUser>>({});
	let timer: ReturnType<typeof setTimeout> | null = null;
	function fetchUsersAsEnumerations(search: string): Promise<{ label: string; value: string }[]> {
		return new Promise((resolve) => {
			if (timer) clearTimeout(timer);

			timer = setTimeout(async () => {
				try {
					const response = await fetch(`/rest/users?search=${encodeURIComponent(search)}`);
					if (response.ok) {
						const fetchedUsers: KeycloakUser[] = await response.json();
						for (const user of fetchedUsers) {
							usernameToKeycloakUser[user.username] = user;
						}
						resolve(
							fetchedUsers.map((user) => ({
								label:
									((user.firstName ?? '') + ' ' + (user.lastName ?? '')).trim() || user.username,
								value: user.username
							}))
						);
					} else {
						console.error('Failed to fetch users:', response.statusText);
						resolve([]);
					}
				} catch (error) {
					console.error('Error fetching users:', error);
					resolve([]);
				}
			}, 300);
		});
	}
	function getKeycloakUser(username: string): KeycloakUser | undefined {
		return usernameToKeycloakUser[username];
	}

	// Flag for Dialog
	let open = $state(false);
	let isSubmitting = $state(false);
</script>

<AlertDialog.Root
	bind:open
	onOpenChangeComplete={() => {
		onOpenChangeComplete?.();
		reset();
	}}
>
	<AlertDialog.Trigger>
		{#snippet child({ props })}
			<Item.Root {...props} class="w-full p-0 text-xs" size="sm">
				<Item.Media>
					<PencilIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>Edit</Item.Title>
				</Item.Content>
			</Item.Root>
		{/snippet}
	</AlertDialog.Trigger>
	<AlertDialog.Content class="max-h-[95vh] min-w-[38vw] overflow-auto">
		<Item.Root class="p-0">
			<Progress value={currentIndex + 1} max={steps.length} />
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold">{kind}</Item.Title>
				<Item.Description>{lodash.get(jsonSchema, 'description')}</Item.Description>
			</Item.Content>
		</Item.Root>
		<Tabs.Root value={currentStep} class="*:data-[slot=tabs-content]:min-h-[50vh]">
			<Tabs.Content value={steps[0]}>
				<Form
					schema={{
						...lodash.omit(
							lodash.get(jsonSchema, 'properties.spec.properties.members') as any,
							'items'
						),
						title: 'Members',
						items: [
							{
								...lodash.omit(
									lodash.get(jsonSchema, 'properties.spec.properties.members.items') as any,
									['properties', 'required']
								),
								required: [
									...(lodash.get(
										jsonSchema,
										'properties.spec.properties.members.items.required'
									) as any),
									'name'
								],
								properties: {
									name: {
										...(lodash.get(
											jsonSchema,
											'properties.spec.properties.members.items.properties.name'
										) as any),
										title: 'Name',
										readOnly: true
									},
									role: {
										...(lodash.get(
											jsonSchema,
											'properties.spec.properties.members.items.properties.role'
										) as any),
										title: 'Role',
										readOnly: true
									}
								}
							}
						],
						additionalItems: {
							...lodash.omit(
								lodash.get(jsonSchema, 'properties.spec.properties.members.items') as any,
								['properties', 'required']
							),
							required: [
								...(lodash.get(
									jsonSchema,
									'properties.spec.properties.members.items.required'
								) as any),
								'name'
							],
							properties: {
								name: {
									...(lodash.get(
										jsonSchema,
										'properties.spec.properties.members.items.properties.name'
									) as any),
									title: 'Name'
								},
								role: {
									...(lodash.get(
										jsonSchema,
										'properties.spec.properties.members.items.properties.role'
									) as any),
									title: 'Role'
								}
							}
						}
					} as Schema}
					uiSchema={{
						'ui:options': {
							itemTitle: () => 'Member',
							translations: {
								submit: 'Next',
								'add-array-item': 'Add Member'
							}
						},
						items: {
							'ui:options': {
								layouts: {
									'object-properties': {
										class: 'grid grid-cols-2 gap-3'
									}
								}
							}
						},
						additionalItems: {
							'ui:options': {
								layouts: {
									'object-properties': {
										class: 'grid grid-cols-2 gap-3'
									}
								}
							},
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
									disabledEnumValues: ['admin']
								}
							}
						}
					} as UiSchemaRoot}
					initialValue={[...lodash.get(object, 'spec.members')] as FormValue}
					transformer={(value: FormValue) => {
						let members = value as SchemaObjectValue[];
						members = members.map((member) => {
							const keycloakUser = getKeycloakUser(member.name as string);
							return {
								...member,
								subject: member.subject ?? keycloakUser?.id ?? null,
								username: member.username ?? keycloakUser?.username ?? null
							};
						});
						return members;
					}}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['spec']['members']}
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
						...(lodash.omit(
							lodash.get(jsonSchema, 'properties.spec.properties.resourceQuota'),
							'properties'
						) as any),
						title: 'Resource Quota',
						properties: {
							hard: {
								...(lodash.get(
									jsonSchema,
									'properties.spec.properties.resourceQuota.properties.hard'
								) as any),
								additionalProperties: {
									...(lodash.omit(
										lodash.get(
											jsonSchema,
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
								},
								translations: {
									'additional-property': 'additional resource',
									'add-object-property': 'Add Limit'
								},
								additionalPropertyKey: (key: string, attempt: number) => {
									const index = attempt + 1;
									switch (index) {
										case 1: {
											return `1st ${key}`;
										}
										case 2: {
											return `2nd ${key}`;
										}
										case 3: {
											return `3rd ${key}`;
										}
										default: {
											return `${index}th ${key}`;
										}
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
						...lodash.get(object, 'spec.resourceQuota')
					} as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
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
			<Tabs.Content value={steps[2]}>
				<Form
					schema={{
						...lodash.get(jsonSchema, 'properties.spec.properties.networkIsolation'),
						title: 'Network Isolation'
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						},
						allowedNamespaces: {
							'ui:options': {
								itemTitle: () => 'Allowed Namespace',
								layouts: {
									'array-items': {
										class: 'grid grid-cols-2 gap-3'
									}
								},
								translations: {
									'add-array-item': 'Add Namespace'
								}
							}
						}
					} as UiSchemaRoot}
					initialValue={{
						...lodash.get(object, 'spec.networkIsolation')
					} as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
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
			<Tabs.Content value={steps[3]}>
				<div class="flex h-full flex-col gap-3">
					<Code.Root lang="yaml" class="w-full" hideLines code={stringify(values, null, 2)} />
					<Button
						class="mt-auto w-full"
						onclick={() => {
							if (isSubmitting) return;

							isSubmitting = true;

							const isValid = validate(values);

							if (!isValid) {
								console.error(`Validation errors: ${JSON.stringify(validate.errors)}`);
								toast.error('Validation failed. Please check the YAML.');
								isSubmitting = false;
								return;
							}

							const name = lodash.get(object, 'metadata.name');

							toast.promise(
								async () => {
									const manifest = new TextEncoder().encode(JSON.stringify(values));

									await resourceClient.apply({
										cluster,
										name,
										group,
										version,
										resource,
										manifest,
										fieldManager: 'otterscale-web-ui',
										force: true
									});
								},
								{
									loading: `Editing workspace ${name}...`,
									success: () => {
										return `Successfully edited workspace ${name}`;
									},
									error: (error) => {
										console.error(`Failed to edit workspace ${name}:`, error);
										return `Failed to edit workspace ${name}: ${(error as ConnectError).message}`;
									},
									finally() {
										isSubmitting = false;
										open = false;
									}
								}
							);
						}}
					>
						Edit
					</Button>
				</div>
			</Tabs.Content>
		</Tabs.Root>
	</AlertDialog.Content>
</AlertDialog.Root>
