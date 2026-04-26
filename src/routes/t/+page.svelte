<script lang="ts">
	import Create from '$lib/components/kind-viewer/kind-viewer-actions/model-service/create-from-template.svelte';
	import jsonSchema from './LLMInferenceService.json';
</script>

<Create
	cluster={'cluster'}
	namespace={'namespace'}
	group={'group'}
	version={'version'}
	kind={'kind'}
	resource={'resource'}
	schema={jsonSchema.schema}
/>
