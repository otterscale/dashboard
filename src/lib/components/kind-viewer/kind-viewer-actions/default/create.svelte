<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import Plus from '@lucide/svelte/icons/plus';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import Ajv, { type Schema, type ValidateFunction } from 'ajv';
	import lodash from 'lodash';
	import { mode as themeMode } from 'mode-watcher';
	import { getContext, onMount } from 'svelte';
	import Monaco from 'svelte-monaco';
	import { toast } from 'svelte-sonner';
	import type { Node } from 'yaml';
	import { parseDocument, stringify } from 'yaml';

	import { filterRequiredSchema, getInitialValues } from '$lib/components/dynamic-form/utils';
	import SchemaViewer from '$lib/components/schema-viewer/schema-viewer.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/paraglide/messages';

	let {
		cluster,
		namespace,
		group,
		version,
		kind,
		resource,
		schema: jsonSchema
	}: {
		cluster: string;
		namespace: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema: Schema;
	} = $props();

	let initialValue = $state('');
	let value = $state('');
	let open = $state(false);

	// Bind to Monaco
	let editorInstance: import('monaco-editor').editor.IStandaloneCodeEditor | undefined =
		$state(undefined);
	let monacoInstance: typeof import('monaco-editor') | undefined = $state(undefined);

	// Validator
	const jsonSchemaValidator = new Ajv({
		allErrors: true,
		strict: false,
		logger: false
	});

	// Validate Once
	let validate: ValidateFunction | undefined = $state(undefined);
	function performValidation(
		editorInstance: import('monaco-editor').editor.IStandaloneCodeEditor | undefined,
		monacoInstance: typeof import('monaco-editor') | undefined,
		validate: ValidateFunction | undefined
	) {
		if (!editorInstance || !monacoInstance || !validate) return;

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
				const node = document.getIn(targetPath, true) as unknown as Node;
				const severity = monaco.MarkerSeverity.Error;
				if (node && node.range) {
					const [start, end] = node.range.map((point) => model.getPositionAt(point));

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

	// Validate Continuously
	$effect(() => {
		if (editorInstance && monacoInstance && validate) {
			// Setup validation listener when editor is ready
			performValidation(editorInstance, monacoInstance, validate);

			const disposable = editorInstance.onDidChangeModelContent(() => {
				performValidation(editorInstance, monacoInstance, validate);
			});

			return () => disposable.dispose();
		}
	});

	// Submit
	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);
	let isSubmitting = $state(false);
	function handleConfirm(validate: ValidateFunction | undefined) {
		if (isSubmitting) return;

		if (!validate) return;

		const document = parseDocument(value);
		if (document.errors.length > 0) {
			toast.error('YAML syntax errors found. Please fix them before submitting.');
			return;
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const parsed = document.toJS() as Record<string, any>;
		if (!validate(parsed)) {
			toast.error(`Validation errors: ${JSON.stringify(validate.errors)}`);
			return;
		}

		isSubmitting = true;
		const name = (parsed.metadata as { name: string })?.name || kind;

		toast.promise(
			async () => {
				await resourceClient.create({
					cluster,
					namespace,
					group,
					version,
					resource,
					manifest: new TextEncoder().encode(JSON.stringify(parsed))
				});
			},
			{
				loading: `Creating ${kind} ${name}...`,
				success: `Successfully created ${kind} ${name}`,
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

	onMount(async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let initialValues: any = await getInitialValues(filterRequiredSchema(jsonSchema));

		lodash.set(initialValues, 'apiVersion', group ? `${group}/${version}` : version);
		lodash.set(initialValues, 'kind', kind);
		if (namespace) {
			lodash.set(initialValues, 'metadata.namespace', namespace);
		}
		initialValue = stringify(initialValues);
	});
</script>

<Tooltip.Root>
	<Dialog.Root
		bind:open
		onOpenChange={(isOpen) => {
			if (!isOpen) return;

			value = initialValue;
			validate = jsonSchemaValidator.compile(jsonSchema);
			// editorInstance initialized by Monaco component.
			// monacoInstance initialized by Monaco component.
		}}
		onOpenChangeComplete={(isOpen) => {
			if (isOpen) return;

			value = '';
			validate = undefined;
			editorInstance = undefined;
			monacoInstance = undefined;
		}}
	>
		<Tooltip.Trigger>
			<Dialog.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="outline" size="icon">
						<Plus />
					</Button>
				{/snippet}
			</Dialog.Trigger>
		</Tooltip.Trigger>
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
			<Dialog.Footer>
				<Button class="mr-auto" variant="outline" onclick={() => (open = false)}
					>{m.cancel()}</Button
				>
				<Button onclick={() => handleConfirm(validate)}>
					{m.confirm()}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
	<Tooltip.Content>Create Resource</Tooltip.Content>
</Tooltip.Root>
