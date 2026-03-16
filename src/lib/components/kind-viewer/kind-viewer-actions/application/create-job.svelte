<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { SquareIcon } from '@lucide/svelte';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { Schema, UiSchemaRoot } from '@sjsf/form';
	import { SubmitButton } from '@sjsf/form';
	import Ajv from 'ajv';
	import { load } from 'js-yaml';
	import lodash from 'lodash';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import * as Code from '$lib/components/custom/code';
	import Form from '$lib/components/dynamic-form/form.svelte';
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

	// Container for Data
	let values: any = $state({
		apiVersion: group ? `${group}/${version}` : version,
		kind,
		metadata: {},
		spec: {
			workloadType: 'Job',
			job: {}
		}
	});
	let value = $derived(stringify(values));

	let template = $state({});

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
					<SquareIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>Job</Item.Title>
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
						...(lodash.omit(lodash.get(jsonSchema, 'properties.metadata'), 'properties') as any),
						title: 'Metadata',
						properties: {
							name: {
								...lodash.get(jsonSchema, 'properties.metadata.properties.name'),
								title: 'Name'
							},
							namespace: {
								...lodash.get(jsonSchema, 'properties.metadata.properties.namespace'),
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
				<Form
					schema={{
						title: 'Settings',
						...lodash.omit(lodash.get(jsonSchema, 'properties.spec.properties.job'), 'properties'),
						required: lodash
							.get(jsonSchema, 'properties.spec.properties.job.required')
							.filter((require: string) => require !== 'template'),
						properties: {
							completions: {
								...lodash.get(jsonSchema, 'properties.spec.properties.job.properties.completions'),
								title: 'Completions'
							},
							parallelism: {
								...lodash.get(jsonSchema, 'properties.spec.properties.job.properties.parallelism'),
								title: 'Parallelism'
							},
							backoffLimit: {
								...lodash.get(jsonSchema, 'properties.spec.properties.job.properties.backoffLimit'),
								title: 'Backoff Limit'
							},
							activeDeadlineSeconds: {
								...lodash.get(
									jsonSchema,
									'properties.spec.properties.job.properties.activeDeadlineSeconds'
								),
								title: 'Active Deadline Seconds'
							},
							ttlSecondsAfterFinished: {
								...lodash.get(
									jsonSchema,
									'properties.spec.properties.job.properties.ttlSecondsAfterFinished'
								),
								title: 'TTL Seconds After Finished'
							},
							suspend: {
								...lodash.get(jsonSchema, 'properties.spec.properties.job.properties.suspend'),
								title: 'Suspend execution'
							}
						}
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						},
						suspend: {
							'ui:components': {
								checkboxWidget: 'switchWidget'
							}
						}
					} as UiSchemaRoot}
					initialValue={{
						completions: 1,
						parallelism: 1,
						backoffLimit: 6,
						suspend: false
					}}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['spec']['job']}
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
								'properties.spec.properties.job.properties.template.properties.spec'
							),
							'properties'
						),
						properties: {
							restartPolicy: {
								title: 'Restart Policy',
								...lodash.get(
									jsonSchema,
									'properties.spec.properties.job.properties.template.properties.spec.properties.restartPolicy'
								)
							},
							containers: {
								title: 'Containers',
								...lodash.omit(
									lodash.get(
										jsonSchema,
										'properties.spec.properties.job.properties.template.properties.spec.properties.containers'
									),
									'items'
								),
								items: {
									...lodash.omit(
										lodash.get(
											jsonSchema,
											'properties.spec.properties.job.properties.template.properties.spec.properties.containers.items'
										),
										'properties'
									),
									properties: {
										name: {
											...lodash.get(
												jsonSchema,
												'properties.spec.properties.job.properties.template.properties.spec.properties.containers.items.properties.name'
											),
											title: 'Name'
										},
										image: {
											...lodash.get(
												jsonSchema,
												'properties.spec.properties.job.properties.template.properties.spec.properties.containers.items.properties.image'
											),
											title: 'Image'
										},
										command: {
											...lodash.get(
												jsonSchema,
												'properties.spec.properties.job.properties.template.properties.spec.properties.containers.items.properties.command'
											),
											title: 'Command'
										},
										args: {
											...lodash.get(
												jsonSchema,
												'properties.spec.properties.job.properties.template.properties.spec.properties.containers.items.properties.args'
											),
											title: 'Arguments'
										},
										env: {
											...lodash.omit(
												lodash.get(
													jsonSchema,
													'properties.spec.properties.job.properties.template.properties.spec.properties.containers.items.properties.env'
												),
												'items'
											),
											title: 'Environment Variables',
											items: {
												...lodash.omit(
													lodash.get(
														jsonSchema,
														'properties.spec.properties.job.properties.template.properties.spec.properties.containers.items.properties.env.items'
													),
													'properties'
												),
												properties: {
													name: {
														...lodash.get(
															jsonSchema,
															'properties.spec.properties.job.properties.template.properties.spec.properties.containers.items.properties.env.items.properties.name'
														),
														title: 'Name'
													},
													value: {
														...lodash.get(
															jsonSchema,
															'properties.spec.properties.job.properties.template.properties.spec.properties.containers.items.properties.env.items.properties.value'
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
												'properties.spec.properties.job.properties.template.properties.spec.properties.containers.items.properties.resources'
											),
											properties: {
												requests: {
													...lodash.get(
														jsonSchema,
														'properties.spec.properties.job.properties.template.properties.spec.properties.containers.items.properties.resources.properties.requests'
													),
													title: 'Requests',
													additionalProperties: {
														type: 'string'
													}
												},
												limits: {
													...lodash.get(
														jsonSchema,
														'properties.spec.properties.job.properties.template.properties.spec.properties.containers.items.properties.resources.properties.limits'
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
							lodash.set(values, 'spec.job.template.spec', template);
							handleNext();
						}
					}}
					bind:values={template}
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
					<Code.Root
						lang="yaml"
						class="w-full"
						hideLines
						code={stringify(lodash.omit(values, 'jobValues'), null, 2)}
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
								console.error('Validation errors:', validate.errors);
								toast.error('Validation failed. Please check the YAML.');
								isSubmitting = false;
								return;
							}

							const name = lodash.get(load(value), 'metadata.name');

							toast.promise(
								async () => {
									const manifest = new TextEncoder().encode(value);

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
