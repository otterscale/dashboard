import type { PrometheusDriver } from 'prometheus-query';
import type { Component } from 'svelte';

export type WidgetBaseProps = {
	prometheusDriver: PrometheusDriver;
	cluster: string;
	isReloading: boolean;
};

export type WidgetComponent = Component<WidgetBaseProps, Record<string, never>, 'isReloading'>;

export type WidgetDefinition = {
	key: string;
	class: string;
	component: WidgetComponent;
	props?: Record<string, unknown>;
};
