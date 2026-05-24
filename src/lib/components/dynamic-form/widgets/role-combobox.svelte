<script lang="ts" module>
	import '@sjsf/form/fields/extra-widgets/combobox';

	import type { ButtonProps } from '$lib/components/ui/button/button.svelte';
</script>

<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import SearchXIcon from '@lucide/svelte/icons/search-x';
	import {
		ariaInvalidProp,
		type ComponentProps,
		composeProps,
		disabledProp,
		getFormContext,
		handlersAttachment
	} from '@sjsf/form';
	import { tick } from 'svelte';

	import Button from '$lib/components/ui/button/button.svelte';
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Item from '$lib/components/ui/item';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { cn } from '$lib/utils.js';

	const ctx = getFormContext();
	let { value = $bindable(), config, handlers }: ComponentProps['comboboxWidget'] = $props();

	const { ...buttonHandlers } = $derived(handlers);
	const enumerations: { label: string; value: string }[] = [{ label: 'admin', value: 'admin' }];

	let open = $state(false);
	let triggerReference = $state<HTMLButtonElement>(null!);
	function closeAndFocusTrigger() {
		open = false;
		tick().then(() => {
			triggerReference?.focus();
		});
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		class="w-full justify-between"
		bind:ref={triggerReference}
		{...disabledProp({}, config, ctx)}
	>
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
					handlersAttachment(buttonHandlers),
					ariaInvalidProp
				)}
			>
				<span class="min-w-0 flex-1 truncate text-left">
					{value ?? 'Role'}
				</span>
				<ChevronsUpDown class="ml-2 size-4 shrink-0 opacity-50" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-[var(--bits-popover-anchor-width)] min-w-xs p-0">
		<Command.Root>
			<Command.Input />
			<Command.List>
				<Command.Empty>
					<Empty.Root>
						<Empty.Header>
							<Empty.Media>
								<SearchXIcon />
							</Empty.Media>
							<Empty.Description>No roles available.</Empty.Description>
						</Empty.Header>
					</Empty.Root>
				</Command.Empty>
				<Command.Group>
					{#each enumerations as option (option.value)}
						<Command.Item
							value={option.value}
							onSelect={() => {
								value = option.value;
								closeAndFocusTrigger();
							}}
						>
							<Check
								class={cn('mr-2 size-4', !(value && value === option.value) && 'text-transparent')}
							/>
							<Item.Root class="w-full p-0">
								<Item.Content class="text-start">
									<Item.Title>{option.label}</Item.Title>
								</Item.Content>
							</Item.Root>
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
