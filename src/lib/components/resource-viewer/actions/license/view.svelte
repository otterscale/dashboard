<script lang="ts">
	import type { JsonObject } from '@bufbuild/protobuf';
	import type { Schema } from 'ajv';

	import DefaultViewer from '../default/view.svelte';

	let { object, schema }: { object: JsonObject; schema: Schema } = $props();
</script>

<DefaultViewer {object} {schema} />
