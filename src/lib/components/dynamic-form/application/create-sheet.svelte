<script lang="ts">
	import { Plus } from '@lucide/svelte';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import * as Sheet from '$lib/components/ui/sheet';

	import CreateApplicationForm from './create-form.svelte';

	type Props = {
		schema?: any;
		onsuccess?: (application?: any) => void;
	};

	let { schema, onsuccess }: Props = $props();
	let open = $state(false);

	function handleApplicationSuccess(application?: any) {
		open = false;
		if (application?.metadata?.name) {
			onsuccess?.(application);
			goto(
				resolve(
					`/(auth)/${page.params.cluster}/Application/applications?group=apps.otterscale.io&version=v1alpha1&name=${application.metadata.name}&namespace=${page.url.searchParams.get('namespace') ?? ''}`
				)
			);
		}
	}
</script>

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
			<CreateApplicationForm {schema} onsuccess={handleApplicationSuccess} />
		</div>
	</Sheet.Content>
</Sheet.Root>
