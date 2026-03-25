<script lang="ts">
	import { redirect } from '@sveltejs/kit';

	import { resolve } from '$app/paths';

	import type { PageLoad } from './$types';

	export const load: PageLoad = ({ params }) => {
		throw redirect(
			307,
			resolve('/(auth)/[cluster]/[workspace]/overview/workspace', {
				cluster: params.cluster!,
				workspace: params.workspace!
			})
		);
	};
</script>
