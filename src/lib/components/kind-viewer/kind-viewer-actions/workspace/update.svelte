<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import FormIcon from '@lucide/svelte/icons/form';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { TenantOtterscaleIoV1Alpha1Workspace } from '@otterscale/types';
	import type { FormState, FormValue, Schema, SchemaValue, UiSchemaRoot } from '@sjsf/form';
	import { getValueSnapshot, setValue, SubmitButton } from '@sjsf/form';
	import Ajv from 'ajv';
	import { load } from 'js-yaml';
	import lodash from 'lodash';
	import { mode as themeMode } from 'mode-watcher';
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import Monaco from 'svelte-monaco';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

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

	import type { Member } from './create.svelte';

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
		onsuccess,
		open = $bindable(false)
	}: {
		role?: string;
		cluster: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema: Schema;
		object?: TenantOtterscaleIoV1Alpha1Workspace;
		onOpenChangeComplete?: () => void;
		trigger?: Snippet<[Record<string, unknown>]>;
		onsuccess?: (workspace?: TenantOtterscaleIoV1Alpha1Workspace) => void;
		open?: boolean;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const formCount = 3;
	const steps = Array.from({ length: formCount + 1 }, (_, index) => String(index + 1));
	const [firstStep] = steps;

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

	let values = $state(getInitialValues());
	let resourceLimitation = $state(getInitialResourceLimitation());
	let currentStep = $state(firstStep);
	let isSubmitting = $state(false);
	let membersFormReference = $state(null);

	let value = $derived.by(() => {
		const filtered = lodash.cloneDeep(values);
		if (filtered.metadata) {
			const metadata = filtered.metadata as Record<string, unknown>;
			for (const field of systemFields) {
				delete metadata[field];
			}
		}
		return stringify(filtered);
	});
	const currentIndex = $derived(steps.indexOf(currentStep));

	function getInitialValues() {
		return {
			apiVersion: `${group}/${version}`,
			kind: kind,
			metadata: lodash.get(object, 'metadata', {}),
			spec: {
				members: lodash.get(object, 'spec.members', []),
				networkIsolation: lodash.get(object, 'spec.networkIsolation', { enabled: false }),
				...(lodash.has(object, 'spec.resourceQuota')
					? { resourceQuota: lodash.get(object, 'spec.resourceQuota') }
					: {})
			}
		};
	}
	function getInitialResourceLimitation() {
		return {
			unlimit: !lodash.has(object, 'spec.resourceQuota.hard'),
			hard: lodash.get(object, 'spec.resourceQuota.hard', {
				'requests.cpu': '16',
				'requests.memory': '32Gi',
				'requests.nvidia.com/gpu': '0',
				'requests.nvidia.com/gpumem': '0',
				'limits.cpu': '16',
				'limits.memory': '32Gi',
				'limits.nvidia.com/gpu': '0',
				'limits.nvidia.com/gpumem': '0'
			})
		};
	}

	function initiate() {
		values = getInitialValues();
		resourceLimitation = getInitialResourceLimitation();
		currentStep = firstStep;
		isSubmitting = false;
	}

	function handleNext() {
		currentStep = steps[Math.min(currentIndex + 1, steps.length - 1)];
	}

	function handlePrevious() {
		currentStep = steps[Math.max(currentIndex - 1, 0)];
	}

	function isServiceAccount(username?: string): boolean | undefined {
		return username?.startsWith('service-account-');
	}
</script>

<Dialog.Root
	bind:open
	onOpenChangeComplete={(isOpen) => {
		onOpenChangeComplete?.();
		if (!isOpen) {
			initiate();
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
			<Tabs.Content value={steps[0]}>
				<Form
					bind:reference={membersFormReference}
					schema={{
						...lodash.omit(
							lodash.get(jsonSchema, 'properties.spec.properties.members') as Schema,
							'items'
						),
						title: 'Members',
						items: {
							...lodash.omit(
								lodash.get(jsonSchema, 'properties.spec.properties.members.items') as Schema,
								['properties']
							),
							properties: {
								subject: {
									...(lodash.get(
										jsonSchema,
										'properties.spec.properties.members.items.properties.subject'
									) as Schema),
									title: 'Identifier'
								},
								role: {
									...(lodash.get(
										jsonSchema,
										'properties.spec.properties.members.items.properties.role'
									) as Schema),
									title: 'Role'
								},
								name: {
									...(lodash.get(
										jsonSchema,
										'properties.spec.properties.members.items.properties.name'
									) as Schema),
									title: 'Name',
									readOnly: true
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
							},
							name: {
								'ui:options': {
									layouts: {
										'field-content': {
											class:
												'[&_input]:read-only:bg-muted [&>input]:read-only:focus-visible:ring-0 [&_input]:read-only:focus-visible:ring-offset-0 [&_input]:read-only:focus-visible:border-input [&_input]:read-only:read-only:cursor-default'
										}
									},
									shadcn4Text: {
										placeholder: 'Derived by Identifier'
									}
								}
							},
							role: {
								'ui:components': {
									stringField: 'enumField',
									selectWidget: 'comboboxWidget'
								}
							},
							subject: {
								'ui:components': {
									stringField: 'enumField',
									selectWidget: UserComboboxWidget
								},
								'ui:options': {
									TailoredUserComboboxVisibility: 10,
									TailoredUserComboboxOnSelect: (user: KeycloakUser) => {
										if (membersFormReference) {
											const members = getValueSnapshot(membersFormReference) as unknown as Member[];
											setValue(
												membersFormReference,
												members.map((member) => {
													if (member.subject !== user.id) return member;

													return {
														subject: member.subject,
														role: member.role,
														username: user.name,
														name: getDisplayName(user),
														serviceAccount: isServiceAccount(user.username)
													};
												})
											);
										}
									}
								}
							}
						}
					} as UiSchemaRoot}
					initialValue={lodash.get(values, 'spec.members') as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['spec']['members']}
				>
					{#snippet actions()}
						<div class="flex w-full items-center justify-end gap-3">
							<SubmitButton />
						</div>
					{/snippet}
				</Form>
			</Tabs.Content>

			<Tabs.Content value={steps[1]}>
				<Form
					schema={{
						...lodash.omit(
							lodash.get(jsonSchema, 'properties.spec.properties.networkIsolation') as Schema,
							['properties']
						),
						title: 'Network Isolation',
						properties: {
							allowedNamespaces: {
								title: 'Allowed Namespaces',
								...(lodash.get(
									jsonSchema,
									'properties.spec.properties.networkIsolation.properties.allowedNamespaces'
								) as Schema)
							},
							...(lodash.omit(
								lodash.get(
									jsonSchema,
									'properties.spec.properties.networkIsolation.properties'
								) as Schema,
								['allowedNamespaces']
							) as Record<string, Schema>)
						}
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
					initialValue={lodash.get(values, 'spec.networkIsolation') as FormValue}
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

			<Tabs.Content value={steps[2]}>
				{@const editable = role === 'Cluster Admin'}
				<Form
					schema={{
						...lodash.omit(
							lodash.get(jsonSchema, 'properties.spec.properties.resourceQuota') as Schema,
							['properties']
						),
						title: 'Resource Quota',
						properties: {
							unlimit: {
								title: 'Unlimited',
								type: 'boolean'
							}
						},
						allOf: [
							{
								if: {
									properties: {
										unlimit: { const: false }
									}
								},
								then: {
									properties: {
										hard: {
											title: 'Hard',
											...lodash.omit(
												lodash.get(
													jsonSchema,
													'properties.spec.properties.resourceQuota.properties.hard'
												) as Schema,
												['additionalProperties']
											),
											properties: {
												'requests.cpu': {
													title: 'CPU Request',
													type: 'string',
													readOnly: !editable
												},
												'requests.memory': {
													title: 'Memory Request',
													type: 'string',
													readOnly: !editable
												},
												'requests.nvidia.com/gpu': {
													title: 'GPU Device Request',
													type: 'string',
													readOnly: !editable
												},
												'requests.nvidia.com/gpumem': {
													title: 'GPU Memory Request',
													type: 'string',
													readOnly: !editable
												},
												'limits.cpu': {
													title: 'CPU Limit',
													type: 'string',
													readOnly: !editable
												},
												'limits.memory': {
													title: 'Memory Limit',
													type: 'string',
													readOnly: !editable
												},
												'limits.nvidia.com/gpu': {
													title: 'GPU Device Limit',
													type: 'string',
													readOnly: !editable
												},
												'limits.nvidia.com/gpumem': {
													title: 'GPU Memory Limit',
													type: 'string',
													readOnly: !editable
												}
											}
										}
									},
									required: ['hard']
								}
							}
						]
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
										class:
											'grid grid-cols-2 gap-3 [&_input]:read-only:focus-visible:ring-0 [&_input]:read-only:focus-visible:ring-offset-0 [&_input]:read-only:focus-visible:border-input [&_input]:read-only:cursor-default'
									}
								}
							}
						}
					} as UiSchemaRoot}
					initialValue={resourceLimitation}
					handleSubmit={{
						posthook: (form: FormState<FormValue>) => {
							handleNext();

							const formValue = getValueSnapshot(form);

							const isUnlimit = lodash.get(formValue, 'unlimit', undefined);
							if (isUnlimit) {
								lodash.unset(values, ['spec', 'resourceQuota']);
								lodash.unset(values, ['spec', 'limitRange']);
							} else {
								lodash.set(values, ['spec', 'resourceQuota'], {
									hard: lodash.get(formValue, 'hard', {
										'requests.cpu': '16',
										'requests.memory': '32Gi',
										'requests.nvidia.com/gpu': '0',
										'requests.nvidia.com/gpumem': '0',
										'limits.cpu': '16',
										'limits.memory': '32Gi',
										'limits.nvidia.com/gpu': '0',
										'limits.nvidia.com/gpumem': '0'
									})
								});
								lodash.set(values, ['spec', 'limitRange'], {
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
							}
						}
					}}
					bind:values={resourceLimitation}
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

			<Tabs.Content value={steps[formCount]} class="min-h-[77vh]">
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
						theme={themeMode.current === 'dark' ? 'vs-dark' : 'vs-light'}
					/>
					<div class="mt-auto flex items-center justify-between gap-3">
						<Button
							onclick={() => {
								handlePrevious();
							}}
						>
							Previous
						</Button>
						<Button
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
										loading: `Updating ${kind} ${name}...`,
										success: () => {
											onsuccess?.(values as TenantOtterscaleIoV1Alpha1Workspace);
											return `Successfully updated ${kind} ${name}`;
										},
										error: (error) => {
											console.error(`Failed to update ${kind} ${name}:`, error);
											return `Failed to update ${kind} ${name}: ${lodash.get(error, 'message')}`;
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
				</div>
			</Tabs.Content>
		</Tabs.Root>
	</Dialog.Content>
</Dialog.Root>
