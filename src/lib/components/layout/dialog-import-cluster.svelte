<script lang="ts">
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CloudDownloadIcon from '@lucide/svelte/icons/cloud-download';
	import HardDriveIcon from '@lucide/svelte/icons/hard-drive';

	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Progress } from '$lib/components/ui/progress';
	import { cn } from '$lib/utils';

	import ImportClusterExternal from './import-cluster-external.svelte';

	let {
		open = $bindable(false),
		onsuccess
	}: {
		open: boolean;
		onsuccess?: () => void;
	} = $props();

	type ProviderType = 'baremetal' | 'external' | null;
	type WizardFlow = 'provider' | 'external-flow';

	const TOTAL_STEPS = 4;

	let providerType = $state<ProviderType>(null);
	let flowStep = $state<WizardFlow>('provider');
	let stepIndex = $state(0);

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
	<Dialog.Content
		class="flex max-h-[95vh] min-w-[38vw] flex-col overflow-y-auto"
		showCloseButton={false}
	>
		<Dialog.Title class="sr-only">Import Cluster Wizard</Dialog.Title>

		<Progress value={stepIndex + 1} max={TOTAL_STEPS} />

		<div class="mt-4 flex min-h-[38vh] flex-1 flex-col">
			{#if flowStep === 'provider'}
				<div class="flex h-full flex-1 flex-col gap-6">
					<div class="flex flex-col gap-1">
						<h3 class="text-lg font-bold">Select Provider</h3>
						<p class="text-sm text-muted-foreground">Choose how you'd like to add a cluster.</p>
					</div>

					<div class="grid flex-1 gap-4 sm:grid-cols-2">
						<button
							type="button"
							class="group relative flex h-full w-full cursor-not-allowed flex-col items-center justify-center gap-3 rounded-lg border bg-muted/30 p-6 text-center opacity-50 transition-all duration-200"
							disabled
						>
							<div
								class="flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground"
							>
								<HardDriveIcon class="size-6" />
							</div>
							<div class="flex flex-col gap-1">
								<h4 class="font-semibold text-muted-foreground">Bare Metal</h4>
								<p class="text-sm text-muted-foreground">Talos-based provisioning</p>
							</div>
							<Badge variant="secondary">Coming Soon</Badge>
						</button>

						<button
							type="button"
							class={cn(
								'group relative flex h-full w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border p-6 text-center transition-all duration-200',
								'hover:bg-accent hover:text-accent-foreground',
								providerType === 'external'
									? 'border-primary bg-primary/5 ring-1 ring-primary/20'
									: 'border-border bg-card'
							)}
							onclick={() => {
								providerType = 'external';
							}}
						>
							{#if providerType === 'external'}
								<div class="absolute top-3 right-3">
									<CircleCheckIcon class="size-5 text-primary" />
								</div>
							{/if}
							<div
								class={cn(
									'flex size-12 items-center justify-center rounded-lg transition-colors',
									providerType === 'external'
										? 'bg-primary/20 text-primary'
										: 'bg-muted text-muted-foreground group-hover:bg-background group-hover:text-foreground'
								)}
							>
								<CloudDownloadIcon class="size-6" />
							</div>
							<div class="flex flex-col gap-1">
								<h4 class="font-semibold">External K8s</h4>
								<p class="text-sm text-muted-foreground">Juju, Rancher, EKS, etc.</p>
							</div>
							<Badge>Recommended</Badge>
						</button>
					</div>

					<Dialog.Footer class="mt-auto pt-4">
						<Button onclick={handleNext} disabled={!providerType}>Next</Button>
					</Dialog.Footer>
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
		</div>
	</Dialog.Content>
</Dialog.Root>
