<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { PlusIcon } from '@lucide/svelte';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import Ajv, { type Schema } from 'ajv';
	import { load } from 'js-yaml';
	import lodash from 'lodash';
	import { mode as themeMode } from 'mode-watcher';
	import { getContext, tick } from 'svelte';
	import Monaco from 'svelte-monaco';
	import { toast } from 'svelte-sonner';
	import { parseDocument, stringify } from 'yaml';

	import SchemaViewer from '$lib/components/schema-viewer/schema-viewer.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { m } from '$lib/paraglide/messages';

	let {
		cluster,
		namespace,
		group,
		version,
		kind,
		resource,
		schema: jsonSchema,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		namespace?: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema: Schema;
		object: any;
		onOpenChangeComplete: () => void;
	} = $props();

	let value = $state(
		stringify({
			apiVersion: lodash.get(object, 'apiVersion'),
			kind: lodash.get(object, 'kind'),
			metadata: {
				name: '',
				namespace: namespace
			},
			spec: lodash.get(object, 'spec')
		})
	);

	let editorInstance: import('monaco-editor').editor.IStandaloneCodeEditor | undefined =
		$state(undefined);
	let monacoInstance: typeof import('monaco-editor') | undefined = $state(undefined);
	const jsonSchemaValidator = new Ajv({
		allErrors: true,
		strict: false,
		logger: false
	});
	const validate = jsonSchemaValidator.compile(jsonSchema);

	function performValidation() {
		if (!editorInstance || !monacoInstance) return;

		const monaco = monacoInstance;
		const markers: import('monaco-editor').editor.IMarkerData[] = [];

		const model = editorInstance.getModel();
		if (!model) return;

		const content = model.getValue();
		const document = parseDocument(content);

		// Validate Syntax
		if (document.errors.length > 0) {
			document.errors.forEach((error) => {
				const [start, end] = error.pos.map((position) => model.getPositionAt(position));
				markers.push({
					startLineNumber: start.lineNumber,
					startColumn: start.column,
					endLineNumber: end.lineNumber,
					endColumn: end.column,
					message: `Syntax Error: ${error.message}`,
					severity: monaco.MarkerSeverity.Error
				});
			});
		}

		// Validate Semantic
		const representation = document.toJS();
		const valid = validate(representation);
		if (!valid && validate.errors) {
			validate.errors.forEach((error) => {
				let targetPath: string[] = [];
				let errorMessage = '';

				// Classify Errors
				if (error.keyword === 'required') {
					const missingKey = error.params.missingProperty;
					errorMessage = `Missing Required Property: ${missingKey}`;
				} else {
					errorMessage = `Format Error: ${error.message}`;
				}

				// Locate Errors
				targetPath = error.instancePath.split('/').filter((path) => path !== '');
				const node = document.getIn(targetPath, true) as any;
				const severity =
					node?.value === null ? monaco.MarkerSeverity.Hint : monaco.MarkerSeverity.Error;

				if (node && node.range) {
					const [start, end] = node.range.map((point: any) => model.getPositionAt(point));

					if (error.keyword === 'required') {
						markers.push({
							startLineNumber: end.lineNumber,
							startColumn: 1,
							endLineNumber: end.lineNumber,
							endColumn: model.getLineMaxColumn(end.lineNumber),
							message: errorMessage,
							severity: severity
						});
					} else {
						markers.push({
							startLineNumber: start.lineNumber,
							startColumn: start.column,
							endLineNumber: end.lineNumber,
							endColumn: end.column,
							message: errorMessage,
							severity: severity
						});
					}
				} else {
					markers.push({
						startLineNumber: 1,
						startColumn: 1,
						endLineNumber: 1,
						endColumn: model.getLineMaxColumn(1),
						message: errorMessage,
						severity: severity
					});
				}
			});
		}

		monaco.editor.setModelMarkers(model, 'yaml-validator', markers);
	}
	let isReady = $state(false);
	$effect(() => {
		if (editorInstance && monacoInstance) {
			tick().then(() => {
				requestAnimationFrame(async () => {
					isReady = true;
				});
			});
			performValidation();

			const disposable = editorInstance.onDidChangeModelContent(() => {
				performValidation();
			});

			return () => disposable.dispose();
		}
	});

	// Submit
	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	let open = $state(false);
	let isSubmitting = $state(false);
	function handleConfirm() {
		if (isSubmitting) return;

		const document = parseDocument(value);
		if (document.errors.length > 0) {
			toast.error('YAML syntax errors found. Please fix them before submitting.');
			return;
		}

		const parsed = document.toJS() as Record<string, any>;
		if (!validate(parsed)) {
			toast.error(`Validation errors: ${JSON.stringify(validate.errors)}`);
			return;
		}

		isSubmitting = true;

		const manifest = new TextEncoder().encode(value);
		const name = lodash.get(load(value), 'metadata.name');
		toast.promise(
			async () => {
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
				loading: `Editing ${kind} ${name}...`,
				success: `Successfully create ${kind} ${name}`,
				error: (error) => {
					console.error(`Failed to create ${kind} ${name}:`, error);
					return `Failed to create ${kind} ${name}: ${(error as ConnectError).message}`;
				},
				finally: () => {
					isSubmitting = false;
					open = false;
				}
			}
		);
	}
</script>

<Dialog.Root
	bind:open
	onOpenChangeComplete={(isOpen) => {
		onOpenChangeComplete?.();
		if (!isOpen) {
			editorInstance = undefined;
			value = stringify(object);
			isReady = false;
		}
	}}
>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Item.Root {...props} class="w-full p-0 text-xs" size="sm">
				<Item.Media>
					<PlusIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>Duplicate</Item.Title>
				</Item.Content>
			</Item.Root>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="min-w-[77vw]" onInteractOutside={(e) => e.preventDefault()}>
		<Dialog.Header>
			<Item.Root class="p-0">
				<Item.Content class="text-left">
					<Item.Title class="text-lg font-bold">{kind}</Item.Title>
					<Item.Description>{lodash.get(jsonSchema, 'description')}</Item.Description>
				</Item.Content>
			</Item.Root>
		</Dialog.Header>
		<div class="grid grid-cols-2 gap-4 *:max-h-[62vh] *:min-h-[62vh]">
			<SchemaViewer schema={jsonSchema} class="h-full max-h-screen min-h-0 overflow-auto" />
			<div class="transition-opacity duration-300 {isReady ? 'opacity-100' : 'opacity-0'}">
				<Monaco
					options={{
						language: 'yaml',
						padding: { top: 24 },
						automaticLayout: true,
						folding: true,
						foldingStrategy: 'indentation',
						showFoldingControls: 'always'
					}}
					theme={themeMode.current === 'dark' ? 'vs-dark' : 'vs-light'}
					bind:value
					bind:editor={editorInstance}
					bind:monaco={monacoInstance}
				/>
			</div>
		</div>
		<Dialog.Footer>
			<Button class="mr-auto" variant="outline" onclick={() => (open = false)}>{m.cancel()}</Button>
			<Button onclick={handleConfirm}>
				{m.confirm()}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
