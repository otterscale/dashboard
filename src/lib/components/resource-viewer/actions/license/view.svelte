<script lang="ts">
	import type { JsonObject } from '@bufbuild/protobuf';
	import type { Schema } from 'ajv';

	import type { RelatedResource } from '../../types';
	import DefaultViewer from '../default/view.svelte';

	let {
		object,
		schema,
		self
	}: { object: JsonObject; schema: Schema; self: RelatedResource } = $props();
</script>

<DefaultViewer {object} {schema} {self} />
