<script lang="ts">
	import Icon from '@iconify/svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	import { cn } from '$lib/utils';

	let {
		steps,
		currentStepIndex,
		class: className,
		...rest
	}: {
		steps: readonly { icon: string; label: string }[];
		currentStepIndex: number;
	} & HTMLAttributes<HTMLDivElement> = $props();
</script>

<div class={cn('flex items-center justify-between border-b px-6 py-4', className)} {...rest}>
	{#each steps as step, i (step.label)}
		{@const isActive = i === currentStepIndex}
		{@const isCompleted = i < currentStepIndex}

		{#if i > 0}
			<div
				class={cn(
					'mx-1 h-0.5 flex-1 transition-all duration-500',
					isCompleted ? 'bg-primary' : 'bg-muted'
				)}
			></div>
		{/if}

		<div class="flex flex-col items-center gap-1">
			<div
				class={cn(
					'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-300',
					isActive && 'border-primary bg-primary text-primary-foreground ring-2 ring-primary/20',
					isCompleted && 'border-primary bg-primary text-primary-foreground',
					!isActive && !isCompleted && 'border-muted bg-muted text-muted-foreground'
				)}
			>
				{#if isCompleted}
					<Icon icon="ph:check-bold" class="size-4" />
				{:else}
					<Icon icon={step.icon} class="size-4" />
				{/if}
			</div>
			<span
				class={cn(
					'text-[10px] font-medium whitespace-nowrap transition-colors',
					isActive ? 'text-foreground' : 'text-muted-foreground'
				)}
			>
				{step.label}
			</span>
		</div>
	{/each}
</div>
