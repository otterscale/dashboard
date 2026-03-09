<script lang="ts">
	import SchemaViewer from '$lib/components/schema-viewer/schema-viewer.svelte';
	import { default as YAMLEditor } from '$lib/components/container.svelte';
	import { cn } from '$lib/utils';
	import Ajv from 'ajv';
	import { onMount } from 'svelte';
	import { parseDocument } from 'yaml';

	let {
		value = $bindable(),
		schema: jsonSchema,
		class: className
	}: {
		value: any;
		schema: any;
		class?: string;
	} = $props();

	let container: HTMLDivElement = $state({} as HTMLDivElement);

	const jsonSchemaValidator = new Ajv({
		allErrors: true,
		strict: false,
		logger: false
	});
	const validate = jsonSchemaValidator.compile(jsonSchema);

	onMount(async () => {
		const monaco = await import('monaco-editor');
		const editor = monaco.editor.create(container, {
			automaticLayout: true,
			language: 'yaml',
			padding: { top: 24 },
			theme: 'vs-dark',
			value
		});

		const performValidation = () => {
			const markers: any[] = [];

			const model = editor.getModel();
			if (!model) return;

			const content = editor.getValue();
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
						const [start, end, ...rest] = node.range.map((point: any) =>
							model.getPositionAt(point)
						);

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
		};

		editor.onDidChangeModelContent(() => {
			value = editor.getValue();
			performValidation();
		});

		performValidation();
	});
</script>

<div class={cn('grid grid-cols-2 gap-4 p-4 *:max-h-[77vh] *:min-h-[77vh]', className)}>
	<SchemaViewer schema={jsonSchema} class="h-full max-h-screen min-h-0 overflow-auto" />
	<YAMLEditor bind:container class="h-full max-h-screen min-h-0" />
</div>
