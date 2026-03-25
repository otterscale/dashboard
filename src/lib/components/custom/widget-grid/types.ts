import type { PrometheusDriver } from 'prometheus-query';
import type { Component } from 'svelte';

/** Common props every widget receives from {@link import('./widget-grid.svelte').default}. */
export type WidgetBaseProps = {
	prometheusDriver: PrometheusDriver;
	isReloading: boolean;
};

/** Widgets that use `juju_model` / cluster-scoped PromQL also receive `cluster` when `needsCluster` is set. */
export type WidgetWithClusterProps = WidgetBaseProps & { cluster: string };

export type WidgetDefinition = {
	key: string;
	class: string;
	component: Component<Record<string, unknown>>;
	props?: Record<string, unknown>;
	/** When true, WidgetGrid passes `cluster` into the widget. Omit or leave false for widgets that do not use it (avoids `svelte/no-unused-props`). */
	needsCluster?: boolean;
};
