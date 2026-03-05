<script lang="ts" module>
	import shell from 'highlight.js/lib/languages/shell';
	import yaml from 'highlight.js/lib/languages/yaml';
	import 'highlight.js/styles/github.css';
	import rehypeHighlight from 'rehype-highlight';
	import type { Plugin } from 'svelte-exmarkdown';
	import Markdown from 'svelte-exmarkdown';
	import { gfmPlugin } from 'svelte-exmarkdown/gfm';
	import Monaco from 'svelte-monaco';

	import * as Resizable from '$lib/components/ui/resizable';
	import '@sjsf/form/fields/extra-widgets/combobox';

	import type { ButtonProps } from '$lib/components/ui/button/button.svelte';

	declare module '@sjsf/form' {
		interface UiOptions {
			TailoredEditorDocument?: string;
			TailoredEditorTrigger?: ButtonProps;
		}
	}
</script>

<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import {
		ariaInvalidProp,
		type ComponentProps,
		composeProps,
		disabledProp,
		getFormContext,
		handlersAttachment,
		retrieveUiOption,
		uiOptionProps
	} from '@sjsf/form';

	const ctx = getFormContext();

	let { value = $bindable(), config, handlers }: ComponentProps['textWidget'] = $props();

	const { oninput, onchange, ...buttonHandlers } = $derived(handlers);

	const plugins: Plugin[] = [
		gfmPlugin(),
		{
			rehypePlugin: [
				rehypeHighlight,
				{
					ignoreMissing: true,
					languages: { shell, yaml }
				}
			]
		}
	];

	const document: string = $derived(
		retrieveUiOption(ctx, config, 'TailoredEditorDocument') as string
	);

	let valueProxy = $state(value ?? '');
	$effect(() => {
		value = valueProxy;
	});

	let open = $state(false);

	if (!document) {
		throw new Error('TailoredEditorDocument ui option is required for EditorWidget');
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger class="w-full justify-between" {...disabledProp({}, config, ctx)}>
		{#snippet child({ props })}
			<Button
				{...composeProps(
					ctx,
					config,
					{
						variant: 'outline',
						...props,
						role: 'combobox',
						'aria-expanded': open
					} satisfies ButtonProps,
					uiOptionProps('TailoredEditorTrigger'),
					handlersAttachment(buttonHandlers),
					ariaInvalidProp
				)}
			>
				<p class="w-full text-center">Edit</p>
			</Button>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="max-h-[95vh] min-h-[95vh] max-w-[95vw] min-w-[95vw]">
		<Resizable.PaneGroup direction="horizontal">
			<Resizable.Pane defaultSize={50}>
				<div class="markdown h-full overflow-auto">
					<Markdown {plugins} md={document} />
				</div>
			</Resizable.Pane>
			<Resizable.Handle withHandle />
			<Resizable.Pane defaultSize={50}>
				<Monaco
					options={{
						language: 'yaml',
						padding: { top: 32, bottom: 8 },
						automaticLayout: true
					}}
					theme="vs-dark"
					bind:value={valueProxy}
				/>
			</Resizable.Pane>
		</Resizable.PaneGroup>
	</Dialog.Content>
</Dialog.Root>

<style lang="postcss">
	@reference "tailwindcss";

	.markdown :global(h1) {
		@apply mt-8 mb-4 border-b border-gray-200 pb-2 text-2xl font-bold;
	}
	.markdown :global(h2) {
		@apply mt-8 mb-4 border-b border-gray-200 pb-2 text-xl font-bold;
	}
	.markdown :global(h3) {
		@apply mt-5 mb-2 text-lg font-semibold;
	}
	.markdown :global(h4) {
		@apply mt-4 mb-2 text-base font-semibold;
	}
	.markdown :global(h5) {
		@apply mt-4 mb-2 text-sm font-semibold;
	}
	.markdown :global(h6) {
		@apply mt-4 mb-2 text-xs font-semibold text-gray-600;
	}
	.markdown :global(p) {
		@apply mb-4;
	}
	.markdown :global(a) {
		@apply break-words text-blue-600 underline transition-colors hover:text-blue-800;
	}
	.markdown :global(ul),
	.markdown :global(ol) {
		@apply mb-4 pl-8;
	}
	.markdown :global(ul) > :global(li) {
		@apply list-disc;
	}
	.markdown :global(ol) > :global(li) {
		@apply list-decimal;
	}
	.markdown :global(li) {
		@apply mb-1;
	}
	.markdown :global(blockquote) {
		@apply mb-4 rounded border-l-4 border-gray-300 bg-gray-50 pl-4 text-gray-700;
	}
	.markdown :global(pre) {
		@apply mb-4 overflow-x-auto rounded bg-gray-100 p-4 text-sm leading-relaxed;
	}
	.markdown :global(code) {
		@apply rounded bg-gray-200 px-1 py-0.5 font-mono text-sm;
	}
	.markdown :global(pre) :global(code) {
		@apply m-0 rounded-none bg-transparent p-0 text-inherit;
	}
	.markdown :global(table) {
		@apply my-6 w-full border-collapse;
	}
	.markdown :global(th),
	.markdown :global(td) {
		@apply border border-gray-200 px-4 py-2;
	}
	.markdown :global(th) {
		@apply bg-gray-50 font-semibold;
	}
	.markdown :global(img) {
		@apply h-auto max-w-full rounded;
	}
	.markdown :global(hr) {
		@apply my-8 border-t border-gray-200;
	}
	.markdown :global(strong) {
		@apply font-bold;
	}
	.markdown :global(em) {
		@apply italic;
	}
	.markdown :global(del) {
		@apply line-through;
	}
</style>
