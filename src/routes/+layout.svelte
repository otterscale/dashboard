<script lang="ts">
	import '../app.css';

	import { Code, ConnectError, type Interceptor } from '@connectrpc/connect';
	import { createConnectTransport } from '@connectrpc/connect-web';
	import { setThemeContext } from '@sjsf/shadcn4-theme';
	import * as components from '@sjsf/shadcn4-theme/new-york';
	import { ModeWatcher } from 'mode-watcher';
	import { setContext } from 'svelte';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Toaster } from '$lib/components/ui/sonner';
	import { Spinner } from '$lib/components/ui/spinner';

	let { children } = $props();

	const proxyHeaderInterceptor: Interceptor = (next) => async (req) => {
		req.header.set('x-proxy-target', 'api');
		return await next(req);
	};

	const unauthenticatedInterceptor: Interceptor = (next) => async (req) => {
		try {
			return await next(req);
		} catch (err) {
			if (err instanceof ConnectError && err.code === Code.Unauthenticated) {
				await goto(resolve('/login'));
			}
			throw err;
		}
	};

	const transport = createConnectTransport({
		baseUrl: '/',
		interceptors: [proxyHeaderInterceptor, unauthenticatedInterceptor],
		fetch
	});

	setContext('transport', transport);

	setThemeContext({ components });
</script>

{#snippet loadingIcon()}
	<Spinner />
{/snippet}

<ModeWatcher />
<Toaster toastOptions={{ class: '!pointer-events-auto' }} expand richColors {loadingIcon} />

<div class="app">
	<main>
		{@render children()}
	</main>
</div>
