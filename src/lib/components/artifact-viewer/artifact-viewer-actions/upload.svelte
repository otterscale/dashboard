<script lang="ts">
	import SiDocker from '@icons-pack/svelte-simple-icons/icons/SiDocker.svelte';
	import SiHelm from '@icons-pack/svelte-simple-icons/icons/SiHelm.svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { SvelteURL } from 'svelte/reactivity';

	import { env as publicEnv } from '$env/dynamic/public';
	import * as Code from '$lib/components/custom/code';
	import CopyButton from '$lib/components/custom/copy-button/copy-button.svelte';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { m } from '$lib/paraglide/messages';

	let { namespace }: { namespace: string } = $props();

	const harborUniformResourceLocator = new SvelteURL(publicEnv.PUBLIC_HARBOR_URL ?? '');
</script>

<Dialog.Root>
	<Dialog.Trigger class={buttonVariants({ variant: 'outline', size: 'icon' })}>
		<PlusIcon />
	</Dialog.Trigger>
	<Dialog.Content class="max-h-[77vh] w-full min-w-[50vw] overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title class="text-center">{m.commands()}</Dialog.Title>
		</Dialog.Header>

		<Item.Root class="w-full">
			{@const command = `docker push ${harborUniformResourceLocator.host}/<repository>[:<tag>]`}
			<Item.Media variant="icon">
				<SiDocker class="size-4" />
			</Item.Media>
			<Item.Content class="flex flex-col items-start">
				<Item.Description>{m.push_image_description()}</Item.Description>
				<Item.Title><p class="font-mono text-xs">{command}</p></Item.Title>
			</Item.Content>
			<Item.Actions>
				<CopyButton text={command} />
			</Item.Actions>
		</Item.Root>

		<Item.Root class="w-full">
			{@const command = `helm push <chart_package> oci://${harborUniformResourceLocator.host}/${namespace} --plain-http`}
			<Item.Media variant="icon">
				<SiHelm class="size-4" />
			</Item.Media>
			<Item.Content class="flex flex-col items-start">
				<Item.Description>{m.push_chart_description()}</Item.Description>
				<Item.Title><p class="font-mono text-xs">{command}</p></Item.Title>
			</Item.Content>
			<Item.Actions>
				<CopyButton text={command} />
			</Item.Actions>
		</Item.Root>

		<div class="m-4 space-y-2 rounded-lg bg-muted p-4">
			<h3 class="text-sm font-semibold">{m.trouble_pushing_image()}</h3>
			<Collapsible.Root>
				<Collapsible.Trigger class="text-sm hover:underline">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html m.trouble_pushing_image_step_one({
						daemon: '<span class="font-mono">daemon.json</span>',
						insecure_registries: '<span class="font-mono">insecure-registries</span>'
					})}
				</Collapsible.Trigger>
				<Collapsible.Content>
					<div class="space-y-2 p-4 text-sm text-muted-foreground">
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html m.trouble_pushing_image_step_one_details({
							insecure_registries: '<span class="font-mono">insecure-registries</span>',
							daemon: '<span class="font-mono">daemon.json</span>',
							path: '<span class="font-mono">/etc/docker/daemon.json</span>'
						})}
						<Code.Root
							class="w-fit border-none bg-transparent"
							lang="json"
							code={JSON.stringify(
								{
									'insecure-registries': [harborUniformResourceLocator.host]
								},
								null,
								2
							)}
							hideLines
						/>
					</div>
				</Collapsible.Content>
			</Collapsible.Root>

			<Collapsible.Root>
				<Collapsible.Trigger class="text-sm hover:underline">
					{m.trouble_pushing_image_step_two()}
				</Collapsible.Trigger>
				<Collapsible.Content>
					<div class="space-y-2 p-4 text-sm text-muted-foreground">
						{m.trouble_pushing_image_step_two_details()}
						<Code.Root
							class="w-fit border-none bg-transparent"
							lang="bash"
							code={['sudo systemctl daemon-reload', 'sudo systemctl restart docker'].join('\n')}
							hideLines
						/>
					</div>
				</Collapsible.Content>
			</Collapsible.Root>
		</div>
	</Dialog.Content>
</Dialog.Root>
