import type { Transport } from '@connectrpc/connect';
import type { Component } from 'svelte';

type NavItem = { title: string; url: string };

type NavGroup = {
	title: string;
	icon?: Component;
	isActive?: boolean;
	items: NavItem[];
};

/** Options understood by the (auth) layout's resource-URL builder. */
type ResourceUrlOptions = {
	group: string;
	version: string;
	kind: string;
	resource: string;
	labelSelector?: string;
	fieldSelector?: string;
};

/** Optional capabilities detected on the active cluster; keys are edition-defined. */
type ClusterFeatures = Record<string, boolean>;

export function getAdditionalItems(cluster: string, workspace: string): NavItem[] {
	void cluster;
	void workspace;
	return [];
}

// Edition seam — detects optional cluster capabilities that unlock extra
// navigation. Implementations should derive every capability from a single
// API call where possible.
export async function probeClusterFeatures(
	transport: Transport,
	cluster: string,
	signal?: AbortSignal
): Promise<ClusterFeatures> {
	void transport;
	void cluster;
	void signal;
	return {};
}

// Edition seam — sidebar groups derived from the probed cluster features.
// Implementations must return [] for non-admin users when a group exposes
// cluster-scoped resources.
export function getAdditionalNavGroups(
	features: ClusterFeatures,
	resourceUrl: (options: ResourceUrlOptions) => string,
	isClusterAdmin: boolean
): NavGroup[] {
	void features;
	void resourceUrl;
	void isClusterAdmin;
	return [];
}

export type { ClusterFeatures, NavGroup, NavItem, ResourceUrlOptions };
