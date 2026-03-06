<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import Icon from '@iconify/svelte';
	import { BookmarkIcon, DownloadIcon, TagsIcon, Trash2Icon } from '@lucide/svelte';
	import type { FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
	import { SubmitButton } from '@sjsf/form';
	import Ajv from 'ajv';
	import lodash from 'lodash';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { resolve } from '$app/paths';
	import { ResourceService } from '$lib/api/resource/v1/resource_pb';
	import Form from '$lib/components/dynamic-form/form.svelte';
	import EditorWidget from '$lib/components/dynamic-form/widgets/editor.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Item from '$lib/components/ui/item';

	import { buttonVariants } from '../ui/button/button.svelte';
	import type { ArtifactType } from './types.d.ts';

	let { artifact }: { artifact: ArtifactType } = $props();

	// const transport: Transport = getContext('transport');
	// const resourceClient = createClient(ResourceService, transport);

	const jsonSchema = {
		type: 'object',
		required: ['name', 'version', 'values'],
		properties: {
			name: {
				title: 'Name',
				type: 'string'
			},
			version: {
				title: 'Version',
				type: 'string'
			},
			values: {
				title: 'Values',
				type: 'string'
			}
		}
	} as Schema;

	// Validation
	const jsonSchemaValidator = new Ajv({
		allErrors: true
	});
	const validate = jsonSchemaValidator.compile(jsonSchema);

	// Container for Data.
	let values: any = $state({
		name: '',
		version: '',
		values: {}
	});

	// Flags
	let open = $state(false);
	let isInstalling = $state(false);
</script>

<Card.Root>
	{@const extraAttributes = artifact.extra_attrs ?? {}}
	<Card.Header>
		<Item.Root class="items-start p-0">
			<Item.Media>
				<Avatar.Root>
					<Avatar.Image src={extraAttributes.icon as string} alt="helm" />
					<Avatar.Fallback>
						<Icon icon="logos:helm" />
					</Avatar.Fallback>
				</Avatar.Root>
			</Item.Media>
			<Item.Content class="text-left">
				<Item.Title>
					{@const title = [artifact.repository_name, extraAttributes.name]
						.filter((term) => !!term)
						.join(' ')}
					{title}
				</Item.Title>
				<Item.Description class="max-w-40  truncate">
					{artifact.digest}
				</Item.Description>
			</Item.Content>
			{#if artifact.type === 'CHART'}
				<Item.Actions>
					<AlertDialog.Root bind:open>
						<AlertDialog.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
							<DownloadIcon />
						</AlertDialog.Trigger>
						<AlertDialog.Content class="max-h-[95vh] min-w-[23vw] overflow-auto">
							<Item.Root class="p-0">
								<Item.Content class="text-left">
									<Item.Title class="text-xl font-bold">Artifact</Item.Title>
									<Item.Description></Item.Description>
								</Item.Content>
							</Item.Root>
							<Form
								schema={jsonSchema as any}
								uiSchema={{
									values: {
										'ui:components': {
											textWidget: EditorWidget
										},
										'ui:options': {
											TailoredEditorDocument: '123'
										}
									}
								} as unknown as UiSchemaRoot}
								initialValue={{ name: '', version: '', values: {} } as FormValue}
								bind:values
								handleSubmit={{
									prehook: () => {
										if (isInstalling) return;
										isInstalling = true;

										const isValid = validate(values);
										if (!isValid) return;

										const name = values.name as string;

										console.log(name);

										console.log(isValid, validate.errors, values);
										// toast.promise(
										// 	async () => {
										// 		await resourceClient.delete({
										// 			cluster,
										// 			group,
										// 			version,
										// 			resource,
										// 			name
										// 		});
										// 	},
										// 	{
										// 		loading: `Deleting workspace ${name}...`,
										// 		success: () => {
										// 			// Use window.location.href to force a full page reload and re-trigger fetchWorkspaces
										// 			window.location.href = resolve(`/(auth)/scope/${cluster}`);
										// 			return `Successfully deleted workspace ${name}`;
										// 		},
										// 		error: (error) => {
										// 			console.error(`Failed to delete workspace ${name}:`, error);
										// 			return `Failed to delete workspace ${name}: ${(error as ConnectError).message}`;
										// 		},
										// 		finally() {
										// 			isInstalling = false;
										// 			open = false;
										// 		}
										// 	}
										// );
									}
								}}
								class="**:data-[slot=dynamic-form-mode-controller]:hidden"
							>
								{#snippet actions()}
									<div class="*:w-full">
										<SubmitButton />
									</div>
								{/snippet}
							</Form>
						</AlertDialog.Content>
					</AlertDialog.Root>
				</Item.Actions>
			{/if}
		</Item.Root>
	</Card.Header>
	<Card.Content>
		{#if artifact.type === 'CHART'}
			<Item.Root class="col-span-2 items-start p-0">
				<Item.Content class="text-left">
					<Item.Description>
						{extraAttributes.description}
					</Item.Description>
				</Item.Content>
			</Item.Root>
		{:else if artifact.type === 'IMAGE'}
			<Item.Root class="items-start p-0">
				<Item.Content class="text-left">
					{@const system = `${extraAttributes.architecture}/${extraAttributes.os}`}
					<Item.Description>{system}</Item.Description>
				</Item.Content>
				<Item.Content class="text-left">
					<Item.Description>{extraAttributes.author}</Item.Description>
				</Item.Content>
			</Item.Root>
		{/if}
	</Card.Content>
	<Card.Footer class="flex gap-1 overflow-hidden text-xs text-gray-500">
		{@const labels = artifact.labels ?? []}
		{@const tags = artifact.tags ?? []}
		{#each labels as label, index (index)}
			<BookmarkIcon size={12} />
			{label.name}
		{/each}
		{#each tags as tag, index (index)}
			<TagsIcon size={12} />
			{tag.name}
		{/each}
	</Card.Footer>
</Card.Root>
