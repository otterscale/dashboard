<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import FormIcon from '@lucide/svelte/icons/form';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { FormState, FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
	import { getValueSnapshot, SubmitButton } from '@sjsf/form';
	import type { SchemaObjectValue } from '@sjsf/form/core';
	import Ajv from 'ajv';
	import { load } from 'js-yaml';
	import lodash from 'lodash';
	import { mode as themeMode } from 'mode-watcher';
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import Monaco from 'svelte-monaco';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import { page } from '$app/state';
	import Form from '$lib/components/dynamic-form/form.svelte';
	import UserComboboxWidget, {
		getDisplayName,
		type KeycloakUser
	} from '$lib/components/dynamic-form/widgets/user-combobox.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';

	let {
		role,
		cluster,
		group,
		version,
		kind,
		resource,
		schema: jsonSchema,
		object,
		onOpenChangeComplete,
		trigger,
		onsuccess
	}: {
		role?: string;
		cluster: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema: any;
		object?: any;
		onOpenChangeComplete?: () => void;
		trigger?: Snippet<[Record<string, any>]>;
		onsuccess?: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	// Container for Data.
	let values: any = $state({});

	const systemFields = [
		'clusterName',
		'creationTimestamp',
		'deletionGracePeriodSeconds',
		'deletionTimestamp',
		'finalizers',
		'generateName',
		'generation',
		'initializers',
		'managedFields',
		'ownerReferences',
		'resourceVersion',
		'relationships',
		'selfLink',
		'state',
		'uid'
	];

	let value = $derived.by(() => {
		const filtered = lodash.cloneDeep(values);
		if (filtered.metadata) {
			for (const field of systemFields) {
				delete filtered.metadata[field];
			}
		}
		return stringify(filtered);
	});

	const forms = [
		{
			schema: {
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
						...(lodash.get(jsonSchema, 'properties.spec.properties.members.items.required') as any),
						'name'
					],
					properties: {
						// For user friendly, use subject to identifier user and render username.
						subject: {
							...(lodash.get(
								jsonSchema,
								'properties.spec.properties.members.items.properties.subject'
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
			} as Schema,
			uiSchema: {
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
					subject: {
						'ui:components': {
							stringField: 'enumField',
							selectWidget: UserComboboxWidget
						},
						'ui:options': {
							TailoredUserComboboxVisibility: 10,
							TailoredUserComboboxInput: {
								placeholder: 'Name'
							},
							TailoredUserComboboxEmptyText: 'No names available.',
							TailoredUserComboboxOnFetch: (users: KeycloakUser[]) => {
								for (const user of users) {
									usernameToKeycloakUserBySubject[user.id] = user;
								}
							}
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
			} as UiSchemaRoot,
			initialValue:
				// From login user information.
				(lodash.get(object, 'spec.members') as FormValue) ||
				([
					{
						subject: page.data.user.sub,
						role: 'admin',
						name: page.data.user.name
					}
				] as FormValue),
			transformer: (value: FormValue) => {
				let members = value as SchemaObjectValue[];
				members = members.map((member) => {
					const keycloakUser = getKeycloakUserBySubject(member.subject as string);
					return {
						...member,
						name: getDisplayName(keycloakUser) ?? null,
						serviceAccount: isServiceAccount(keycloakUser?.username),
						username: keycloakUser?.username ?? null
					};
				});
				return members;
			},
			handleSubmit: {
				posthook: (form: FormState<FormValue>) => {
					handleNext();

					const formVale = getValueSnapshot(form);
					lodash.set(values, 'spec.members', formVale);
				}
			}
		},
		{
			schema: {
				...lodash.omit(lodash.get(jsonSchema, 'properties.spec.properties.networkIsolation'), [
					'properties'
				]),
				title: 'Network Isolation',
				properties: {
					allowedNamespaces: {
						title: 'Allowed Namespaces',
						...lodash.get(
							jsonSchema,
							'properties.spec.properties.networkIsolation.properties.allowedNamespaces'
						)
					},
					...lodash.omit(
						lodash.get(jsonSchema, 'properties.spec.properties.networkIsolation.properties'),
						['allowedNamespaces']
					)
				}
			} as Schema,
			uiSchema: {
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
			} as UiSchemaRoot,
			initialValue:
				(lodash.get(object, 'spec.networkIsolation') as FormValue) ||
				({
					enabled: false
				} as FormValue),
			handleSubmit: {
				posthook: (form: FormState<FormValue>) => {
					handleNext();

					const formVale = getValueSnapshot(form);
					lodash.set(values, 'spec.networkIsolation', formVale);
				}
			}
		},
		...[
			{
				schema: {
					...lodash.omit(lodash.get(jsonSchema, 'properties.spec.properties.resourceQuota'), [
						'properties'
					]),
					title: 'Resource Quota',
					properties: {
						hard: {
							title: 'Hard',
							...lodash.omit(
								lodash.get(jsonSchema, 'properties.spec.properties.resourceQuota.properties.hard'),
								['additionalProperties']
							),
							properties: {
								'requests.cpu': {
									title: 'CPU Request',
									type: 'string'
								},
								'requests.memory': {
									title: 'Memory Request',
									type: 'string'
								},
								'requests.nvidia.com/gpu': {
									title: 'GPU Request',
									type: 'string'
								},
								'requests.nvidia.com/gpumem': {
									title: 'GPU Memory Request',
									type: 'string'
								},
								'limits.cpu': {
									title: 'CPU Limit',
									type: 'string'
								},
								'limits.memory': {
									title: 'Memory Limit',
									type: 'string'
								},
								'limits.nvidia.com/gpu': {
									title: 'GPU Limit',
									type: 'string'
								},
								'limits.nvidia.com/gpumem': {
									title: 'GPU Memory Limit',
									type: 'string'
								}
							}
						}
					}
				} as Schema,
				uiSchema: {
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
						}
					}
				} as UiSchemaRoot,
				initialValue: (lodash.get(object, 'spec.resourceQuota') || {
					hard: {
						'requests.cpu': '16',
						'requests.memory': '32Gi',
						'limits.cpu': '16',
						'limits.memory': '32Gi'
					}
				}) as FormValue,
				handleSubmit: {
					posthook: (form: FormState<FormValue>) => {
						handleNext();

						const formVale = getValueSnapshot(form);
						lodash.set(values, 'spec.resourceQuota', formVale);
					}
				}
			}
		].filter(() => role === 'Cluster Admin')
	];

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

	let usernameToKeycloakUserBySubject = $state<Record<string, KeycloakUser>>({});
	function getKeycloakUserBySubject(subject: string): KeycloakUser | undefined {
		return usernameToKeycloakUserBySubject[subject];
	}
	function isServiceAccount(username?: string): boolean | undefined {
		return username?.startsWith('service-account-');
	}

	// Flag for Dialog
	let open = $state(false);
	let isSubmitting = $state(false);
</script>

<Dialog.Root
	bind:open
	onOpenChangeComplete={(isOpen) => {
		onOpenChangeComplete?.();
		if (!isOpen) {
			reset();
		}
	}}
>
	<Dialog.Trigger>
		{#snippet child({ props })}
			{#if trigger}
				{@render trigger(props)}
			{:else}
				<Item.Root {...props} class="w-full p-0 text-xs" size="sm">
					<Item.Media>
						<FormIcon />
					</Item.Media>
					<Item.Content>
						<Item.Title>Update</Item.Title>
					</Item.Content>
				</Item.Root>
			{/if}
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content
		class="max-h-[95vh] min-w-[38vw] overflow-auto"
		onInteractOutside={(e) => e.preventDefault()}
	>
		<Item.Root class="p-0">
			<Progress value={currentIndex + 1} max={steps.length} class="mt-1 mr-6" />
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold">Workspace</Item.Title>
				<Item.Description>{lodash.get(jsonSchema, 'description')}</Item.Description>
			</Item.Content>
		</Item.Root>
		<Tabs.Root value={currentStep}>
			{#each forms as form, index (index)}
				<Tabs.Content value={steps[index]}>
					<Form
						schema={form.schema}
						uiSchema={form.uiSchema}
						initialValue={form.initialValue}
						transformer={form.transformer}
						handleSubmit={form.handleSubmit}
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
			{/each}
			<Tabs.Content value={steps[forms.length]} class="min-h-[77vh]">
				<div class="flex h-full flex-col gap-3">
					<Monaco
						options={{
							language: 'yaml',
							readOnly: true,
							padding: { top: 24 },
							automaticLayout: true,
							folding: true,
							foldingStrategy: 'indentation',
							showFoldingControls: 'always',
							scrollBeyondLastLine: false
						}}
						bind:value
						on:ready={() => {
							lodash.set(values, 'apiVersion', `${group}/${version}`);
							lodash.set(values, 'kind', kind);
							lodash.set(values, 'metadata', lodash.get(object, 'metadata'));
							lodash.set(values, 'spec.resourceQuota', lodash.get(object, 'spec.resourceQuota'));
							lodash.set(values, 'spec.limitRange', {
								limits: [
									{
										type: 'Container',
										default: {
											cpu: '4',
											memory: '8Gi'
										},
										defaultRequest: {
											cpu: '0.5',
											memory: '1Gi'
										}
									}
								]
							});
						}}
						theme={themeMode.current === 'dark' ? 'vs-dark' : 'vs-light'}
					/>
					<Button
						class="mt-auto w-full"
						onclick={() => {
							if (isSubmitting) return;

							isSubmitting = true;

							const jsonSchemaValidator = new Ajv({
								allErrors: true,
								strict: false
							});
							const validate = jsonSchemaValidator.compile(jsonSchema);

							const isValid = validate(load(value));

							if (!isValid) {
								console.error(`Validation errors: ${JSON.stringify(validate.errors)}`);
								toast.error('Validation failed. Please check the YAML.');
								isSubmitting = false;
								return;
							}

							const name = lodash.get(values, 'metadata.name');

							toast.promise(
								async () => {
									const manifest = new TextEncoder().encode(value);

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
									loading: `Creating ${kind} ${name}...`,
									success: () => {
										onsuccess?.();
										return `Successfully created ${kind} ${name}`;
									},
									error: (error) => {
										console.error(`Failed to create ${kind} ${name}:`, error);
										return `Failed to create ${kind} ${name}: ${lodash.get(error, 'message')}`;
									},
									finally() {
										isSubmitting = false;
										open = false;
									}
								}
							);
						}}
					>
						Update
					</Button>
				</div>
			</Tabs.Content>
		</Tabs.Root>
	</Dialog.Content>
</Dialog.Root>
