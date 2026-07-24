import { m } from '$lib/messages';

export const siteConfig = {
	title: m.site_title(),
	description: m.site_description()
};

export type SiteConfig = typeof siteConfig;
