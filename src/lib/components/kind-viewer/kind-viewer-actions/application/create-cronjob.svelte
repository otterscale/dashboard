<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { ClockIcon } from '@lucide/svelte';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { Schema, UiSchemaRoot } from '@sjsf/form';
	import { SubmitButton } from '@sjsf/form';
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
		namespace,
		group,
		version,
		kind,
		resource,
		schema: jsonSchema,
		onOpenChangeComplete
	}: {
		cluster: string;
		namespace: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema?: any;
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

	// Timezone List
	function getAllTimezones(): string[] {
		try {
			const timezones = Intl.supportedValuesOf('timeZone');
			return ['Etc/UTC', ...timezones.filter((tz) => tz !== 'Etc/UTC')];
		} catch {
			return [
				'Etc/UTC',
				'Africa/Cairo',
				'Africa/Johannesburg',
				'Africa/Lagos',
				'Africa/Nairobi',
				'America/Anchorage',
				'America/Chicago',
				'America/Denver',
				'America/Los_Angeles',
				'America/New_York',
				'America/Sao_Paulo',
				'America/Toronto',
				'Asia/Dubai',
				'Asia/Hong_Kong',
				'Asia/Kolkata',
				'Asia/Seoul',
				'Asia/Shanghai',
				'Asia/Singapore',
				'Asia/Taipei',
				'Asia/Tokyo',
				'Australia/Melbourne',
				'Australia/Sydney',
				'Europe/Amsterdam',
				'Europe/Berlin',
				'Europe/London',
				'Europe/Moscow',
				'Europe/Paris',
				'Pacific/Auckland',
				'Pacific/Honolulu'
			];
		}
	}
	const TIMEZONES = getAllTimezones();

	async function fetchTimezones(search: string): Promise<{ label: string; value: string }[]> {
		return TIMEZONES.filter((tz) => tz.toLowerCase().includes(search.toLowerCase())).map((tz) => ({
			label: tz,
			value: tz
		}));
	}

	// Container for Data
	let values: any = $state({
		apiVersion: group ? `${group}/${version}` : version,
		kind,
		metadata: {},
		spec: {
			workloadType: 'CronJob',
			cronJob: {}
		}
	});

	let jobValues: any = $state({});

	// Steps Manager
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

	// Flag for Dialog
	let open = $state(false);
	let isSubmitting = $state(false);
</script>

<AlertDialog.Root
	bind:open
	onOpenChange={() => {
		reset();
	}}
	{onOpenChangeComplete}
>
	<AlertDialog.Trigger>
		{#snippet child({ props })}
			<Item.Root {...props} class="w-full p-0 text-xs" size="sm">
				<Item.Media>
					<ClockIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>CronJob</Item.Title>
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
				<!-- Step 1: Metadata -->
				<Form
					schema={{
						...(lodash.omit(
							lodash.get(jsonSchema, 'schema.properties.metadata'),
							'properties'
						) as any),
						title: 'Metadata',
						properties: {
							name: {
								...lodash.get(jsonSchema, 'schema.properties.metadata.properties.name'),
								title: 'Name'
							},
							namespace: {
								...lodash.get(jsonSchema, 'schema.properties.metadata.properties.namespace'),
								title: 'Namespace'
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
					initialValue={{ namespace: namespace }}
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
				<!-- Step 2: Schedule -->
				<Form
					schema={{
						title: 'Schedule',
						...lodash.omit(
							lodash.get(jsonSchema, 'schema.properties.spec.properties.cronJob'),
							'properties'
						),
						properties: {
							schedule: {
								...lodash.get(
									jsonSchema,
									'schema.properties.spec.properties.cronJob.properties.schedule'
								),
								title: 'Schedule'
							},
							timeZone: {
								...lodash.get(
									jsonSchema,
									'schema.properties.spec.properties.cronJob.properties.timeZone'
								),
								title: 'Time Zone'
							},
							concurrencyPolicy: {
								...lodash.get(
									jsonSchema,
									'schema.properties.spec.properties.cronJob.properties.concurrencyPolicy'
								),
								title: 'Concurrency Policy'
							},
							suspend: {
								...lodash.get(
									jsonSchema,
									'schema.properties.spec.properties.cronJob.properties.suspend'
								),
								title: 'Suspend execution'
							},
							successfulJobsHistoryLimit: {
								...lodash.get(
									jsonSchema,
									'schema.properties.spec.properties.cronJob.properties.successfulJobsHistoryLimit'
								),
								title: 'Successful Jobs History Limit'
							},
							failedJobsHistoryLimit: {
								...lodash.get(
									jsonSchema,
									'schema.properties.spec.properties.cronJob.properties.failedJobsHistoryLimit'
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
					initialValue={{
						schedule: '0 0 * * *',
						concurrencyPolicy: 'Allow',
						suspend: false,
						successfulJobsHistoryLimit: 3,
						failedJobsHistoryLimit: 1,
						jobTemplate: {
							spec: {
								template: {
									spec: {}
								}
							}
						}
					}}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['spec']['cronJob']}
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
				<!-- Step 3: Containers -->
				<Form
					schema={{
						...lodash.omit(
							lodash.get(
								jsonSchema,
								'schema.properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec'
							),
							'properties'
						),
						properties: {
							restartPolicy: {
								title: 'Restart Policy',
								...lodash.get(
									jsonSchema,
									'schema.properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.restartPolicy'
								)
							},
							containers: {
								title: 'Containers',
								...lodash.omit(
									lodash.get(
										jsonSchema,
										'schema.properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.containers'
									),
									'items'
								),
								items: {
									...lodash.omit(
										lodash.get(
											jsonSchema,
											'schema.properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.containers.items'
										),
										'properties'
									),
									properties: {
										name: {
											...lodash.get(
												jsonSchema,
												'schema.properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.containers.items.properties.name'
											),
											title: 'Name'
										},
										image: {
											...lodash.get(
												jsonSchema,
												'schema.properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.containers.items.properties.image'
											),
											title: 'Image'
										},
										command: {
											...lodash.get(
												jsonSchema,
												'schema.properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.containers.items.properties.command'
											),
											title: 'Command'
										},
										args: {
											...lodash.get(
												jsonSchema,
												'schema.properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.containers.items.properties.args'
											),
											title: 'Arguments'
										},
										env: {
											...lodash.omit(
												lodash.get(
													jsonSchema,
													'schema.properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.containers.items.properties.env'
												),
												'items'
											),
											title: 'Environment Variables',
											items: {
												...lodash.omit(
													lodash.get(
														jsonSchema,
														'schema.properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.containers.items.properties.env.items'
													),
													'properties'
												),
												properties: {
													name: {
														...lodash.get(
															jsonSchema,
															'schema.properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.containers.items.properties.env.items.properties.name'
														),
														title: 'Name'
													},
													value: {
														...lodash.get(
															jsonSchema,
															'schema.properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.containers.items.properties.env.items.properties.value'
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
												'schema.properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.containers.items.properties.resources'
											),
											properties: {
												requests: {
													...lodash.get(
														jsonSchema,
														'schema.properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.containers.items.properties.resources.properties.requests'
													),
													title: 'Requests',
													additionalProperties: {
														type: 'string'
													}
												},
												limits: {
													...lodash.get(
														jsonSchema,
														'schema.properties.spec.properties.cronJob.properties.jobTemplate.properties.spec.properties.template.properties.spec.properties.containers.items.properties.resources.properties.limits'
													),
													title: 'Limits',
													additionalProperties: {
														type: 'string'
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
							}
						},
						containers: {
							'ui:options': {
								itemTitle: () => 'Container'
							},
							items: {
								args: {
									items: {
										'ui:components': {
											textWidget: 'textareaWidget'
										}
									}
								},
								resources: {
									requests: {
										'ui:options': {
											translations: {
												'add-object-property': 'Add Request'
											},
											layouts: {
												'object-properties': {
													class: 'grid grid-cols-2 gap-3'
												}
											}
										}
									},
									limits: {
										'ui:options': {
											translations: {
												'add-object-property': 'Add Limit'
											},
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
					initialValue={{
						restartPolicy: 'OnFailure',
						containers: [
							{
								name: 'main',
								image: 'busybox:latest',
								command: ['sh', '-c', 'echo Hello World'],
								resources: {
									requests: { cpu: '' },
									limits: { cpu: '' }
								}
							}
						]
					}}
					handleSubmit={{
						posthook: () => {
							handleNext();
							lodash.set(values, 'spec.cronJob.jobTemplate.spec.template.spec', jobValues);
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

			<Tabs.Content value={steps[3]}>
				<!-- Step 5: Review -->
				<div class="flex h-full flex-col gap-3">
					<Code.Root lang="yaml" class="w-full" hideLines code={stringify(values, null, 2)} />
					<Button
						class="mt-auto w-full"
						onclick={() => {
							if (isSubmitting) return;

							isSubmitting = true;

							const isValid = validate(values);

							if (!isValid) {
								console.error('Validation errors:', validate.errors);
								toast.error('Validation failed. Please check the YAML.');
								isSubmitting = false;
								return;
							}

							const name = lodash.get(values, 'metadata.name');

							toast.promise(
								async () => {
									const manifest = new TextEncoder().encode(JSON.stringify(values));

									await resourceClient.create({
										cluster,
										namespace,
										group,
										version,
										resource,
										manifest
									});
								},
								{
									loading: `Creating ${kind} ${name}...`,
									success: () => {
										open = false;
										return `Successfully created ${kind} ${name}`;
									},
									error: (error) => {
										console.error(`Failed to create ${kind} ${name}:`, error);
										return `Failed to create ${kind} ${name}: ${(error as ConnectError).message}`;
									},
									finally() {
										isSubmitting = false;
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
