<script lang="ts">
	import Icon from '@iconify/svelte';

	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { cn } from '$lib/utils';

	import ImportClusterExternal from './import-cluster-external.svelte';

	let {
		open = $bindable(false),
		onsuccess
	}: {
		open: boolean;
		onsuccess?: () => void;
	} = $props();

	let providerType = $state<'baremetal' | 'external' | null>(null);
	let step = $state(1); // 1 = Provider selection, 2 = Sub-flow

	// Rendered statically inside Step 1 just for the visual effect
	const steps = [
		{ icon: 'ph:list-checks', label: 'Provider' },
		{ icon: 'ph:note-pencil', label: 'Info' },
		{ icon: 'ph:terminal-window', label: 'Deploy' },
		{ icon: 'ph:shield-check', label: 'Verify' }
	] as const;

	function handleOpenChange(isOpen: boolean) {
		open = isOpen;
		if (!isOpen) {
			providerType = null;
			step = 1;
		}
	}

	function handleNext() {
		if (providerType) step = 2;
	}
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
	<Dialog.Content class="max-w-2xl overflow-hidden p-0" showCloseButton={step === 1}>
		<Dialog.Title class="sr-only">Import Cluster Wizard</Dialog.Title>

		{#if step === 1}
			<!-- Stepper Header (Static for Step 1) -->
			<div class="flex items-center justify-between border-b px-6 py-4">
				{#each steps as s, i (s.label)}
					{@const stepNum = i + 1}
					{@const isActive = stepNum === 1}
					{@const isCompleted = stepNum < 1}

					{#if i > 0}
						<div class="mx-1 h-0.5 flex-1 bg-muted transition-all duration-500"></div>
					{/if}

					<div class="flex flex-col items-center gap-1">
						<div
							class={cn(
								'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-300',
								isActive &&
									'border-primary bg-primary text-primary-foreground ring-2 ring-primary/20',
								isCompleted && 'border-primary bg-primary text-primary-foreground',
								!isActive && !isCompleted && 'border-muted bg-muted text-muted-foreground'
							)}
						>
							{#if isCompleted}
								<Icon icon="ph:check-bold" class="size-4" />
							{:else}
								<Icon icon={s.icon} class="size-4" />
							{/if}
						</div>
						<span
							class={cn(
								'text-[10px] font-medium whitespace-nowrap transition-colors',
								isActive ? 'text-foreground' : 'text-muted-foreground'
							)}
						>
							{s.label}
						</span>
					</div>
				{/each}
			</div>

			<!-- Step Content -->
			<div class="max-h-[60vh] overflow-y-auto px-6 py-5">
				<div class="space-y-3">
					<div>
						<h3 class="text-lg font-semibold">Select Provider</h3>
						<p class="text-sm text-muted-foreground">Choose how you'd like to add a cluster.</p>
					</div>
					<div class="grid gap-3 sm:grid-cols-2">
						<!-- Bare Metal (Disabled) -->
						<button
							type="button"
							class="group relative flex cursor-not-allowed flex-col items-center gap-3 rounded-xl border-2 border-muted bg-muted/30 p-6 text-center opacity-50 transition-all duration-200"
							disabled
						>
							<div
								class="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground"
							>
								<Icon icon="ph:hard-drives" class="size-6" />
							</div>
							<div>
								<h4 class="font-semibold text-muted-foreground">Bare Metal</h4>
								<p class="mt-0.5 text-xs text-muted-foreground">Talos-based provisioning</p>
							</div>
							<span
								class="rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
							>
								Coming Soon
							</span>
						</button>

						<!-- External K8s -->
						<button
							type="button"
							class={cn(
								'group relative flex flex-col items-center gap-3 rounded-xl border-2 p-6 text-center transition-all duration-200',
								'hover:border-primary/50 hover:bg-accent/50',
								providerType === 'external'
									? 'border-primary bg-accent shadow-md shadow-primary/10'
									: 'border-muted bg-card'
							)}
							onclick={() => {
								providerType = 'external';
							}}
						>
							{#if providerType === 'external'}
								<div class="absolute top-2 right-2">
									<Icon icon="ph:check-circle-fill" class="size-5 text-primary" />
								</div>
							{/if}
							<div
								class={cn(
									'flex h-12 w-12 items-center justify-center rounded-xl transition-colors',
									providerType === 'external'
										? 'bg-primary/15 text-primary'
										: 'bg-muted text-muted-foreground'
								)}
							>
								<Icon icon="ph:cloud-arrow-down" class="size-6" />
							</div>
							<div>
								<h4 class="font-semibold">External K8s</h4>
								<p class="mt-0.5 text-xs text-muted-foreground">Juju, Rancher, EKS, etc.</p>
							</div>
							<span
								class="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
							>
								Recommended
							</span>
						</button>
					</div>
				</div>
			</div>

			<!-- Footer -->
			<div class="flex items-center justify-between border-t px-6 py-3">
				<div></div>
				<Button size="sm" onclick={handleNext} disabled={!providerType}>
					Next
					<Icon icon="ph:arrow-right" class="ml-1 size-3" />
				</Button>
			</div>
		{:else if providerType === 'external'}
			<ImportClusterExternal
				onBack={() => (step = 1)}
				onFinish={() => {
					handleOpenChange(false);
					onsuccess?.();
				}}
			/>
		{/if}
	</Dialog.Content>
</Dialog.Root>
