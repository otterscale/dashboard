<script lang="ts">
	import { stringify } from 'yaml';

	import * as Code from '$lib/components/custom/code';

	import type { Resource } from '../types';

	let { object }: { object: Resource | undefined } = $props();

	const yaml = $derived(object === undefined ? '' : stringify(object));
</script>

<Code.Root class="border-none bg-muted" lang="yaml" code={yaml} hideLines>
	<Code.CopyButton />
</Code.Root>
