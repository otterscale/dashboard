<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { page } from '$app/state';
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
	const cluster = $derived(page.params.cluster ?? page.params.scope ?? '');

	// Remove metadata.managedFields from object
	function getCleanedObject() {
		const copy = structuredClone($state.snapshot(object) as Record<string, unknown>);
		if (copy.metadata && typeof copy.metadata === 'object') {
			delete (copy.metadata as Record<string, unknown>).managedFields;
		}
		return copy;
	}

	let isSubmitting = $state(false);

	// Grouped fields for multi-step form (3 pages)
	const groupedFields: GroupedFields = {
		'Default Resource Settings': {
			'spec.hard.requests.cpu': { title: 'Requests CPU' },
			'spec.hard.requests.memory': { title: 'Requests Memory' },
			'spec.hard.requests.otterscale.com/vgpu': {
				title: 'Requests GPU'
			},
			'spec.hard.requests.otterscale.com/vgpumem': {
				title: 'Requests GPU Memory'
			},
			'spec.hard.requests.otterscale.com/vgpumem-percentage': {
				title: 'Requests GPU Memory Percentage'
			}
		}
	};

	function transformFormData(data: Record<string, unknown>) {
		const spec = data.spec as Record<string, any>;

		// Handle Resource Quota Logic: limits align with requests, strict defaults
		if (spec?.hard) {
			const hard = spec.hard;
			// Sync limits with requests
			if (hard['requests.cpu']) hard['limits.cpu'] = hard['requests.cpu'];
			if (hard['requests.memory']) hard['limits.memory'] = hard['requests.memory'];
		}

		return data;
	}

	async function handleMultiStepSubmit(data: Record<string, unknown>) {
		if (isSubmitting) return;
		isSubmitting = true;

		// Construct the full resource object - metadata.name should already be in data or we ensure it
		const resourceObject: Record<string, any> = {
			apiVersion: 'v1',
			kind: 'ResourceQuota',
			...data
		};

		const name = (data.metadata as { name: string })?.name;

		toast.promise(
			async () => {
				const manifest = new TextEncoder().encode(JSON.stringify(resourceObject));
				const namespace = page.url.searchParams.get('namespace');
				if (!namespace) {
					throw new Error('Namespace is required but not found in searchParams.');
				}
				await resourceClient.apply({
					cluster,
					name,
					namespace,
					group: '',
					version: 'v1',
					resource: 'resourcequotas',
					manifest,
					fieldManager: 'otterscale-web-ui',
					force: true
				});
			},
			{
				loading: `Updating resource quota ${name}...`,
				success: () => {
					isSubmitting = false;
					onsuccess?.();
					return `Successfully updated resource quota ${name}`;
				},
				error: (err) => {
					isSubmitting = false;
					console.error('Failed to update resource quota:', err);
					return `Failed to update resource quota: ${(err as ConnectError).message}`;
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
		title={`Edit Resource Quota: ${name}`}
		onSubmit={handleMultiStepSubmit}
		transformData={transformFormData}
	/>
</div>
