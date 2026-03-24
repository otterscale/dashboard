<script lang="ts" module>
	import EyeIcon from '@lucide/svelte/icons/eye';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';
	import type { WithElementRef } from 'bits-ui';
	import type { HTMLInputAttributes } from 'svelte/elements';

	import { General } from '.';
</script>

<script lang="ts">
	import { PasswordManager } from './utils.svelte';

	let {
		ref = $bindable(null),
		value = $bindable(),
		required,
		invalid = $bindable(),
		...restProps
	}: WithElementRef<Omit<HTMLInputAttributes, 'type' | 'files'> & { type?: 'password' }> & {
		invalid?: boolean | null | undefined;
	} = $props();

	const passwordManager = new PasswordManager();

	const isInvalid = $derived(required && !value);
	$effect(() => {
		invalid = isInvalid;
	});
</script>

<div class="relative">
	<General
		bind:ref
		data-slot="input-password"
		class="pr-9"
		type={passwordManager.isVisible ? 'text' : 'password'}
		bind:value
		{required}
		{...restProps}
	/>

	<button
		type="button"
		class="absolute top-1/2 right-3 -translate-y-1/2 items-center hover:cursor-pointer focus:outline-none"
		onmousedown={() => {
			passwordManager.enable();
		}}
		onmouseup={() => {
			passwordManager.disable();
		}}
	>
		{#if passwordManager.isVisible}
			<EyeIcon class="size-4" />
		{:else}
			<EyeOffIcon class="size-4" />
		{/if}
	</button>
</div>
