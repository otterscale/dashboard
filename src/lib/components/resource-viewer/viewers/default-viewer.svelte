<script lang="ts">
	import type { JsonObject } from '@bufbuild/protobuf';
	import { stringify } from 'yaml';

	import * as Code from '$lib/components/custom/code';

	let { object }: { object: JsonObject } = $props();
</script>

<Code.Root variant="secondary" lang="yaml" class="w-full border-none" code={stringify(object)}>
	<Code.CopyButton />
</Code.Root>
