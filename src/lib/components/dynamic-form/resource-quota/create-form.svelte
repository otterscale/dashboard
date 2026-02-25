<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { page } from '$app/state';
	import { ResourceService } from '$lib/api/resource/v1/resource_pb';
	import { type GroupedFields, MultiStepSchemaForm } from '$lib/components/custom/schema-form';

	let {
		schema: apiSchema,
		onsuccess
	}: {
		schema?: any;
		onsuccess?: (resourceQuota?: any) => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);
	const cluster = $derived(page.params.cluster ?? page.params.scope ?? ''); // TODO: Change to cluster after the URL refactor completes.

	let isSubmitting = $state(false);

	// Default values for Resource Quota and Limit Range
	const initialData = {
		spec: {
			hard: {
				'requests.cpu': '16',
				'requests.memory': '32Gi',
				'requests.otterscale.com/vgpu': '0',
				'requests.otterscale.com/vgpumem': '0',
				'requests.otterscale.com/vgpumem-percentage': '0',
				'limits.cpu': '16',
				'limits.memory': '32Gi'
			}
		}
	};

	const groupedFields: GroupedFields = {
		General: {
			'metadata.name': { title: 'Name', required: true }
		},
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

		// Construct the full resource object
		const resourceObject = {
			apiVersion: 'v1',
			kind: 'ResourceQuota',
			...data
		};

		const name = (data.metadata as { name: string })?.name;

		toast.promise(
			async () => {
				const manifest = new TextEncoder().encode(JSON.stringify(resourceObject));

				await resourceClient.create({
					cluster,
					namespace: page.url.searchParams.get('namespace') ?? '',
					group: '',
					version: 'v1',
					resource: 'resourcequotas',
					manifest
				});

				return resourceObject;
			},
			{
				loading: `Creating resource quota ${name}...`,
				success: (resourceQuota) => {
					isSubmitting = false;
					onsuccess?.(resourceQuota);
					return `Successfully created resource quota ${name}`;
				},
				error: (err) => {
					isSubmitting = false;
					console.error('Failed to create resource quota:', err);
					return `Failed to create resource quota: ${(err as ConnectError).message}`;
				}
			}
		);
	}
</script>

<div class="h-full w-full">
	{#if apiSchema}
		<MultiStepSchemaForm
			{apiSchema}
			fields={groupedFields}
			{initialData}
			title="Create Resource Quota"
			onSubmit={handleMultiStepSubmit}
			transformData={transformFormData}
		/>
	{:else}
		<div class="flex h-32 items-center justify-center">
			<p class="text-muted-foreground">Loading schema...</p>
		</div>
	{/if}
</div>
