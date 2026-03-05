<script lang="ts">
	import Icon from '@iconify/svelte';

	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { cn } from '$lib/utils';

	import ImportClusterExternal from './import-cluster-external.svelte';
	import WizardStepper from './wizard-stepper.svelte';

	let {
		open = $bindable(false),
		onsuccess
	}: {
		open: boolean;
		onsuccess?: () => void;
	} = $props();

	type ProviderType = 'baremetal' | 'external' | null;
	type WizardFlow = 'provider' | 'external-flow';

	let providerType = $state<ProviderType>(null);
	let flowStep = $state<WizardFlow>('provider');
	let stepIndex = $state(0);

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
			flowStep = 'provider';
			stepIndex = 0;
		}
	}

	function handleNext() {
		if (providerType) {
			flowStep = 'external-flow';
			stepIndex = 1;
		}
	}
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
	<Dialog.Content class="max-w-2xl overflow-hidden p-0" showCloseButton={flowStep === 'provider'}>
		<Dialog.Title class="sr-only">Import Cluster Wizard</Dialog.Title>

		<!-- Stepper Header -->
		<WizardStepper {steps} currentStepIndex={stepIndex} />

		{#if flowStep === 'provider'}
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
		{:else if flowStep === 'external-flow'}
			<ImportClusterExternal
				bind:stepIndex
				onBack={() => {
					flowStep = 'provider';
					stepIndex = 0;
				}}
				onFinish={() => {
					handleOpenChange(false);
					onsuccess?.();
				}}
			/>
		{/if}
	</Dialog.Content>
</Dialog.Root>
