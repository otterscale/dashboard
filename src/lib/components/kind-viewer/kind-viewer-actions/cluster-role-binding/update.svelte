<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import FormIcon from '@lucide/svelte/icons/form';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
	import { SubmitButton } from '@sjsf/form';
	import Ajv from 'ajv';
	import { load } from 'js-yaml';
	import lodash from 'lodash';
	import { mode as themeMode } from 'mode-watcher';
	import { getContext } from 'svelte';
	import Monaco from 'svelte-monaco';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import Form from '$lib/components/dynamic-form/form.svelte';
	import ComboboxWidget from '$lib/components/dynamic-form/widgets/combobox.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Item from '$lib/components/ui/item';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';

	let {
		schema: jsonSchema,
		object,
		cluster,
		group,
		version,
		kind,
		resource,
		onOpenChangeComplete
	}: {
		schema: any;
		object: any;
		cluster: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		onOpenChangeComplete: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	// Container for Data.
	let values: any = $state({
		apiVersion: group ? `${group}/${version}` : version,
		kind,
		roleRef: { name: {} },
		subjectKind: {},
		subjects: {},
		serviceAccount: {}
	});

	// Derived submission values (proper ClusterRoleBinding structure)
	const submissionValues = $derived.by(() => {
		const sk = values.subjectKind as string;
		let subjectEntry;
		switch (sk) {
			case 'Group':
				subjectEntry = {
					kind: 'Group',
					name: values.subjects,
					apiGroup: group || 'rbac.authorization.k8s.io'
				};
				break;
			case 'ServiceAccount':
				subjectEntry = {
					kind: 'ServiceAccount',
					name: values.serviceAccount?.name ?? '',
					namespace: values.serviceAccount?.namespace ?? ''
				};
				break;
			case 'User':
			default:
				subjectEntry = {
					kind: 'User',
					name: getIdentifier(values.subjects as string) ?? values.subjects,
					apiGroup: group || 'rbac.authorization.k8s.io'
				};
				break;
		}
		return {
			apiVersion: group ? `${group}/${version}` : version,
			kind,
			metadata: { name: lodash.get(object, 'metadata.name') },
			roleRef: {
				apiGroup: group || 'rbac.authorization.k8s.io',
				kind: 'ClusterRole',
				name: values.roleRef.name
			},
			subjects: [subjectEntry]
		};
	});

	// Steps (no Name step compared to create)
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

	// Fetch ClusterRoles
	let clusterRoleTimer: ReturnType<typeof setTimeout> | null = null;
	function fetchClusterRolesAsEnumerations(
		search: string
	): Promise<{ label: string; value: string }[]> {
		return new Promise((resolve) => {
			if (clusterRoleTimer) clearTimeout(clusterRoleTimer);
			clusterRoleTimer = setTimeout(async () => {
				try {
					const response = await resourceClient.list({
						cluster,
						group: 'rbac.authorization.k8s.io',
						version: 'v1',
						resource: 'clusterroles'
					});
					const roles = response.items
						.map((item: any) => (item.object as any)?.metadata?.name as string)
						.filter((name: string) => name && name.toLowerCase().includes(search.toLowerCase()));
					resolve(roles.map((name: string) => ({ label: name, value: name })));
				} catch (error) {
					console.error('Error fetching cluster roles:', error);
					resolve([]);
				}
			}, 300);
		});
	}

	// Fetch Users
	interface KeycloakUser {
		id: string;
		username: string;
		email?: string;
		firstName?: string;
		lastName?: string;
	}
	let usernameToIdentifier = $state<Record<string, string>>({});
	let userTimer: ReturnType<typeof setTimeout> | null = null;
	function fetchUsersAsEnumerations(search: string): Promise<{ label: string; value: string }[]> {
		return new Promise((resolve) => {
			if (userTimer) clearTimeout(userTimer);
			userTimer = setTimeout(async () => {
				try {
					const response = await fetch(`/rest/users?search=${encodeURIComponent(search)}`);
					if (response.ok) {
						const fetchedUsers: KeycloakUser[] = await response.json();
						for (const user of fetchedUsers) {
							usernameToIdentifier[user.username] = user.id;
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
	function getIdentifier(username: string): string | undefined {
		return usernameToIdentifier[username];
	}

	// Derived YAML value
	let value = $derived(stringify(submissionValues));

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
			<Item.Root {...props} class="w-full p-0 text-xs" size="sm">
				<Item.Media>
					<FormIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>Update</Item.Title>
				</Item.Content>
			</Item.Root>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="max-h-[95vh] min-w-[38vw] overflow-auto">
		<Item.Root class="p-0">
			<Progress value={currentIndex + 1} max={steps.length} />
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold">ClusterRoleBinding</Item.Title>
				<Item.Description>{lodash.get(jsonSchema, 'description', '')}</Item.Description>
			</Item.Content>
		</Item.Root>
		<Tabs.Root value={currentStep} class="*:data-[slot=tabs-content]:min-h-[50vh]">
			<!-- Step 1: ClusterRole -->
			<Tabs.Content value={steps[0]}>
				<Form
					schema={{
						type: 'string',
						title: 'ClusterRole'
					} as Schema}
					uiSchema={{
						'ui:components': {
							stringField: 'enumField',
							selectWidget: ComboboxWidget
						},
						'ui:options': {
							translations: {
								submit: 'Next'
							},
							TailoredComboboxEnumerations: fetchClusterRolesAsEnumerations,
							TailoredComboboxVisibility: 10,
							TailoredComboboxInput: {
								placeholder: 'Select ClusterRole'
							},
							TailoredComboboxEmptyText: 'No ClusterRoles found.'
						}
					} as UiSchemaRoot}
					initialValue={(lodash.get(object, 'roleRef.name') ?? null) as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['roleRef']['name']}
				>
					{#snippet actions()}
						<div class="flex w-full items-center justify-end gap-3">
							<SubmitButton />
						</div>
					{/snippet}
				</Form>
			</Tabs.Content>
			<!-- Step 2: Subject Kind -->
			<Tabs.Content value={steps[1]}>
				<Form
					schema={{
						type: 'string',
						title: 'Subject Kind',
						enum: ['User', 'Group', 'ServiceAccount']
					} as Schema}
					uiSchema={{
						'ui:components': {
							stringField: 'enumField'
						},
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						}
					} as UiSchemaRoot}
					initialValue={(lodash.get(object, 'subjects[0].kind') ?? 'User') as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['subjectKind']}
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
			<!-- Step 3: Subject Details -->
			<Tabs.Content value={steps[2]}>
				{#if values.subjectKind === 'User'}
					<Form
						schema={{
							type: 'string',
							title: 'User'
						} as Schema}
						uiSchema={{
							'ui:components': {
								stringField: 'enumField',
								selectWidget: ComboboxWidget
							},
							'ui:options': {
								translations: {
									submit: 'Next'
								},
								TailoredComboboxEnumerations: fetchUsersAsEnumerations,
								TailoredComboboxVisibility: 10,
								TailoredComboboxInput: {
									placeholder: 'Search user'
								},
								TailoredComboboxEmptyText: 'No users found.'
							}
						} as UiSchemaRoot}
						initialValue={(lodash.get(object, 'subjects[0].name') ?? null) as FormValue}
						handleSubmit={{
							posthook: () => {
								handleNext();
							}
						}}
						bind:values={values['subjects']}
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
				{:else if values.subjectKind === 'Group'}
					<Form
						schema={{
							type: 'string',
							title: 'Group Name'
						} as Schema}
						uiSchema={{
							'ui:options': {
								translations: {
									submit: 'Next'
								}
							}
						} as UiSchemaRoot}
						initialValue={(lodash.get(object, 'subjects[0].name') ?? null) as FormValue}
						handleSubmit={{
							posthook: () => {
								handleNext();
							}
						}}
						bind:values={values['subjects']}
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
				{:else if values.subjectKind === 'ServiceAccount'}
					<Form
						schema={{
							type: 'object',
							title: 'ServiceAccount',
							required: ['name', 'namespace'],
							properties: {
								name: { type: 'string', title: 'Name' },
								namespace: { type: 'string', title: 'Namespace' }
							}
						} as Schema}
						uiSchema={{
							'ui:options': {
								translations: {
									submit: 'Next'
								}
							}
						} as UiSchemaRoot}
						initialValue={{
							name: lodash.get(object, 'subjects[0].name') ?? null,
							namespace: lodash.get(object, 'subjects[0].namespace') ?? null
						} as FormValue}
						handleSubmit={{
							posthook: () => {
								handleNext();
							}
						}}
						bind:values={values['serviceAccount']}
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
				{/if}
			</Tabs.Content>
			<!-- Step 4: Review & Edit -->
			<Tabs.Content value={steps[3]} class="min-h-[77vh]">
				<div class="flex h-full flex-col gap-3">
					<Monaco
						options={{
							language: 'yaml',
							padding: { top: 24 },
							automaticLayout: true,
							folding: true,
							foldingStrategy: 'indentation',
							showFoldingControls: 'always'
						}}
						bind:value
						theme={themeMode.current === 'dark' ? 'vs-dark' : 'vs-light'}
					/>
					<div class="mt-auto flex w-full items-center justify-between gap-3">
						<Button
							onclick={() => {
								handlePrevious();
							}}
						>
							Previous
						</Button>
						<Button
							class="flex-1"
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

								const name = lodash.get(load(value), 'metadata.name');

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
										loading: `Editing ClusterRoleBinding ${name}...`,
										success: () => {
											return `Successfully edited ClusterRoleBinding ${name}`;
										},
										error: (error) => {
											console.error(`Failed to edit ClusterRoleBinding ${name}:`, error);
											return `Failed to edit ClusterRoleBinding ${name}: ${(error as ConnectError).message}`;
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
				</div>
			</Tabs.Content>
		</Tabs.Root>
	</Dialog.Content>
</Dialog.Root>
