<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { Plus } from '@lucide/svelte';
	import type { FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
	import { SubmitButton } from '@sjsf/form';
	import type { SchemaObjectValue } from '@sjsf/form/core';
	import Ajv from 'ajv';
	import lodash from 'lodash';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import { page } from '$app/state';
	import { ResourceService } from '$lib/api/resource/v1/resource_pb';
	import * as Code from '$lib/components/custom/code';
	import Form from '$lib/components/dynamic-form/form.svelte';
	import { toVersionedJSONSchema } from '$lib/components/dynamic-form/utils.svelte';
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
		schema
	}: {
		cluster: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema?: any;
	} = $props();

	const jsonSchema = $derived(toVersionedJSONSchema(schema));

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	// Validation
	const jsonSchemaValidator = new Ajv({
		allErrors: true,
		// Registe unknown formats of json schema for validation
		formats: {
			int64: true,
			'date-time': true
		}
	});
	const validate = jsonSchemaValidator.compile(jsonSchema);

	// Container for Data.
	let values: any = $state({
		apiVersion: group ? `${group}/${version}` : version,
		kind,
		metadata: { name: {} },
		spec: { namespace: {}, members: {}, resourceQuota: {}, networkIsolation: {} }
	});

	// TODO: Refactor into StepsManager.
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

	// TODO: Refactor into UserManager
	// Users
	interface KeycloakUser {
		id: string;
		username: string;
		email?: string;
		firstName?: string;
		lastName?: string;
	}
	let usernameToIdentifier = $state<Record<string, string>>({});
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
							usernameToIdentifier[user.username] = user.id;
						}
						resolve(
							fetchedUsers.map((user) => ({
								label: user.username,
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
	function getIdentifier(username: string): string | undefined {
		return usernameToIdentifier[username];
	}

	// Flag for Dialog
	let open = $state(false);
	let isSubmitting = $state(false);
</script>

<AlertDialog.Root
	bind:open
	onOpenChangeComplete={() => {
		reset();
	}}
>
	<AlertDialog.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline" size="icon">
				<Plus />
			</Button>
		{/snippet}
	</AlertDialog.Trigger>
	<AlertDialog.Content class="max-h-[95vh] min-w-[38vw] overflow-auto">
		<Item.Root class="p-0">
			<Progress value={currentIndex + 1} max={steps.length} />
			<Item.Content class="text-left">
				<Item.Title class="text-xl">Workspace</Item.Title>
				<Item.Description>{lodash.get(jsonSchema, 'description')}</Item.Description>
			</Item.Content>
		</Item.Root>
		<Tabs.Root value={currentStep} class="*:data-[slot=tabs-content]:min-h-[50vh]">
			<Tabs.Content value={steps[0]}>
				<Form
					schema={{
						...(lodash.get(jsonSchema, 'properties.metadata.properties.name') as any),
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
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
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
					initialValue={[
						// From login user information.
						{ name: page.data.user.name, role: 'admin', subject: page.data.user.sub }
					] as FormValue}
					transformer={(value: FormValue) => {
						let members = value as SchemaObjectValue[];
						members = members.map((member) => ({
							...member,
							subject: member.subject ?? getIdentifier(member.name! as string) ?? null
						}));
						return members;
					}}
					handleSubmit={{
						prehook: () => {
							lodash.set(values, 'spec.namespace', lodash.get(values, 'metadata.name'));
						},
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
			<Tabs.Content value={steps[2]}>
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
						hard: {
							'requests.cpu': '16',
							'requests.memory': '32Gi',
							'requests.otterscale.com/vgpu': '0'
						}
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
			<Tabs.Content value={steps[3]}>
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
						enabled: false
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
			<Tabs.Content value={steps[4]}>
				<div class="flex h-full flex-col gap-3">
					<Code.Root lang="yaml" class="w-full" hideLines code={stringify(values, null, 2)} />
					<Button
						class="mt-auto w-full"
						onclick={() => {
							if (isSubmitting) return;

							isSubmitting = true;

							const isValid = validate(values);

							if (!isValid) {
								throw Error(`Validation errors: ${JSON.stringify(validate.errors)}`);
							}

							toast.promise(
								async () => {
									const manifest = new TextEncoder().encode(JSON.stringify(values));

									console.log(stringify(values, null, 2));

									await resourceClient.create({
										cluster,
										group,
										version,
										resource,
										manifest
									});
								},
								{
									loading: `Creating workspace ${lodash.get(jsonSchema, 'metadata.name')}...`,
									success: () => {
										return `Successfully created workspace ${lodash.get(jsonSchema, 'metadata.name')}`;
									},
									error: (error) => {
										console.error('Failed to create workspace:', error);
										return `Failed to create workspace: ${(error as ConnectError).message}`;
									},
									finally() {
										isSubmitting = false;
										open = false;
									}
								}
							);
						}}
					>
						Validate
					</Button>
				</div>
			</Tabs.Content>
		</Tabs.Root>
	</AlertDialog.Content>
</AlertDialog.Root>
