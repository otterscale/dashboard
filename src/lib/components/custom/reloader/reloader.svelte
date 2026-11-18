<script lang="ts">
	import { Switch } from '$lib/components/shadcnio/switch';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	let {
		checked = $bindable(),
		disabled,
		class: className
	}: {
		checked?: boolean;
		disabled?: boolean;
		class?: string;
	} = $props();
</script>

<div class={cn('flex items-center gap-2', className)}>
	<Switch
		aria-label={m.auto_update()}
		{checked}
		{disabled}
		onCheckedChange={(details) => (checked = details.checked)}
	/>
	<span class="text-sm font-medium whitespace-nowrap">{m.auto_update()}</span>
</div>
