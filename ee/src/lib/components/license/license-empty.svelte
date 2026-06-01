<script lang="ts">
	import DownloadIcon from '@lucide/svelte/icons/download';
	import ShieldOffIcon from '@lucide/svelte/icons/shield-off';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { toast } from 'svelte-sonner';

	import LicenseExport from '$lib/components/license/license-export.svelte';
	import type { ClusterFingerprintObject } from '$lib/components/license/types';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Empty from '$lib/components/ui/empty';
	import { Label } from '$lib/components/ui/label';
	import { m } from '$lib/paraglide/messages';

	let {
		onUpload,
		fingerprint: clusterFingerprint = null,
		onTriggerExport
	}: {
		onUpload: (token: string) => Promise<void>;
		fingerprint?: ClusterFingerprintObject | null;
		onTriggerExport: () => Promise<void>;
	} = $props();

	// ── Upload state ───────────────────────────────────────────────────────────
	let uploadOpen = $state(false);
	let isSubmitting = $state(false);
	let fileContent = $state('');
	let fileName = $state('');
	let isDragging = $state(false);

	// ── Export dialog ──────────────────────────────────────────────────────────
	let exportOpen = $state(false);

	function handleFileSelect(files: FileList | null) {
		if (!files || files.length === 0) return;
		const file = files[0];
		fileName = file.name;
		const reader = new FileReader();
		reader.onload = (e) => {
			fileContent = (e.target?.result as string) ?? '';
		};
		reader.readAsText(file);
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		handleFileSelect(e.dataTransfer?.files ?? null);
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}

	function handleDragLeave() {
		isDragging = false;
	}

	async function handleSubmit() {
		if (!fileContent.trim()) {
			toast.error(m.license_upload_missing_fields());
			return;
		}
		isSubmitting = true;
		try {
			await toast.promise(onUpload(fileContent.trim()), {
				loading: m.license_uploading(),
				success: m.license_upload_success(),
				error: (err) => m.license_upload_error({ message: (err as Error)?.message ?? String(err) })
			});
			uploadOpen = false;
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="my-8 flex h-full flex-col rounded-lg">
	<!-- Empty state -->
	<div class="flex flex-1 items-center justify-center">
		<Empty.Root>
			<Empty.Media variant="icon">
				<ShieldOffIcon />
			</Empty.Media>
			<Empty.Header>
				<Empty.Title>{m.license_no_license()}</Empty.Title>
				<Empty.Description>{m.license_no_license_description()}</Empty.Description>
			</Empty.Header>
			<Empty.Content class="flex flex-row items-center justify-center gap-3">
				<!-- Upload License dialog -->
				<Dialog.Root bind:open={uploadOpen}>
					<Dialog.Trigger class={buttonVariants({ variant: 'default' })}>
						<UploadIcon />
						{m.license_upload()}
					</Dialog.Trigger>
					<Dialog.Content>
						<Dialog.Header>
							<Dialog.Title>{m.license_upload()}</Dialog.Title>
							<Dialog.Description>{m.license_upload_description()}</Dialog.Description>
						</Dialog.Header>
						<div class="space-y-4 py-2">
							<!-- File drop zone -->
							<div class="space-y-1.5">
								<Label>{m.license_replace_file_label()}</Label>
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-input bg-muted/30 px-6 py-8 text-center transition-colors hover:bg-muted/50 {isDragging
										? 'border-primary bg-primary/5'
										: ''}"
									ondrop={handleDrop}
									ondragover={handleDragOver}
									ondragleave={handleDragLeave}
									onclick={() =>
										(document.getElementById('lic-file-input') as HTMLInputElement)?.click()}
								>
									<UploadIcon class="mb-2 h-8 w-8 text-muted-foreground" />
									{#if fileName}
										<p class="text-sm font-medium">{fileName}</p>
										<p class="text-xs text-muted-foreground">
											{m.license_click_to_replace_file()}
										</p>
									{:else}
										<p class="text-sm text-muted-foreground">{m.license_upload_drop()}</p>
									{/if}
									<input
										id="lic-file-input"
										type="file"
										accept=".lic"
										class="hidden"
										onchange={(e) => handleFileSelect((e.target as HTMLInputElement).files)}
									/>
								</div>
							</div>
						</div>
						<Dialog.Footer>
							<Button variant="outline" onclick={() => (uploadOpen = false)}>{m.cancel()}</Button>
							<Button disabled={isSubmitting || !fileContent} onclick={handleSubmit}>
								{isSubmitting ? m.license_uploading_btn() : m.license_upload_btn()}
							</Button>
						</Dialog.Footer>
					</Dialog.Content>
				</Dialog.Root>

				<!-- Export License Request dialog -->
				<Button onclick={() => (exportOpen = true)} variant="outline">
					<DownloadIcon />
					{m.license_export_tab()}
				</Button>
				<LicenseExport bind:open={exportOpen} {clusterFingerprint} onTrigger={onTriggerExport} />
			</Empty.Content>
		</Empty.Root>
	</div>
</div>
