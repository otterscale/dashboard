<script lang="ts">
	import type { JsonObject } from '@bufbuild/protobuf';

	import DefaultViewer from '../default/view.svelte';

	let { object }: { object: JsonObject } = $props();
</script>

<DefaultViewer {object} />
