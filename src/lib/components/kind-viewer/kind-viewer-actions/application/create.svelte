<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { Plus } from '@lucide/svelte';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
	import { SubmitButton } from '@sjsf/form';
	import Ajv from 'ajv';
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
		schema: jsonSchema
	}: {
		cluster: string;
		namespace: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema?: any;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	// Validation
	const jsonSchemaValidator = new Ajv({
		allErrors: true,
		strict: false
	});
	const validate = jsonSchemaValidator.compile(jsonSchema);

	// Container for Data
	let values: any = $state({
		apiVersion: `${group}/${version}`,
		kind,
		metadata: {},
		spec: {
			deploymentConfig: {
				deployment: {
					selector: { matchLabels: { app: '' } },
					replicas: {},
					template: { spec: { containers: {} } }
				},
				service: {},
				persistentVolumeClaim: { resources: { requests: {} } }
			}
		}
	});

	// Steps Manager
	const steps = Array.from({ length: 6 }, (_, index) => String(index + 1));
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
					initialValue={{
						name: '',
						namespace: ''
					} as FormValue}
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
						...lodash.get(
							jsonSchema,
							'properties.spec.properties.deploymentConfig.properties.deployment.properties.replicas'
						),
						title: 'Replicas'
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						}
					} as UiSchemaRoot}
					initialValue={1}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['spec']['deploymentConfig']['deployment']['replicas']}
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
						title: 'Containers',
						...lodash.omit(
							lodash.get(
								jsonSchema,
								'properties.spec.properties.deploymentConfig.properties.deployment.properties.template.properties.spec.properties.containers'
							),
							'items'
						),
						items: {
							...lodash.omit(
								lodash.get(
									jsonSchema,
									'properties.spec.properties.deploymentConfig.properties.deployment.properties.template.properties.spec.properties.containers.items'
								),
								'properties'
							),
							properties: {
								name: {
									...lodash.get(
										jsonSchema,
										'properties.spec.properties.deploymentConfig.properties.deployment.properties.template.properties.spec.properties.containers.items.properties.name'
									),
									title: 'Name'
								},
								image: {
									...lodash.get(
										jsonSchema,
										'properties.spec.properties.deploymentConfig.properties.deployment.properties.template.properties.spec.properties.containers.items.properties.image'
									),
									title: 'Image'
								},
								command: {
									...lodash.get(
										jsonSchema,
										'properties.spec.properties.deploymentConfig.properties.deployment.properties.template.properties.spec.properties.containers.items.properties.command'
									),
									title: 'Command'
								},
								args: {
									...lodash.get(
										jsonSchema,
										'properties.spec.properties.deploymentConfig.properties.deployment.properties.template.properties.spec.properties.containers.items.properties.args'
									),
									title: 'Arguments'
								},
								env: {
									...lodash.omit(
										lodash.get(
											jsonSchema,
											'properties.spec.properties.deploymentConfig.properties.deployment.properties.template.properties.spec.properties.containers.items.properties.env'
										),
										'items'
									),
									title: 'Environment Variables',
									items: {
										...lodash.omit(
											lodash.get(
												jsonSchema,
												'properties.spec.properties.deploymentConfig.properties.deployment.properties.template.properties.spec.properties.containers.items.properties.env.items'
											),
											'properties'
										),
										properties: {
											name: {
												...lodash.get(
													jsonSchema,
													'properties.spec.properties.deploymentConfig.properties.deployment.properties.template.properties.spec.properties.containers.items.properties.env.items.properties.name'
												),
												title: 'Name'
											},
											value: {
												...lodash.get(
													jsonSchema,
													'properties.spec.properties.deploymentConfig.properties.deployment.properties.template.properties.spec.properties.containers.items.properties.env.items.properties.value'
												),
												title: 'Value'
											}
										}
									}
								},
								ports: {
									title: 'Ports',
									...lodash.omit(
										lodash.get(
											jsonSchema,
											'properties.spec.properties.deploymentConfig.properties.deployment.properties.template.properties.spec.properties.containers.items.properties.ports'
										),
										'items'
									),
									items: {
										...lodash.omit(
											lodash.get(
												jsonSchema,
												'properties.spec.properties.deploymentConfig.properties.deployment.properties.template.properties.spec.properties.containers.items.properties.ports.items'
											),
											'properties'
										),
										properties: {
											containerPort: {
												title: 'Container Port',
												...lodash.get(
													jsonSchema,
													'properties.spec.properties.deploymentConfig.properties.deployment.properties.template.properties.spec.properties.containers.items.properties.ports.items.properties.containerPort'
												)
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
							itemTitle: () => 'Container'
						}
					} as UiSchemaRoot}
					initialValue={[] as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={
						values['spec']['deploymentConfig']['deployment']['template']['spec']['containers']
					}
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
						title: 'Services',
						...lodash.omit(
							lodash.get(
								jsonSchema,
								'properties.spec.properties.deploymentConfig.properties.service'
							),
							'properties'
						),
						properties: {
							type: {
								...lodash.get(
									jsonSchema,
									'properties.spec.properties.deploymentConfig.properties.service.properties.type'
								),
								title: 'Type',
								enum: ['ExternalName', 'ClusterIP', 'NodePort', 'LoadBalancer']
							},
							ports: {
								title: 'Ports',
								...lodash.omit(
									lodash.get(
										jsonSchema,
										'properties.spec.properties.deploymentConfig.properties.service.properties.ports'
									),
									'items'
								),
								items: {
									...lodash.omit(
										lodash.get(
											jsonSchema,
											'properties.spec.properties.deploymentConfig.properties.service.properties.ports.items'
										),
										'properties'
									),
									properties: {
										port: {
											title: 'Port',
											...lodash.get(
												jsonSchema,
												'properties.spec.properties.deploymentConfig.properties.service.properties.ports.items.properties.port'
											)
										},
										nodePort: {
											title: 'Node Port',
											...lodash.get(
												jsonSchema,
												'properties.spec.properties.deploymentConfig.properties.service.properties.ports.items.properties.nodePort'
											)
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
						ports: {
							itemTitle: () => ''
						}
					} as UiSchemaRoot}
					initialValue={{
						ports: [],
						type: 'ClusterIP'
					} as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['spec']['deploymentConfig']['service']}
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
				<Form
					schema={{
						title: 'Persistent Volume Claim',
						...lodash.get(
							jsonSchema,
							'properties.spec.properties.deploymentConfig.properties.persistentVolumeClaim.properties.resources.properties.requests'
						)
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						}
					} as UiSchemaRoot}
					initialValue={{}}
					handleSubmit={{
						posthook: () => {
							const label = `app-${lodash.get(values, 'metadata.name')}`;
							lodash.set(
								values,
								'spec.deploymentConfig.deployment.selector.matchLabels.app',
								label
							);
							lodash.set(
								values,
								'spec.deploymentConfig.deployment.template.metadata.labels.app',
								label
							);
							handleNext();
						}
					}}
					bind:values={
						values['spec']['deploymentConfig']['persistentVolumeClaim']['resources']['requests']
					}
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

			<Tabs.Content value={steps[5]}>
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
										return `Successfully created ${kind} ${name}`;
									},
									error: (error) => {
										console.error(`Failed to create ${kind} ${name}:`, error);
										return `Failed to create ${kind} ${name}: ${(error as ConnectError).message}`;
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
