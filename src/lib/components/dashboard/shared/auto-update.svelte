<script lang="ts">
	import { Switch } from '$lib/components/shadcnio/switch';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	// The page's "Auto Update" switch. Same behaviour as the shared Reloader
	// (custom/reloader), on the shadcn.io switch.
	let { checked = $bindable(true), class: className }: { checked?: boolean; class?: string } =
		$props();

	const id = $props.id();
</script>

<div class={cn('flex shrink-0 items-center gap-2', className)}>
	<Switch
		{checked}
		onCheckedChange={(details) => (checked = details.checked)}
		ids={{ hiddenInput: `${id}-input` }}
	/>
	<label for={`${id}-input`} class="cursor-pointer text-sm font-medium">{m.auto_update()}</label>
</div>
