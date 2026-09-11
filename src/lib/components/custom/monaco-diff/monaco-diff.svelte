<script lang="ts">
	import loader from '@monaco-editor/loader';
	import type MonacoE from 'monaco-editor';
	import { onDestroy, onMount } from 'svelte';

	let {
		original,
		modified = $bindable(),
		language = 'yaml',
		theme = 'vs',
		renderSideBySide = true,
		hideUnchanged = false,
		options = {}
	}: {
		original: string;
		modified: string;
		language?: string;
		theme?: string;
		renderSideBySide?: boolean;
		hideUnchanged?: boolean;
		options?: MonacoE.editor.IDiffEditorConstructionOptions;
	} = $props();

	let container: HTMLDivElement | undefined = $state();
	let monaco = $state<typeof MonacoE>();
	let editor = $state<MonacoE.editor.IStandaloneDiffEditor>();
	let originalModel = $state<MonacoE.editor.ITextModel>();
	let modifiedModel = $state<MonacoE.editor.ITextModel>();
	let layoutTimeout: ReturnType<typeof setTimeout> | undefined;
	let disposed = false;

	onMount(async () => {
		const monacoInstance = await loader.init();

		const createdOriginal = monacoInstance.editor.createModel(original, language);
		const createdModified = monacoInstance.editor.createModel(modified, language);

		const diffEditor = monacoInstance.editor.createDiffEditor(container!, {
			automaticLayout: true,
			originalEditable: false,
			renderSideBySide,
			hideUnchangedRegions: { enabled: hideUnchanged },
			scrollBeyondLastLine: false,
			...options
		});
		diffEditor.setModel({ original: createdOriginal, modified: createdModified });
		monacoInstance.editor.setTheme(theme);

		createdModified.onDidChangeContent(() => {
			modified = createdModified.getValue();
		});

		// The dialog's open animation transforms the container while the editor
		// measures itself; re-layout once the animation has settled.
		requestAnimationFrame(() => {
			if (!disposed) diffEditor.layout();
		});
		layoutTimeout = setTimeout(() => {
			if (!disposed) diffEditor.layout();
		}, 300);

		monaco = monacoInstance;
		originalModel = createdOriginal;
		modifiedModel = createdModified;
		editor = diffEditor;
	});

	$effect(() => {
		if (theme) monaco?.editor.setTheme(theme);
	});

	$effect(() => {
		editor?.updateOptions({ renderSideBySide });
	});

	$effect(() => {
		editor?.updateOptions({ hideUnchangedRegions: { enabled: hideUnchanged } });
	});

	$effect(() => {
		if (originalModel && originalModel.getValue() !== original) {
			originalModel.setValue(original);
		}
	});

	$effect(() => {
		if (modifiedModel && modifiedModel.getValue() !== modified) {
			modifiedModel.setValue(modified);
		}
	});

	onDestroy(() => {
		disposed = true;
		clearTimeout(layoutTimeout);
		editor?.dispose();
		originalModel?.dispose();
		modifiedModel?.dispose();
	});
</script>

<div class="h-full w-full" bind:this={container}></div>
