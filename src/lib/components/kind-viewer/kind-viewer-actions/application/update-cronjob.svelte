<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { FormIcon } from '@lucide/svelte';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { Schema, UiSchemaRoot } from '@sjsf/form';
	import { SubmitButton } from '@sjsf/form';
	import Ajv from 'ajv';
	import { JSON_SCHEMA, load } from 'js-yaml';
	import lodash from 'lodash';
	import { mode as themeMode } from 'mode-watcher';
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import Monaco from 'svelte-monaco';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import { page } from '$app/stores';
	import Form from '$lib/components/dynamic-form/form.svelte';
	import ComboboxWidget from '$lib/components/dynamic-form/widgets/combobox.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';

	let {
		cluster,
		namespace,
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
		cluster: string;
		namespace: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema?: any;
		object?: any;
		onOpenChangeComplete?: () => void;
		trigger?: Snippet<[Record<string, any>]>;
		onsuccess?: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const jsonSchemaValidator = new Ajv({
		allErrors: true,
		strict: false
	});
	const validate = jsonSchemaValidator.compile(jsonSchema);

	// Timezone List
	const timezones = $derived($page.data.timezones ?? []);

	async function fetchTimezones(search: string): Promise<{ label: string; value: string }[]> {
		return timezones
			.filter((timezone: string) => timezone.toLowerCase().includes(search.toLowerCase()))
			.map((timezone: string) => ({
				label: timezone,
				value: timezone
			}));
	}

	// Container for Data
	let values: any = $state({
		apiVersion: group ? `${group}/${version}` : version,
		kind,
		metadata: object?.metadata || {},
		spec: object?.spec || {
			workloadType: 'CronJob',
			cronJob: {}
		}
	});

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

	let cronjobValues: any = $state(
		lodash.get(object, 'spec.cronJob')
			? lodash.omit(lodash.get(object, 'spec.cronJob'), ['jobTemplate'])
			: {}
	);
	let jobValues: any = $state(
		lodash.get(object, 'spec.cronJob.jobTemplate.spec.template.spec') || {}
	);

	// Steps Manager
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
	<Dialog.Content class="max-h-[95vh] min-w-[38vw] overflow-auto">
		<Item.Root class="p-0">
			<Progress value={currentIndex + 1} max={steps.length} />
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold">{kind}</Item.Title>
				<Item.Description>{lodash.get(jsonSchema, 'description')}</Item.Description>
			</Item.Content>
		</Item.Root>
		<Tabs.Root value={currentStep}>
			<Tabs.Content value={steps[0]}>
				<Form
					schema={{
						...(lodash.omit(lodash.get(jsonSchema, 'properties.metadata'), 'properties') as any),
						title: 'Metadata',
						properties: {
							name: {
								...lodash.get(jsonSchema, 'properties.metadata.properties.name'),
								title: 'Name',
								readOnly: true
							},
							namespace: {
								...lodash.get(jsonSchema, 'properties.metadata.properties.namespace'),
								title: 'Namespace',
								readOnly: true
							}
						}
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						}
					} as UiSchemaRoot}
					initialValue={lodash.get(object, 'metadata')
						? {
								name: lodash.get(object, 'metadata.name'),
								namespace: lodash.get(object, 'metadata.namespace') || namespace
							}
						: { namespace: namespace }}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['metadata']}
				>
					{#snippet actions()}
						<div class="flex w-full items-center justify-between gap-3">
							<Button
								onclick={() => {
									handlePrevious();
								}}
								disabled={currentIndex === 0}
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
						title: 'Schedule',
						...lodash.omit(lodash.get(jsonSchema, 'properties.spec.properties.cronJob'), [
							'properties',
							'required'
						]),
						required: lodash
							.get(jsonSchema, 'properties.spec.properties.cronJob.required')
							.filter((require: string) => require !== 'jobTemplate'),
						properties: {
							schedule: {
								...lodash.get(jsonSchema, 'properties.spec.properties.cronJob.properties.schedule'),
								title: 'Schedule'
							},
							timeZone: {
								...lodash.get(jsonSchema, 'properties.spec.properties.cronJob.properties.timeZone'),
								title: 'Time Zone'
							},
							concurrencyPolicy: {
								...lodash.get(
									jsonSchema,
									'properties.spec.properties.cronJob.properties.concurrencyPolicy'
								),
								title: 'Concurrency Policy'
							},
							suspend: {
								...lodash.get(jsonSchema, 'properties.spec.properties.cronJob.properties.suspend'),
								title: 'Suspend execution'
							},
							successfulJobsHistoryLimit: {
								...lodash.get(
									jsonSchema,
									'properties.spec.properties.cronJob.properties.successfulJobsHistoryLimit'
								),
								title: 'Successful Jobs History Limit'
							},
							failedJobsHistoryLimit: {
								...lodash.get(
									jsonSchema,
									'properties.spec.properties.cronJob.properties.failedJobsHistoryLimit'
								),
								title: 'Failed Jobs History Limit'
							}
						}
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						},
						timeZone: {
							'ui:components': {
								stringField: 'enumField',
								selectWidget: ComboboxWidget
							},
							'ui:options': {
								TailoredComboboxEnumerations: fetchTimezones,
								TailoredComboboxVisibility: 10,
								TailoredComboboxInput: {
									placeholder: 'Select timezone...'
								},
								TailoredComboboxEmptyText: 'No timezones found.'
							}
						},
						suspend: {
							'ui:components': {
								checkboxWidget: 'switchWidget'
							}
						}
					} as UiSchemaRoot}
					initialValue={lodash.get(object, 'spec.cronJob')
						? {
								schedule: lodash.get(object, 'spec.cronJob.schedule') || '0 0 * * *',
								timeZone:
									lodash.get(object, 'spec.cronJob.timeZone') ||
									Intl.DateTimeFormat().resolvedOptions().timeZone,
								concurrencyPolicy: lodash.get(object, 'spec.cronJob.concurrencyPolicy') || 'Allow',
								suspend: lodash.get(object, 'spec.cronJob.suspend') ?? false,
								successfulJobsHistoryLimit:
									lodash.get(object, 'spec.cronJob.successfulJobsHistoryLimit') ?? 3,
								failedJobsHistoryLimit:
									lodash.get(object, 'spec.cronJob.failedJobsHistoryLimit') ?? 1
							}
						: {
								schedule: '0 0 * * *',
								timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
								concurrencyPolicy: 'Allow',
								suspend: false,
								successfulJobsHistoryLimit: 3,
								failedJobsHistoryLimit: 1
							}}
					handleSubmit={{
						posthook: () => {
							lodash.set(values, 'spec.cronJob', cronjobValues);
							handleNext();
						}
					}}
					bind:values={cronjobValues}
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
						...lodash.omit(
							lodash.get(
								jsonSchema,
								'properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec'
							),
							'properties'
						),
						properties: {
							restartPolicy: {
								title: 'Restart Policy',
								...lodash.get(
									jsonSchema,
									'properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.restartPolicy'
								)
							},
							containers: {
								title: 'Containers',
								...lodash.omit(
									lodash.get(
										jsonSchema,
										'properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.containers'
									),
									'items'
								),
								minItems: 1,
								items: {
									...lodash.omit(
										lodash.get(
											jsonSchema,
											'properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.containers.items'
										),
										'properties'
									),
									properties: {
										name: {
											...lodash.get(
												jsonSchema,
												'properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.containers.items.properties.name'
											),
											title: 'Name'
										},
										image: {
											...lodash.get(
												jsonSchema,
												'properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.containers.items.properties.image'
											),
											title: 'Image'
										},
										command: {
											...lodash.get(
												jsonSchema,
												'properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.containers.items.properties.command'
											),
											title: 'Command'
										},
										args: {
											...lodash.get(
												jsonSchema,
												'properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.containers.items.properties.args'
											),
											title: 'Arguments'
										},
										env: {
											...lodash.omit(
												lodash.get(
													jsonSchema,
													'properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.containers.items.properties.env'
												),
												'items'
											),
											title: 'Environment Variables',
											items: {
												...lodash.omit(
													lodash.get(
														jsonSchema,
														'properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.containers.items.properties.env.items'
													),
													'properties'
												),
												properties: {
													name: {
														...lodash.get(
															jsonSchema,
															'properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.containers.items.properties.env.items.properties.name'
														),
														title: 'Name'
													},
													value: {
														...lodash.get(
															jsonSchema,
															'properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.containers.items.properties.env.items.properties.value'
														),
														title: 'Value'
													}
												}
											}
										},
										resources: {
											title: 'Resources',
											...lodash.get(
												jsonSchema,
												'properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.containers.items.properties.resources'
											),
											properties: {
												requests: {
													...lodash.omit(
														lodash.get(
															jsonSchema,
															'properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.containers.items.properties.resources.properties.requests'
														),
														['additionalProperties']
													),
													title: 'Requests',
													properties: {
														cpu: {
															title: 'CPU',
															type: 'string'
														},
														memory: {
															title: 'Memory',
															type: 'string'
														},
														'nvidia.com/gpu': {
															title: 'GPU',
															type: 'integer'
														},
														'nvidia.com/gpumem': {
															title: 'GPU Memory',
															type: 'string'
														}
													}
												},
												limits: {
													...lodash.omit(
														lodash.get(
															jsonSchema,
															'properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.containers.items.properties.resources.properties.limits'
														),
														['additionalProperties']
													),
													title: 'Limits',
													properties: {
														cpu: {
															title: 'CPU',
															type: 'string'
														},
														memory: {
															title: 'Memory',
															type: 'string'
														},
														'nvidia.com/gpu': {
															title: 'GPU',
															type: 'integer'
														},
														'nvidia.com/gpumem': {
															title: 'GPU Memory',
															type: 'string'
														}
													}
												}
											}
										}
									}
								}
							}
						}
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							},
							addable: false,
							removable: false,
							orderable: false
						},
						containers: {
							'ui:options': {
								itemTitle: () => 'Container'
							},
							items: {
								command: {
									'ui:options': {
										itemTitle: () => 'command'
									}
								},
								args: {
									'ui:options': {
										itemTitle: () => 'argument'
									}
								},
								env: {
									'ui:options': {
										itemTitle: () => 'environment variable'
									}
								},
								ports: {
									'ui:options': {
										itemTitle: () => 'port'
									}
								},
								resources: {
									requests: {
										'ui:options': {
											layouts: {
												'object-properties': {
													class: 'grid grid-cols-2 gap-3'
												}
											}
										}
									},
									limits: {
										'ui:options': {
											layouts: {
												'object-properties': {
													class: 'grid grid-cols-2 gap-3'
												}
											}
										}
									}
								}
							}
						}
					} as UiSchemaRoot}
					initialValue={lodash.get(object, 'spec.cronJob.jobTemplate.spec.template.spec') || {
						restartPolicy: 'OnFailure',
						containers: [
							{
								name: 'main',
								image: 'busybox:latest',
								command: ['sh', '-c', 'echo Hello World']
							}
						]
					}}
					handleSubmit={{
						posthook: () => {
							lodash.set(values, 'spec.cronJob.jobTemplate.spec.template.spec', jobValues);
							handleNext();
						}
					}}
					bind:values={jobValues}
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

			<Tabs.Content value={steps[3]} class="min-h-[77vh]">
				<div class="flex h-full flex-col gap-3">
					<Monaco
						options={{
							language: 'yaml',
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
					<Button
						class="mt-auto w-full"
						onclick={() => {
							if (isSubmitting) return;

							isSubmitting = true;

							const currentStructuredValue: any = load(value, { schema: JSON_SCHEMA });

							const isValid = validate(currentStructuredValue);

							if (!isValid) {
								console.error(`Validation errors: ${JSON.stringify(validate.errors)}`);
								toast.error('Validation failed. Please check the YAML.');
								isSubmitting = false;
								return;
							}

							const name = lodash.get(currentStructuredValue, 'metadata.name');
							const manifest = new TextEncoder().encode(JSON.stringify(currentStructuredValue));

							toast.promise(
								async () => {
									await resourceClient.apply({
										cluster,
										namespace,
										group,
										version,
										resource,
										name,
										manifest,
										fieldManager: 'otterscale-web-ui',
										force: true
									});
								},
								{
									loading: `Updating ${kind} ${name}...`,
									success: () => {
										onsuccess?.();
										return `Successfully updated ${kind} ${name}`;
									},
									error: (error) => {
										console.error(`Failed to update ${kind} ${name}:`, error);
										return `Failed to update ${kind} ${name}: ${(error as ConnectError).message}`;
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
