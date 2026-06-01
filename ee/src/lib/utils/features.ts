import { resolve } from '$app/paths';
import { m } from '$lib/paraglide/messages';

type NavItem = { title: string; url: string };

export function getAdditionalItems(cluster: string, workspace: string): NavItem[] {
	return [
		{
			title: m.license(),
			url: (resolve as (path: string, params: Record<string, string>) => string)(
				'/(auth)/[cluster]/[workspace]/license',
				{ cluster, workspace }
			)
		}
	];
}
