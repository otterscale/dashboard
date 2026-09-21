const ModulesHelmRepositoryName = 'modules';

/**
 * Chart.yaml's own `otterscale.io/type` annotation, carried through the
 * repository index (and Harbor's `extra_attrs.annotations`) to here.
 *
 * The repository holds more than this page can install: the platform's own
 * `core` chart, and the bootstrap wrapper that only exists to create the
 * agent's and Flux's HelmReleases. Neither is a module, so the catalog is
 * narrowed to charts that say they are one. This used to be done implicitly by
 * matching chart tags against the dashboard's own minor version, which tied
 * every chart's version line to the dashboard's.
 */
const ChartTypeAnnotation = 'otterscale.io/type';
const CoreTypeAnnotationValue = 'core';

function isModuleChart(chart: { annotations?: Record<string, string> }): boolean {
	return chart.annotations?.[ChartTypeAnnotation] !== CoreTypeAnnotationValue;
}

export { isModuleChart, ModulesHelmRepositoryName };
