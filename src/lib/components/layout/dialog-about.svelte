<script lang="ts">
	import BugIcon from '@lucide/svelte/icons/bug';
	import GitHubIcon from '@lucide/svelte/icons/github';

	import { version } from '$app/environment';
	import LogoImage from '$lib/assets/logo.svg';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { m } from '$lib/paraglide/messages';

	let { open = $bindable(false) }: { open: boolean } = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="gap-4">
		<Dialog.Header class="flex flex-col gap-2 text-left">
			<div class="flex items-center gap-2">
				<Dialog.Title class="flex items-center">
					<img src={LogoImage} alt="Logo" class="h-5" />
				</Dialog.Title>
				<Badge variant="secondary" class="text-xs font-medium">
					{version}
				</Badge>
			</div>
			<Dialog.Description class="text-xs text-muted-foreground">
				{m.slogan()}
			</Dialog.Description>
		</Dialog.Header>

		<div class="h-px w-full bg-border/60" role="separator"></div>

		<div class="flex flex-col items-center gap-4">
			<h2 class="gap-2 text-center tracking-tight">
				<span class="block text-xl font-bold text-foreground sm:text-2xl">
					{m.join_1()}
				</span>
				<span class="block text-base font-medium text-muted-foreground sm:text-lg">
					{m.join_2()}
				</span>
			</h2>

			<div class="flex w-full justify-center gap-2">
				<Button variant="outline" size="icon" href="https://github.com/otterscale" target="_blank">
					<GitHubIcon />
					<span class="sr-only">GitHub</span>
				</Button>
				<Button
					variant="outline"
					size="icon"
					href="https://github.com/otterscale/otterscale/issues/new/choose"
					target="_blank"
				>
					<BugIcon />
					<span class="sr-only">Report Issue</span>
				</Button>
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>
