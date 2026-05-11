<script lang="ts">
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

	import { Button } from '$lib/components/ui/button/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';

	let { kind }: { kind: string } = $props();

	let elapsed = $state(0);

	$effect(() => {
		const startedAt = Date.now();
		const id = setInterval(() => {
			elapsed = Math.floor((Date.now() - startedAt) / 1000);
		}, 1000);

		return () => clearInterval(id);
	});

	const elapsedLabel = $derived.by(() => {
		if (elapsed < 60) return `${elapsed}s`;
		const m = Math.floor(elapsed / 60);
		const s = elapsed % 60;
		return `${m}m ${s}s`;
	});
</script>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<Spinner />
		</Empty.Media>
		<Empty.Title>Loading {kind}</Empty.Title>
		<Empty.Description>
			This will only take a moment... <span class="tabular-nums">({elapsedLabel})</span>
		</Empty.Description>
	</Empty.Header>
	<Empty.Content>
		<Button variant="outline" size="sm" onclick={() => location.reload()}>
			<RefreshCwIcon />
			Refresh
		</Button>
	</Empty.Content>
</Empty.Root>
