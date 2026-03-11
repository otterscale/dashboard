<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { Plus } from '@lucide/svelte';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import Ajv from 'ajv';
	import { mode as themeMode } from 'mode-watcher';
	import { getContext } from 'svelte';
	import Monaco from 'svelte-monaco';
	import { toast } from 'svelte-sonner';
	import { parseDocument } from 'yaml';

	import SchemaViewer from '$lib/components/schema-viewer/schema-viewer.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import Button from '$lib/components/ui/button/button.svelte';
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
		schema: any;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const jsonSchemaValidator = new Ajv({
		allErrors: true,
		strict: false,
		logger: false
	});
	const validate = jsonSchemaValidator.compile(jsonSchema);

	const initialValue = `\
apiVersion: ""
kind: ""
metadata:
  name: ""
`;

	let value = $state(initialValue);
	let open = $state(false);
	let isSubmitting = $state(false);
	let editorInstance: import('monaco-editor').editor.IStandaloneCodeEditor | undefined =
		$state(undefined);
	let monacoInstance: typeof import('monaco-editor') | undefined = $state(undefined);

	$effect(() => {
		if (editorInstance && monacoInstance) {
			// Setup validation listener when editor is ready
			performValidation();

			const disposable = editorInstance.onDidChangeModelContent(() => {
				performValidation();
			});

			return () => disposable.dispose();
		}
	});

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
				if (node && node.range) {
					const [start, end] = node.range.map((point: any) => model.getPositionAt(point));

					if (error.keyword === 'required') {
						markers.push({
							startLineNumber: end.lineNumber,
							startColumn: 1,
							endLineNumber: end.lineNumber,
							endColumn: model.getLineMaxColumn(end.lineNumber),
							message: errorMessage,
							severity: monaco.MarkerSeverity.Error
						});
					} else {
						markers.push({
							startLineNumber: start.lineNumber,
							startColumn: start.column,
							endLineNumber: end.lineNumber,
							endColumn: end.column,
							message: errorMessage,
							severity: monaco.MarkerSeverity.Error
						});
					}
				} else {
					markers.push({
						startLineNumber: 1,
						startColumn: 1,
						endLineNumber: 1,
						endColumn: model.getLineMaxColumn(1),
						message: errorMessage,
						severity: monaco.MarkerSeverity.Error
					});
				}
			});
		}

		monaco.editor.setModelMarkers(model, 'yaml-validator', markers);
	}

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
</script>

<AlertDialog.Root
	bind:open
	onOpenChangeComplete={(isOpen) => {
		if (!isOpen) {
			editorInstance = undefined;
			value = initialValue;
		}
	}}
>
	<AlertDialog.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline" size="icon">
				<Plus />
			</Button>
		{/snippet}
	</AlertDialog.Trigger>
	<AlertDialog.Content class="min-w-[77vw]">
		<AlertDialog.Header>
			<AlertDialog.Title>Create Resource</AlertDialog.Title>
		</AlertDialog.Header>
		<div class="grid grid-cols-2 gap-4 *:max-h-[62vh] *:min-h-[62vh]">
			<SchemaViewer schema={jsonSchema} class="h-full max-h-screen min-h-0 overflow-auto" />
			<Monaco
				options={{
					language: 'yaml',
					padding: { top: 24 },
					automaticLayout: true
				}}
				theme={themeMode.current === 'dark' ? 'vs-dark' : 'vs-light'}
				bind:value
				bind:editor={editorInstance}
				bind:monaco={monacoInstance}
			/>
		</div>
		<AlertDialog.Footer>
			<AlertDialog.Cancel class="mr-auto">{m.cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action onclick={handleConfirm}>
				{m.confirm()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
