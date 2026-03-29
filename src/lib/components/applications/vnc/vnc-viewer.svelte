<script lang="ts">
	import type { Transport } from '@connectrpc/connect';
	import { getContext, onDestroy, onMount } from 'svelte';

	import { ConnectWebSocket } from './connect-websocket';

	let {
		cluster,
		namespace,
		name
	}: {
		cluster: string;
		namespace: string;
		name: string;
	} = $props();

	const transport: Transport = getContext('transport');

	let container = $state<HTMLElement>();
	let rfb: any = null;
	let ws: ConnectWebSocket | null = null;
	let isConnected = $state(false);
	let error = $state('');

	async function connect() {
		if (rfb) disconnect();
		if (!container) return;

		error = '';

		try {
			const RFB = (await import('@novnc/novnc')).default;

			ws = new ConnectWebSocket(transport, cluster, namespace, name);

			rfb = new RFB(container, ws as unknown as WebSocket, {
				scaleViewport: true,
				resizeSession: true
			});

			rfb.addEventListener('connect', () => {
				isConnected = true;
				error = '';
			});

			rfb.addEventListener('disconnect', (e: CustomEvent) => {
				isConnected = false;
				if (!e.detail.clean) {
					error = 'VNC connection lost';
				}
			});
		} catch (err) {
			error = `Failed to connect: ${err}`;
			isConnected = false;
		}
	}

	function disconnect() {
		rfb?.disconnect();
		rfb = null;
		ws = null;
		isConnected = false;
	}

	onMount(() => {
		if (container) connect();
	});

	onDestroy(() => disconnect());
</script>

<div class="relative h-full w-full">
	{#if error}
		<div class="absolute inset-0 z-10 flex items-center justify-center bg-black/80">
			<p class="text-sm text-red-400">{error}</p>
		</div>
	{/if}

	{#if !isConnected && !error}
		<div class="absolute inset-0 z-10 flex items-center justify-center bg-black/80">
			<p class="text-sm text-muted-foreground">Connecting to VNC...</p>
		</div>
	{/if}

	<div bind:this={container} class="h-full w-full"></div>
</div>
