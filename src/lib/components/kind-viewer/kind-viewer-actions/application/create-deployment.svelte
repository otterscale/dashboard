<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
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
			workloadType: 'Deployment',
			deploymentConfig: {
				deployment: {
					replicas: {},
					template: { spec: { containers: {} } }
				},
				service: {},
				persistentVolumeClaim: { resources: { requests: {} } },
				mountPath: {}
			}
		}
	});

	function deploymentHasPvc(pvc: any): boolean {
		return !!(pvc && Array.isArray(pvc.accessModes) && pvc.accessModes.length > 0);
	}

	/** Omit PVC (and mountPath) from manifest/YAML when no access mode — avoids `persistentVolumeClaim: {}` in preview. */
	function manifestWithoutPvcWhenEmpty(obj: any) {
		const out = lodash.cloneDeep(obj);
		const pvc = lodash.get(out, 'spec.deploymentConfig.persistentVolumeClaim');
		if (!deploymentHasPvc(pvc)) {
			lodash.unset(out, 'spec.deploymentConfig.persistentVolumeClaim');
			lodash.unset(out, 'spec.deploymentConfig.mountPath');
		}
		return out;
	}

	let value = $derived(stringify(manifestWithoutPvcWhenEmpty(values)));

	// Steps Manager
	const steps = Array.from({ length: 6 }, (_, index) => String(index + 1));
	const [firstStep] = steps;
	let currentStep = $state(firstStep);
	const currentIndex = $derived(steps.indexOf(currentStep));

	// Form uses accessMode (single select); submit keeps accessModes only. When navigating back, hydrate accessMode from accessModes[0].
	$effect(() => {
		if (currentStep !== steps[4]) return;
		const pvc = values?.spec?.deploymentConfig?.persistentVolumeClaim;
		if (!pvc?.accessModes?.[0] || pvc.accessMode != null) return;
		values.spec.deploymentConfig.persistentVolumeClaim = {
			...pvc,
			accessMode: pvc.accessModes[0]
		};
	});
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
			<Item.Root {...props} class="w-full p-0 text-xs" size="sm">
				<Item.Media>
					<LayoutGridIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>Deployment</Item.Title>
				</Item.Content>
			</Item.Root>
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
								title: 'Name'
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
					initialValue={{
						name: null,
						namespace: namespace
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
						minItems: 1,
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
								},
								resources: {
									title: 'Resources',
									...lodash.get(
										jsonSchema,
										'properties.spec.properties.deploymentConfig.properties.deployment.properties.template.properties.spec.properties.containers.items.properties.resources'
									),
									properties: {
										requests: {
											...lodash.omit(
												lodash.get(
													jsonSchema,
													'properties.spec.properties.deploymentConfig.properties.deployment.properties.template.properties.spec.properties.containers.items.properties.resources.properties.requests'
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
													'properties.spec.properties.deploymentConfig.properties.deployment.properties.template.properties.spec.properties.containers.items.properties.resources.properties.limits'
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
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							},
							itemTitle: () => 'Container',
							addable: false,
							removable: false,
							orderable: false
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
					} as UiSchemaRoot}
					initialValue={[{ name: null }] as FormValue}
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
						type: {
							'ui:components': {
								stringField: 'enumField'
							}
						},
						ports: {
							'ui:options': {
								itemTitle: () => 'Service Port'
							}
						}
					} as UiSchemaRoot}
					initialValue={{
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
						type: 'object',
						properties: {
							accessMode: {
								...lodash.omit(
									lodash.get(
										jsonSchema,
										'properties.spec.properties.deploymentConfig.properties.persistentVolumeClaim.properties.accessModes.items'
									) ?? {},
									'default'
								),
								title: 'Access Mode',
								enum: ['ReadWriteOnce', 'ReadOnlyMany', 'ReadWriteMany', 'ReadWriteOncePod']
							},
							resources: {
								type: 'object',
								properties: {
									requests: {
										...lodash.omit(
											lodash.get(
												jsonSchema,
												'properties.spec.properties.deploymentConfig.properties.persistentVolumeClaim.properties.resources.properties.requests'
											),
											'additionalProperties'
										),
										properties: {
											storage: {
												type: 'string'
											}
										},
										dependencies: {
											storage: {
												properties: {
													mountPath: {
														title: 'Mount Path',
														...lodash.get(
															jsonSchema,
															'properties.spec.properties.deploymentConfig.properties.mountPath'
														)
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
								submit: 'Next',
								'additional-property': 'additional request',
								'add-object-property': 'Add Request'
							}
						},
						accessMode: {
							'ui:components': {
								stringField: 'enumField'
							}
						}
					} as UiSchemaRoot}
					initialValue={null}
					transformer={(value: FormValue) => {
						const formValue: any = lodash.cloneDeep(value);
						lodash.set(
							values,
							'spec.deploymentConfig.mountPath',
							lodash.get(formValue, 'resources.requests.mountPath')
						);
						lodash.unset(formValue, 'resources.requests.mountPath');
						const accessMode = lodash.get(formValue, 'accessMode') as string | undefined;
						lodash.unset(formValue, 'accessMode');
						if (accessMode) {
							lodash.set(formValue, 'accessModes', [accessMode]);
						} else {
							lodash.unset(formValue, 'accessModes');
						}
						return formValue;
					}}
					handleSubmit={{
						posthook: () => {
							lodash.unset(values, 'spec.deploymentConfig.persistentVolumeClaim.accessMode');
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
							lodash.set(values, 'spec.deploymentConfig.service.selector.app', label);
							handleNext();
						}
					}}
					bind:values={values['spec']['deploymentConfig']['persistentVolumeClaim']}
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

			<Tabs.Content value={steps[5]} class="min-h-[77vh]">
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

							const parsed: any = manifestWithoutPvcWhenEmpty(load(value));

							const isValid = validate(parsed);

							if (!isValid) {
								console.error(`Validation errors: ${JSON.stringify(validate.errors)}`);
								toast.error('Validation failed. Please check the YAML.');
								isSubmitting = false;
								return;
							}

							const name = lodash.get(parsed, 'metadata.name');

							toast.promise(
								async () => {
									const manifest = new TextEncoder().encode(stringify(parsed));

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
	</Dialog.Content>
</Dialog.Root>
