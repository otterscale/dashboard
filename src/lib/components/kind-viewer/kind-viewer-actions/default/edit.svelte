<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import Ajv, { type Schema } from 'ajv';
	import * as jsonpatch from 'fast-json-patch';
	import { JSON_SCHEMA, load } from 'js-yaml';
	import lodash from 'lodash';
	import { mode as themeMode } from 'mode-watcher';
	import { getContext, tick } from 'svelte';
	import Monaco from 'svelte-monaco';
	import { toast } from 'svelte-sonner';
	import { isMap, isPair, isScalar, parseDocument, stringify, visit } from 'yaml';

	import SchemaViewer from '$lib/components/schema-viewer/schema-viewer.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { m } from '$lib/paraglide/messages';
	import Button from '$lib/components/ui/button/button.svelte';

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

	let value = $derived(stringify(object));

	let editorInstance: import('monaco-editor').editor.IStandaloneCodeEditor | undefined =
		$state(undefined);
	let monacoInstance: typeof import('monaco-editor') | undefined = $state(undefined);
	const jsonSchemaValidator = new Ajv({
		allErrors: true,
		strict: false,
		logger: false
	});
	const validate = jsonSchemaValidator.compile(jsonSchema);

	// Initialize
	async function fold(editor: import('monaco-editor').editor.IStandaloneCodeEditor) {
		const yaml = editor.getValue();
		const document = parseDocument(yaml);
		const model = editor.getModel();

		const linesToFold: number[] = [];

		if (document.contents) {
			visit(document.contents, {
				Pair(_, pair) {
					if (isScalar(pair.key) && pair.key.value === 'metadata') {
						const metadataValues: any = pair.value;
						const metadataIsMap =
							isMap(metadataValues) ||
							(metadataValues &&
								metadataValues.items &&
								metadataValues.constructor?.name === 'YAMLMap');
						if (metadataIsMap) {
							metadataValues.items.forEach((subPair: any) => {
								if (isPair(subPair) && isScalar(subPair.key)) {
									const subKey = String(subPair.key.value);
									const unfoldFields = ['name', 'namespace', 'labels', 'annotations', 'finalizers'];
									if (!unfoldFields.includes(subKey)) {
										if (model && subPair.key.range) {
											const lineNumber = model.getPositionAt(subPair.key.range[0]).lineNumber;
											linesToFold.push(lineNumber);
										}
									}
								}
							});
						}
						// Skip traversing inside metadata further since we already processed its keys.
						return visit.SKIP;
					}
				}
			});
		}

		if (linesToFold.length > 0) {
			// Sort from bottom to top to avoid line shift issues during folding
			for (const line of [...new Set(linesToFold)].sort((a, b) => b - a)) {
				editor.setPosition({ lineNumber: line, column: 1 });
				await editor.getAction('editor.fold')?.run();
			}

			editor.setPosition({ lineNumber: 1, column: 1 });
		}
	}
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
					await fold(editorInstance!);
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

		isSubmitting = true;

		const initialStructuredValue: any = load(stringify(object), { schema: JSON_SCHEMA });
		const currentStructuredValue: any = load(value, { schema: JSON_SCHEMA });

		const patches = jsonpatch.compare(initialStructuredValue, currentStructuredValue);

		if (patches.length === 0) {
			isSubmitting = false;
			open = false;
			return;
		}

		let partialManifestValue = lodash.cloneDeep(currentStructuredValue);

		const systemFields = [
			'clusterName',
			'creationTimestamp',
			'deletionGracePeriodSeconds',
			'deletionTimestamp',
			'finalizers',
			'generateName',
			'generation',
			'initializers',
			'managedFields',
			'ownerReferences',
			'resourceVersion',
			'relationships',
			'selfLink',
			'state',
			'uid'
		];

		if (partialManifestValue.metadata) {
			for (const field of systemFields) {
				if (partialManifestValue.metadata[field] !== undefined) {
					delete partialManifestValue.metadata[field];
				}
			}
		}

		const manifest = new TextEncoder().encode(JSON.stringify(partialManifestValue));
		const name = lodash.get(initialStructuredValue, 'metadata.name');
		toast.promise(
			async () => {
				await resourceClient.apply({
					cluster,
					namespace,
					group,
					version,
					resource,
					name,
					manifest,
					fieldManager: 'otterscale-web-ui',
					force: true
				});
			},
			{
				loading: `Editing ${kind} ${name}...`,
				success: `Successfully edited ${kind} ${name}`,
				error: (error) => {
					console.error(`Failed to edit ${kind} ${name}:`, error);
					return `Failed to edit ${kind} ${name}: ${(error as ConnectError).message}`;
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
					<PencilIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>Edit</Item.Title>
				</Item.Content>
			</Item.Root>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="min-w-[77vw]">
		<Dialog.Header>
			<Item.Root class="p-0">
				<Item.Content class="text-left">
					<Item.Title class="text-lg font-bold">{kind}</Item.Title>
					<Item.Description>{lodash.get(jsonSchema, 'description')}</Item.Description>
				</Item.Content>
				<Item.Actions>
					{group ? String(group) : 'core'}/{version}
				</Item.Actions>
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
