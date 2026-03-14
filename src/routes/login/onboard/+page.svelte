<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { env } from '$env/dynamic/public';
	import { m } from '$lib/paraglide/messages.js';

	const harborUrl = env.PUBLIC_HARBOR_URL;
	const harborLoginUrl = harborUrl ? `${harborUrl}/c/oidc/login` : null;

	const TIMEOUT_MS = 5000;

	let done = false;

	function complete() {
		if (done) return;
		done = true;
		goto(resolve('/'));
	}

	$effect(() => {
		if (!harborLoginUrl) {
			complete();
			return;
		}

		const timer = setTimeout(complete, TIMEOUT_MS);
		return () => clearTimeout(timer);
	});
</script>

<div class="flex h-screen items-center justify-center">
	<p class="text-sm text-muted-foreground">{m.setting_up_environment()}</p>
</div>

{#if harborLoginUrl}
	<iframe src={harborLoginUrl} title="Harbor auto-login" class="hidden" onload={complete}></iframe>
{/if}
