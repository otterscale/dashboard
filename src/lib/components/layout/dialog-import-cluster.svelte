<script lang="ts">
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CloudDownloadIcon from '@lucide/svelte/icons/cloud-download';
	import HardDriveIcon from '@lucide/svelte/icons/hard-drive';
	import ListChecksIcon from '@lucide/svelte/icons/list-checks';
	import PencilLineIcon from '@lucide/svelte/icons/pencil-line';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import TerminalIcon from '@lucide/svelte/icons/terminal';

	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { Progress } from '$lib/components/ui/progress/index.js';
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

	let providerType = $state<ProviderType>(null);
	let flowStep = $state<WizardFlow>('provider');
	let stepIndex = $state(0);

	const steps = [
		{ icon: ListChecksIcon, label: 'Provider' },
		{ icon: PencilLineIcon, label: 'Info' },
		{ icon: TerminalIcon, label: 'Deploy' },
		{ icon: ShieldCheckIcon, label: 'Verify' }
	];

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

		<Item.Root class="p-0">
			<Progress value={stepIndex + 1} max={steps.length} />
		</Item.Root>

		<div class="mt-4 flex min-h-[38vh] flex-1 flex-col">
			{#if flowStep === 'provider'}
				<!-- Step Content -->
				<div class="flex h-full flex-1 flex-col gap-6">
					<div>
						<h3 class="text-lg font-bold">Select Provider</h3>
						<p class="mt-1 text-sm text-muted-foreground">
							Choose how you'd like to add a cluster.
						</p>
					</div>
					<div class="grid flex-1 gap-4 sm:grid-cols-2">
						<!-- Bare Metal (Disabled) -->
						<button
							type="button"
							class="group relative flex h-full w-full cursor-not-allowed flex-col items-center justify-center gap-3 rounded-lg border bg-muted/30 p-6 text-center opacity-50 transition-all duration-200"
							disabled
						>
							<div
								class="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground"
							>
								<HardDriveIcon class="size-6" />
							</div>
							<div>
								<h4 class="font-semibold text-muted-foreground">Bare Metal</h4>
								<p class="mt-1 text-sm text-muted-foreground">Talos-based provisioning</p>
							</div>
							<span
								class="rounded-full bg-muted/80 px-2 py-0.5 text-xs font-medium text-muted-foreground"
							>
								Coming Soon
							</span>
						</button>

						<!-- External K8s -->
						<button
							type="button"
							class={cn(
								'group relative flex h-full w-full flex-col items-center justify-center gap-3 rounded-lg border p-6 text-center transition-all duration-200',
								'cursor-pointer hover:bg-accent hover:text-accent-foreground',
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
									'flex h-12 w-12 items-center justify-center rounded-lg transition-colors',
									providerType === 'external'
										? 'bg-primary/20 text-primary'
										: 'bg-muted text-muted-foreground group-hover:bg-background group-hover:text-foreground'
								)}
							>
								<CloudDownloadIcon class="size-6" />
							</div>
							<div>
								<h4 class="font-semibold">External K8s</h4>
								<p class="mt-1 text-sm text-muted-foreground">Juju, Rancher, EKS, etc.</p>
							</div>
							<span class="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
								Recommended
							</span></button
						>
					</div>
				</div>

				<!-- Footer -->
				<div class="mt-auto flex w-full items-center justify-between gap-3 pt-4">
					<div></div>
					<Button onclick={handleNext} disabled={!providerType}>Next</Button>
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
