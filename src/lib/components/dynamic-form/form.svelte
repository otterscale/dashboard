<script lang="ts">
	import { FileCodeCornerIcon, FormIcon } from '@lucide/svelte';
	import {
		Content,
		createForm,
		type FailureValidationResult,
		Form,
		type FormState,
		type FormValue,
		type FormValueValidator,
		getValueSnapshot,
		type Schema,
		setFormContext,
		setValue,
		type UiSchemaRoot,
		type ValidationResult,
		type ValidatorFactoryOptions
	} from '@sjsf/form';
	import { createFocusOnFirstError } from '@sjsf/form/focus-on-first-error';
	import { chain, fromFactories, fromRecord, overrideByRecord } from '@sjsf/form/lib/resolver';
	import { mode as themeMode } from 'mode-watcher';
	import { type Snippet, tick } from 'svelte';
	import Monaco from 'svelte-monaco';
	import { toast } from 'svelte-sonner';
	import { parse, stringify } from 'yaml';

	import { shortcut } from '$lib/actions/shortcut.svelte';
	import * as defaults from '$lib/components/dynamic-form/defaults';
	import ObjectPropertyField from '$lib/components/dynamic-form/fields/object-property.svelte';
	import ArrayItemTemplate from '$lib/components/dynamic-form/templates/array-item.svelte';
	import ArrayTemplate from '$lib/components/dynamic-form/templates/array.svelte';
	import MultiFieldTemplate from '$lib/components/dynamic-form/templates/multi-field.svelte';
	import ObjectPropertyTemplate from '$lib/components/dynamic-form/templates/object-property.svelte';
	import ObjectTemplate from '$lib/components/dynamic-form/templates/object.svelte';
	import * as ButtonGroup from '$lib/components/ui/button-group/index.js';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Kbd from '$lib/components/ui/kbd/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { cn } from '$lib/utils';

	let {
		schema,
		initialValue,
		uiSchema,
		transformer,
		handleSubmit,
		actions,
		values = $bindable(),
		class: className
	}: {
		schema: Schema;
		initialValue: FormValue;
		uiSchema?: UiSchemaRoot;
		transformer?: (value: FormValue) => FormValue;
		handleSubmit?: {
			prehook?: (form: FormState<FormValue>) => void;
			posthook?: (form: FormState<FormValue>) => void;
		};
		actions?: Snippet;
		values: FormValue;
		class?: string;
	} = $props();
	// Clean schema from unnecessary keywords to JSON Schema Draft-07.
	function transfer(value: FormValue): FormValue {
		let temporaryValue = value;
		if (transformer) {
			temporaryValue = transformer(temporaryValue);
		}
		setValue(form, temporaryValue);
		return getValueSnapshot(form);
	}
	const extraUiOptions = chain(
		fromRecord({
			useLabel: false
		}),
		fromFactories({})
	);
	const theme = overrideByRecord(defaults.theme, {
		// Fields
		objectPropertyField: ObjectPropertyField,
		// Templates
		arrayItemTemplate: ArrayItemTemplate,
		arrayTemplate: ArrayTemplate,
		multiFieldTemplate: MultiFieldTemplate,
		objectPropertyTemplate: ObjectPropertyTemplate,
		objectTemplate: ObjectTemplate
	});
	let validationResult: ValidationResult<FormValue> | null = $state(null);
	function validator(options: ValidatorFactoryOptions) {
		const validator = defaults.validator<FormValue>(options);
		return {
			...validator,
			validateFormValue(schema: Schema, formValue: FormValue) {
				let value = {} as FormValue;
				switch (mode) {
					case 'yaml':
						value = parse(yamlValue);
						break;
					case 'form':
						value = formValue;
						break;
				}
				const transferredValue = transfer(value);
				validationResult = validator.validateFormValue(schema, transferredValue);
				if (validationResult && validationResult.errors && validationResult.errors.length > 0) {
					validationResult.errors.forEach((error) => {
						toast.error(error.message, {
							description: `[${error.path.join('.')}]`,
							duration: Number.POSITIVE_INFINITY,
							closeButton: true
						});
					});
				}
				return validationResult;
			}
		} satisfies FormValueValidator<FormValue>;
	}
	function onSubmit() {
		handleSubmit?.prehook?.(form);
		values = getValueSnapshot(form);
		handleSubmit?.posthook?.(form);
	}
	function onSubmitError(
		result: FailureValidationResult,
		event: SubmitEvent,
		form: FormState<FormValue>
	) {
		if (result.errors.length > 0) createFocusOnFirstError()(result, event, form);
	}
	const form = createForm<FormValue>({
		...defaults,
		theme,
		extraUiOptions,
		schema,
		uiSchema,
		initialValue,
		validator,
		onSubmit,
		onSubmitError
	});
	// YAML
	// Reorder attributes in YAML editor to match the form schema, making it more intuitive for users to find and edit values.
	// This is achieved by creating a new object based on the form schema and populating it with values from the current form state, ensuring that the order of attributes in the YAML editor reflects the structure defined in the form schema.
	setValue(form, parse(stringify(getValueSnapshot(form))));
	let yamlValue = $state(stringify(getValueSnapshot(form)));
	function onReady(event: CustomEvent) {
		const editor = event.detail;
		console.log(editor);
	}
	// Tab
	async function synchronizeToYAML() {
		yamlValue = stringify(getValueSnapshot(form));
	}
	async function synchronizeToForm() {
		setValue(form, parse(yamlValue));
		await tick();
		setValue(form, parse(yamlValue));
	}
	let mode = $state('form');
	async function changeMode(targetMode: string) {
		try {
			switch (targetMode) {
				case 'yaml':
					await synchronizeToYAML();
					break;
				case 'form':
					await synchronizeToForm();
					break;
			}
			mode = targetMode;
			toast.success(`Switched to ${mode.toUpperCase()} mode`);
		} catch (error) {
			toast.error(
				`Failed to switch to ${targetMode.toUpperCase()} mode: ${(error as Error).message}`,
				{
					duration: 5000,
					closeButton: true
				}
			);
			return;
		}
	}
	setFormContext(form);
</script>

<svelte:window
	use:shortcut={{
		key: 'f',
		ctrl: true,
		callback: async () => {
			await changeMode('form');
		}
	}}
	use:shortcut={{
		key: 'y',
		ctrl: true,
		callback: async () => {
			await changeMode('yaml');
		}
	}}
/>
<div class={cn('h-full', className)}>
	<Tabs.Root bind:value={mode} class="h-full">
		<!-- Mode Switcher -->
		<Tooltip.Provider>
			<ButtonGroup.Root class="ml-auto" data-slot="dynamic-form-mode-controller">
				<Button
					variant="ghost"
					size="icon-sm"
					disabled={mode === 'form'}
					onclick={async () => {
						await changeMode('form');
					}}
				>
					<Tooltip.Root>
						<Tooltip.Trigger>
							<FormIcon />
						</Tooltip.Trigger>
						<Tooltip.Content class="flex items-center gap-1">
							Form
							<Kbd.Group>
								<Kbd.Root>ctrl</Kbd.Root>
								<Kbd.Root>F</Kbd.Root>
							</Kbd.Group>
						</Tooltip.Content>
					</Tooltip.Root>
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					disabled={mode === 'yaml'}
					onclick={async () => {
						await changeMode('yaml');
					}}
				>
					<Tooltip.Root>
						<Tooltip.Trigger>
							<FileCodeCornerIcon />
						</Tooltip.Trigger>
						<Tooltip.Content class="flex items-center gap-1">
							YAML
							<Kbd.Group>
								<Kbd.Root>ctrl</Kbd.Root>
								<Kbd.Root>Y</Kbd.Root>
							</Kbd.Group>
						</Tooltip.Content>
					</Tooltip.Root>
				</Button>
			</ButtonGroup.Root>
		</Tooltip.Provider>
		<Tabs.Content value="form" class="h-full">
			<!-- Form -->
			<Form attributes={{ novalidate: true, class: 'h-full' }}>
				<div class="flex h-full min-h-0 flex-col gap-3">
					<Content />
					<div class="mt-auto w-full">
						{#if actions}
							{@render actions()}
						{/if}
					</div>
				</div>
			</Form>
		</Tabs.Content>
		<Tabs.Content value="yaml" class="h-full">
			<!-- YAML -->
			<div class="h-full">
				<Monaco
					bind:value={yamlValue}
					options={{
						automaticLayout: true,
						language: 'yaml',
						extraEditorClassName: 'h-full',
						folding: true,
						padding: { top: 24 },
						renderLineHighlight: 'all',
						theme: themeMode.current === 'dark' ? 'vs-dark' : 'vs-light'
					}}
					on:ready={onReady}
				/>
			</div>
		</Tabs.Content>
	</Tabs.Root>
</div>
