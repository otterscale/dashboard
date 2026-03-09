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

<div class={cn('flex items-center justify-between', className)} {...rest}>
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
					'flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-300',
					isActive && 'border-primary bg-primary text-primary-foreground shadow-sm',
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
					'mt-1 text-xs font-semibold whitespace-nowrap transition-colors',
					isActive ? 'text-foreground' : 'text-muted-foreground'
				)}
			>
				{step.label}
			</span>
		</div>
	{/each}
</div>
