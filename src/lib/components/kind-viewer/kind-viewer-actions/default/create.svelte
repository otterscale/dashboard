<script lang="ts">
	import { Plus } from '@lucide/svelte';
	import Ajv from 'ajv';
	import { mode as themeMode } from 'mode-watcher';
	import Monaco from 'svelte-monaco';
	import { parseDocument } from 'yaml';

	import SchemaViewer from '$lib/components/schema-viewer/schema-viewer.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import Button from '$lib/components/ui/button/button.svelte';
	import { m } from '$lib/paraglide/messages';

	let {
		schema: jsonSchema
	}: {
		schema: any;
	} = $props();

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
	let editorInstance: import('monaco-editor').editor.IStandaloneCodeEditor | undefined =
		$state(undefined);

	async function performValidation() {
		if (!editorInstance) return;

		const monaco = await import('monaco-editor');
		const markers: import('monaco-editor').editor.IMarkerData[] = [];

		const model = editorInstance.getModel();
		if (!model) return;

		const content = editorInstance.getValue();
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

	$effect(() => {
		// Re-validate when value or editor changes
		if (value !== undefined && editorInstance) {
			performValidation();
		}
	});

	function handleConfirm() {
		console.log(value);
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
