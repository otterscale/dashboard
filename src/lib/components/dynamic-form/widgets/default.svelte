<script lang="ts">
	import type { ComponentProps } from '@sjsf/form';

	let { config, value = $bindable(), uiOption }: ComponentProps['unknownField'] = $props();
</script>

<pre>{JSON.stringify({ config, value, uiOption }, null, 2)}</pre>
