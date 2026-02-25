<script lang="ts">
	import type { Transport } from '@connectrpc/connect';
	import { ConnectError, createClient } from '@connectrpc/connect';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { page } from '$app/stores';
	import { ResourceService } from '$lib/api/resource/v1/resource_pb';
	import {
		type GroupedFields,
		type K8sOpenAPISchema,
		MultiStepSchemaForm
	} from '$lib/components/custom/schema-form';

	let {
		name,
		schema,
		object,
		onsuccess
	}: {
		name: string;
		schema: K8sOpenAPISchema;
		object: Record<string, unknown>;
		onsuccess?: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);
	const cluster = $derived($page.params.cluster ?? $page.params.scope ?? ''); // Remove metadata.managedFields from object

	function getCleanedObject() {
		// Use JSON parse/stringify for deep clone to avoid structuredClone issues
		const copy = JSON.parse(JSON.stringify(object));
		if (copy.metadata && typeof copy.metadata === 'object') {
			delete (copy.metadata as Record<string, unknown>).managedFields;
		}
		return copy;
	}

	let isSubmitting = $state(false); // Grouped fields for multi-step form

	const groupedFields: GroupedFields = {
		General: {
			'metadata.name': { title: 'Name' },
			'metadata.namespace': { title: 'Namespace' },
			'spec.deploymentSpec.replicas': { title: 'Replicas' }
		},
		Container: {
			'spec.deploymentSpec.image': { title: 'Image' },
			'spec.deploymentSpec.command': { title: 'Command' },
			'spec.deploymentSpec.args': { title: 'Args' },
			'spec.deploymentSpec.env': {
				title: 'Environment Variables',
				uiSchema: {
					items: {
						'ui:title': 'Env Var',
						'ui:options': {
							addable: true,
							removable: true,
							orderable: true
						}
					}
				}
			},
			'spec.deploymentSpec.env.name': { title: 'Name' },
			'spec.deploymentSpec.env.value': { title: 'Value' },
			'spec.deploymentSpec.ports': {
				title: 'Ports',
				uiSchema: {
					items: {
						'ui:title': 'Container Port',
						'ui:options': {
							addable: true,
							removable: true,
							orderable: true
						}
					}
				}
			},
			'spec.deploymentSpec.ports.containerPort': { title: 'Container Port' },
			'spec.deploymentSpec.ports.protocol': { title: 'Protocol' },
			'spec.deploymentSpec.resources.requests.memory': { title: 'Memory Request' },
			'spec.deploymentSpec.resources.requests.cpu': { title: 'CPU Request' },
			'spec.deploymentSpec.resources.limits.memory': { title: 'Memory Limit' },
			'spec.deploymentSpec.resources.limits.cpu': { title: 'CPU Limit' }
		},
		Port: {
			'spec.serviceSpec.type': { title: 'Service Type' },
			'spec.serviceSpec.ports.port': { title: 'Service Port' },
			'spec.serviceSpec.ports.targetPort': {
				title: 'Target Port',
				uiSchema: {
					'ui:options': {
						inputType: 'number'
					}
				}
			}
		},
		Storage: {
			'spec.pvcSpec.resources.requests.storage': { title: 'Storage Size' }
		}
	};

	function transformFormData(data: Record<string, unknown>): Record<string, unknown> {
		const transformed = { ...data }; // Auto-set labels to match selector

		if (transformed.metadata && (transformed.metadata as any).name) {
			const name = (transformed.metadata as any).name;
			const labels = { app: name }; // Set deployment selector and template labels

			if (transformed.spec && (transformed.spec as any).deploymentSpec) {
				const deploymentSpec = (transformed.spec as any).deploymentSpec;
				// deploymentSpec.selector = { matchLabels: labels };
				if (deploymentSpec.template && deploymentSpec.template.metadata) {
					deploymentSpec.template.metadata.labels = labels;
				}
			} // Set service selector

			if (transformed.spec && (transformed.spec as any).serviceSpec) {
				(transformed.spec as any).serviceSpec.selector = labels;
			}
		}

		return transformed;
	}

	async function handleMultiStepSubmit(data: Record<string, unknown>) {
		if (isSubmitting) return;
		isSubmitting = true; // Construct the full resource object

		const resourceObject: Record<string, unknown> = {
			apiVersion: 'apps.otterscale.io/v1alpha1',
			kind: 'SimpleApp',
			...data
		}; // Ensure name is correct

		if (!resourceObject.metadata) resourceObject.metadata = {};
		(resourceObject.metadata as Record<string, unknown>).name = name;

		toast.promise(
			async () => {
				const manifest = new TextEncoder().encode(JSON.stringify(resourceObject));

				await resourceClient.apply({
					cluster,
					name,
					namespace: $page.url.searchParams.get('namespace') ?? '',
					group: 'apps.otterscale.io',
					version: 'v1alpha1',
					resource: 'simpleapps',
					manifest,
					fieldManager: 'otterscale-web-ui',
					force: true
				});
			},
			{
				loading: `Updating simpleapp ${name}...`,
				success: () => {
					isSubmitting = false;
					onsuccess?.();
					return `Successfully updated simpleapp ${name}`;
				},
				error: (err) => {
					isSubmitting = false;
					console.error('Failed to update simpleapp:', err);
					return `Failed to update simpleapp: ${(err as ConnectError).message}`;
				}
			}
		);
	}
</script>

<div class="h-full w-full">
	<MultiStepSchemaForm
		apiSchema={schema}
		fields={groupedFields}
		initialData={getCleanedObject()}
		title={`Edit SimpleApp: ${name}`}
		onSubmit={handleMultiStepSubmit}
		transformData={transformFormData}
		yamlEditable={true}
	/>
</div>
