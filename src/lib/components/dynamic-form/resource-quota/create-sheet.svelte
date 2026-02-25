<script lang="ts">
	import { Plus } from '@lucide/svelte';
	import { type CoreV1ResourceQuota } from '@otterscale/types';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Sheet from '$lib/components/ui/sheet';
	import { activeNamespace } from '$lib/stores';

	import CreateForm from './create-form.svelte';

	let {
		schema,
		onsuccess
	}: {
		schema?: any;
		onsuccess?: (resourceQuota?: CoreV1ResourceQuota) => void;
	} = $props();

	let open = $state(false);

	function handleSuccess(resourceQuota?: CoreV1ResourceQuota) {
		open = false;
		if (resourceQuota?.metadata?.name) {
			onsuccess?.(resourceQuota);
			goto(
				resolve(
					`/(auth)/${page.params.cluster}/ResourceQuota/resourcequotas?group=&version=v1&namespace=${$activeNamespace}&name=${resourceQuota.metadata.name}`
				)
			);
		}
	}
</script>

<!-- <pre>
{JSON.stringify(schema, null, 2)}
</pre> -->
<Sheet.Root bind:open>
	<Sheet.Trigger>
		<Button variant="outline" size="icon">
			<Plus class="size-4" />
		</Button>
	</Sheet.Trigger>
	<Sheet.Content
		class="fixed top-1/2 left-1/2 h-[90vh] w-[90vw] max-w-4xl min-w-3/4 -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background shadow-lg"
	>
		<div class="h-full p-6">
			<CreateForm {schema} onsuccess={handleSuccess} />
		</div>
	</Sheet.Content>
</Sheet.Root>
