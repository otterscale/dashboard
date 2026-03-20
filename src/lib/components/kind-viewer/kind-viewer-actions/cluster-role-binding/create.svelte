<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { Plus } from '@lucide/svelte';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
	import { SubmitButton } from '@sjsf/form';
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
		schema: jsonSchema,
		cluster,
		group,
		version,
		kind,
		resource,
		open = $bindable(false),
		showTrigger = true,
		onsuccess
	}: {
		schema: any;
		cluster: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		open?: boolean;
		showTrigger?: boolean;
		onsuccess?: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	// Container for Data.
	let values: any = $state({
		apiVersion: group ? `${group}/${version}` : version,
		kind,
		metadata: { name: {} },
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
			metadata: { name: values.metadata.name },
			roleRef: {
				apiGroup: group || 'rbac.authorization.k8s.io',
				kind: 'ClusterRole',
				name: values.roleRef.name
			},
			subjects: [subjectEntry]
		};
	});

	// Steps
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
	let isSubmitting = $state(false);
</script>

<AlertDialog.Root
	bind:open
	onOpenChangeComplete={() => {
		reset();
	}}
>
	{#if showTrigger}
		<AlertDialog.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="outline" size="icon">
					<Plus />
				</Button>
			{/snippet}
		</AlertDialog.Trigger>
	{/if}
	<AlertDialog.Content class="max-h-[95vh] min-w-[38vw] overflow-auto">
		<Item.Root class="p-0">
			<Progress value={currentIndex + 1} max={steps.length} />
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold">ClusterRoleBinding</Item.Title>
				<Item.Description>{lodash.get(jsonSchema, 'description', '')}</Item.Description>
			</Item.Content>
		</Item.Root>
		<Tabs.Root value={currentStep}>
			<!-- Step 1: Name -->
			<Tabs.Content value={steps[0]}>
				<Form
					schema={{
						...(lodash.get(jsonSchema, 'properties.metadata.properties.name') ?? {
							type: 'string'
						}),
						title: 'Name'
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						}
					} as UiSchemaRoot}
					initialValue={null as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['metadata']['name']}
				>
					{#snippet actions()}
						<div class="flex w-full items-center justify-end gap-3">
							<SubmitButton />
						</div>
					{/snippet}
				</Form>
			</Tabs.Content>
			<!-- Step 2: ClusterRole -->
			<Tabs.Content value={steps[1]}>
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
					initialValue={null as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['roleRef']['name']}
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
			<!-- Step 3: Subject Kind -->
			<Tabs.Content value={steps[2]}>
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
					initialValue={'User' as FormValue}
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
			<!-- Step 4: Subject Details -->
			<Tabs.Content value={steps[3]}>
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
						initialValue={null as FormValue}
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
						initialValue={null as FormValue}
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
						initialValue={{ name: null, namespace: null } as FormValue}
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
			<!-- Step 5: Review & Create -->
			<Tabs.Content value={steps[4]} class="min-h-[77vh]">
				<div class="flex h-full flex-col gap-3">
					<Code.Root
						lang="yaml"
						class="w-full"
						hideLines
						code={stringify(submissionValues, null, 2)}
					/>
					<Button
						class="mt-auto w-full"
						onclick={() => {
							if (isSubmitting) return;

							isSubmitting = true;

							const name = submissionValues.metadata.name;

							toast.promise(
								async () => {
									const manifest = new TextEncoder().encode(JSON.stringify(submissionValues));

									await resourceClient.create({
										cluster,
										group,
										version,
										resource,
										manifest
									});
								},
								{
									loading: `Creating ClusterRoleBinding ${name}...`,
									success: () => {
										onsuccess?.();
										return `Successfully created ClusterRoleBinding ${name}`;
									},
									error: (error) => {
										console.error(`Failed to create ClusterRoleBinding ${name}:`, error);
										return `Failed to create ClusterRoleBinding ${name}: ${(error as ConnectError).message}`;
									},
									finally() {
										isSubmitting = false;
										open = false;
									}
								}
							);
						}}
					>
						Create
					</Button>
				</div>
			</Tabs.Content>
		</Tabs.Root>
	</AlertDialog.Content>
</AlertDialog.Root>
