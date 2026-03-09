<script>
	import { page } from '$app/state';
	import { Terminal } from '$lib/components/applications/terminal';
</script>

<Terminal
	cluster={page.url.searchParams.get('cluster') ?? ''}
	namespace={page.url.searchParams.get('namespace') ?? ''}
	podName={page.url.searchParams.get('pod') ?? ''}
	containerName={page.url.searchParams.get('container') ?? ''}
	command={(page.url.searchParams.get('command') ?? '/bin/sh').split(',')}
/>
