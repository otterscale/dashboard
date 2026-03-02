<script lang="ts">
	import BugIcon from '@lucide/svelte/icons/bug';
	import GitHubIcon from '@lucide/svelte/icons/github';

	import { version } from '$app/environment';
	import LogoFrameImage from '$lib/assets/logo-frame.svg';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { m } from '$lib/paraglide/messages';

	let { open = $bindable(false) }: { open: boolean } = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{m.about()}</Dialog.Title>
			<div class="flex w-full flex-col items-center justify-center">
				<Badge variant="secondary">{version}</Badge>
				<div class="flex w-full items-center justify-evenly">
					<div class="flex flex-col items-center gap-2">
						<img src={LogoFrameImage} alt="logo" class="size-36" />
					</div>
					<h2 class="flex flex-col items-center text-2xl leading-tight">
						{m.join_1()}
						<br />
						<span class="text-foreground/60"> {m.join_2()} </span>
					</h2>
				</div>
				<div class="flex gap-2">
					<Button
						variant="outline"
						size="icon"
						href="https://github.com/otterscale"
						target="_blank"
					>
						<GitHubIcon />
					</Button>
					<Button
						variant="outline"
						size="icon"
						href="https://github.com/otterscale/otterscale/issues/new/choose"
						target="_blank"
					>
						<BugIcon />
					</Button>
				</div>
			</div>
		</Dialog.Header>
	</Dialog.Content>
</Dialog.Root>
