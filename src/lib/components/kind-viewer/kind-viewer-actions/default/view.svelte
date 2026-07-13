<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import FileCodeIcon from '@lucide/svelte/icons/file-code';
	import FileJsonIcon from '@lucide/svelte/icons/file-json';
	import type { Schema } from '@sjsf/form';
	import lodash from 'lodash';
	import { stringify } from 'yaml';

	import * as Code from '$lib/components/custom/code';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import * as Tooltip from '$lib/components/ui/tooltip';

	import { ACTION_DIALOG_CONTENT_CLASS } from './constants';

	let {
		schema,
		object,
		onOpenChangeComplete
	}: {
		schema: Schema;
		object: any; // eslint-disable-line @typescript-eslint/no-explicit-any
		onOpenChangeComplete?: () => void;
	} = $props();

	const name: string = $derived(object?.metadata?.name ?? object?.kind ?? '');
	const yaml: string = $derived(stringify(object));
	const json: string = $derived(
		JSON.stringify(
			object,
			(key, value) => (typeof value === 'bigint' ? value.toString() : value),
			2
		)
	);

	let open = $state(false);
	let copied = $state(false);
	let mode = $state<'yaml' | 'json'>('yaml');

	const content = $derived(mode === 'yaml' ? yaml : json);

	async function copyContent() {
		await navigator.clipboard.writeText(content);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	function downloadContent() {
		const blob = new Blob([content], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${name}.${mode}`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<Dialog.Root bind:open {onOpenChangeComplete}>
	<Dialog.Trigger class="w-full">
		<Item.Root class="p-0 text-xs" size="sm">
			<Item.Media>
				<EyeIcon />
			</Item.Media>
			<Item.Content>
				<Item.Title>View</Item.Title>
			</Item.Content>
		</Item.Root>
	</Dialog.Trigger>
	<Dialog.Content class={ACTION_DIALOG_CONTENT_CLASS}>
		<Dialog.Header>
			<div class="flex items-end justify-between gap-4">
				<div class="flex flex-col gap-1.5 text-left">
					<Dialog.Title class="text-lg font-bold">View — {name}</Dialog.Title>
					<Dialog.Description>
						{lodash.get(schema, 'description') || `${object.kind} manifest`}
					</Dialog.Description>
				</div>
				<!-- -mr-2 lines the icon column up with the dialog's close button (right-4 vs p-6). -->
				<div class="-mr-2 flex shrink-0 items-center gap-1">
					<Tooltip.Root ignoreNonKeyboardFocus>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									size="icon-sm"
									variant="ghost"
									disabled={mode === 'yaml'}
									onclick={() => (mode = 'yaml')}
									aria-label="YAML view"
								>
									<FileCodeIcon />
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>YAML view</Tooltip.Content>
					</Tooltip.Root>
					<Tooltip.Root ignoreNonKeyboardFocus>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									size="icon-sm"
									variant="ghost"
									disabled={mode === 'json'}
									onclick={() => (mode = 'json')}
									aria-label="JSON view"
								>
									<FileJsonIcon />
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>JSON view</Tooltip.Content>
					</Tooltip.Root>
					<Tooltip.Root ignoreNonKeyboardFocus>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									size="icon-sm"
									variant="ghost"
									onclick={copyContent}
									aria-label="Copy to clipboard"
								>
									{#if copied}
										<CheckIcon />
									{:else}
										<CopyIcon />
									{/if}
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>{copied ? 'Copied!' : 'Copy to clipboard'}</Tooltip.Content>
					</Tooltip.Root>
					<Tooltip.Root ignoreNonKeyboardFocus>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									size="icon-sm"
									variant="ghost"
									onclick={downloadContent}
									aria-label="Download manifest"
								>
									<DownloadIcon />
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>Download as {mode === 'yaml' ? 'YAML' : 'JSON'}</Tooltip.Content>
					</Tooltip.Root>
				</div>
			</div>
		</Dialog.Header>
		<div class="min-h-0 flex-1 overflow-auto rounded-md">
			<Code.Root variant="secondary" lang={mode} code={content} class="h-full w-full border-none" />
		</div>
	</Dialog.Content>
</Dialog.Root>
