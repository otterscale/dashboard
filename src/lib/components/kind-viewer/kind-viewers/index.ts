import type { JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { ColumnDef } from '@tanstack/table-core';

import type { DataSchemaType, UISchemaType } from '$lib/components/dynamic-table/utils.js';

import {
	getClusterRoleColumnDefinitions,
	getClusterRoleData,
	getClusterRoleDataSchemas,
	getClusterRoleUISchemas
} from './clusterrole.js';
import {
	getClusterRoleBindingColumnDefinitions,
	getClusterRoleBindingData,
	getClusterRoleBindingDataSchemas,
	getClusterRoleBindingUISchemas
} from './clusterrolebinding.js';
import {
	getConfigMapColumnDefinitions,
	getConfigMapData,
	getConfigMapDataSchemas,
	getConfigMapUISchemas
} from './configmap.js';
import {
	getCronJobColumnDefinitions,
	getCronJobData,
	getCronJobDataSchemas,
	getCronJobUISchemas
} from './cronjob.js';
import {
	getCRDColumnDefinitions,
	getCRDData,
	getCRDDataSchemas,
	getCRDUISchemas
} from './customresourcedefinition.js';
import {
	getDaemonSetColumnDefinitions,
	getDaemonSetData,
	getDaemonSetDataSchemas,
	getDaemonSetUISchemas
} from './daemonset.js';
import {
	getDefaultColumnDefinitions,
	getDefaultData,
	getDefaultDataSchemas,
	getDefaultUISchemas
} from './default.js';
import {
	getDeploymentColumnDefinitions,
	getDeploymentData,
	getDeploymentDataSchemas,
	getDeploymentUISchemas
} from './deployment.js';
import {
	getEventColumnDefinitions,
	getEventData,
	getEventDataSchemas,
	getEventUISchemas
} from './event.js';
import {
	getGatewayColumnDefinitions,
	getGatewayData,
	getGatewayDataSchemas,
	getGatewayUISchemas
} from './gateway.js';
import {
	getHTTPRouteColumnDefinitions,
	getHTTPRouteData,
	getHTTPRouteDataSchemas,
	getHTTPRouteUISchemas
} from './httproute.js';
import { getJobColumnDefinitions, getJobData, getJobDataSchemas, getJobUISchemas } from './job.js';
import {
	getLimitRangeColumnDefinitions,
	getLimitRangeData,
	getLimitRangeDataSchemas,
	getLimitRangeUISchemas
} from './limitrange.js';
import {
	getNamespaceColumnDefinitions,
	getNamespaceData,
	getNamespaceDataSchemas,
	getNamespaceUISchemas
} from './namespace.js';
import {
	getNetworkPolicyColumnDefinitions,
	getNetworkPolicyData,
	getNetworkPolicyDataSchemas,
	getNetworkPolicyUISchemas
} from './networkpolicy.js';
import {
	getNodeColumnDefinitions,
	getNodeData,
	getNodeDataSchemas,
	getNodeUISchemas
} from './node.js';
import {
	getPVColumnDefinitions,
	getPVData,
	getPVDataSchemas,
	getPVUISchemas
} from './persistentvolume.js';
import {
	getPVCColumnDefinitions,
	getPVCData,
	getPVCDataSchemas,
	getPVCUISchemas
} from './persistentvolumeclaim.js';
import { getPodColumnDefinitions, getPodData, getPodDataSchemas, getPodUISchemas } from './pod.js';
import {
	getResourceQuotaColumnDefinitions,
	getResourceQuotaData,
	getResourceQuotaDataSchemas,
	getResourceQuotaUISchemas
} from './resource-quota.js';
import {
	getRoleColumnDefinitions,
	getRoleData,
	getRoleDataSchemas,
	getRoleUISchemas
} from './role.js';
import {
	getRoleBindingColumnDefinitions,
	getRoleBindingData,
	getRoleBindingDataSchemas,
	getRoleBindingUISchemas
} from './rolebinding.js';
import {
	getSecretColumnDefinitions,
	getSecretData,
	getSecretDataSchemas,
	getSecretUISchemas
} from './secret.js';
import {
	getServiceColumnDefinitions,
	getServiceData,
	getServiceDataSchemas,
	getServiceUISchemas
} from './service.js';
import {
	getServiceAccountColumnDefinitions,
	getServiceAccountData,
	getServiceAccountDataSchemas,
	getServiceAccountUISchemas
} from './serviceaccount.js';
import {
	getSimpleAppColumnDefinitions,
	getSimpleAppData,
	getSimpleAppDataSchemas,
	getSimpleAppUISchemas
} from './simple-app.js';
import {
	getStatefulSetColumnDefinitions,
	getStatefulSetData,
	getStatefulSetDataSchemas,
	getStatefulSetUISchemas
} from './statefulset.js';
import {
	getStorageClassColumnDefinitions,
	getStorageClassData,
	getStorageClassDataSchemas,
	getStorageClassUISchemas
} from './storageclass.js';
import {
	getWorkspaceColumnDefinitions,
	getWorkspaceData,
	getWorkspaceDataSchemas,
	getWorkspaceUISchemas
} from './workspaces.js';

function getDataSchemas(kind: string): Record<string, DataSchemaType> {
	switch (kind) {
		case 'CronJob':
			return getCronJobDataSchemas();
		case 'DaemonSet':
			return getDaemonSetDataSchemas();
		case 'Deployment':
			return getDeploymentDataSchemas();
		case 'Job':
			return getJobDataSchemas();
		case 'Pod':
			return getPodDataSchemas();
		case 'StatefulSet':
			return getStatefulSetDataSchemas();
		case 'ConfigMap':
			return getConfigMapDataSchemas();
		case 'Secret':
			return getSecretDataSchemas();
		case 'Service':
			return getServiceDataSchemas();
		case 'NetworkPolicy':
			return getNetworkPolicyDataSchemas();
		case 'PersistentVolumeClaim':
			return getPVCDataSchemas();
		case 'PersistentVolume':
			return getPVDataSchemas();
		case 'StorageClass':
			return getStorageClassDataSchemas();
		case 'Namespace':
			return getNamespaceDataSchemas();
		case 'ServiceAccount':
			return getServiceAccountDataSchemas();
		case 'Role':
			return getRoleDataSchemas();
		case 'RoleBinding':
			return getRoleBindingDataSchemas();
		case 'ClusterRole':
			return getClusterRoleDataSchemas();
		case 'ClusterRoleBinding':
			return getClusterRoleBindingDataSchemas();
		case 'LimitRange':
			return getLimitRangeDataSchemas();
		case 'Event':
			return getEventDataSchemas();
		case 'Node':
			return getNodeDataSchemas();
		case 'CustomResourceDefinition':
			return getCRDDataSchemas();
		case 'ResourceQuota':
			return getResourceQuotaDataSchemas();
		case 'Workspace':
			return getWorkspaceDataSchemas();
		case 'SimpleApp':
			return getSimpleAppDataSchemas();
		case 'HTTPRoute':
			return getHTTPRouteDataSchemas();
		case 'Gateway':
			return getGatewayDataSchemas();
		default:
			return getDefaultDataSchemas();
	}
}

function getData(apiResource: APIResource, object: any): Record<string, JsonValue> {
	switch (apiResource.kind) {
		case 'CronJob':
			return getCronJobData(object);
		case 'DaemonSet':
			return getDaemonSetData(object);
		case 'Deployment':
			return getDeploymentData(object);
		case 'Job':
			return getJobData(object);
		case 'Pod':
			return getPodData(object);
		case 'StatefulSet':
			return getStatefulSetData(object);
		case 'ConfigMap':
			return getConfigMapData(object);
		case 'Secret':
			return getSecretData(object);
		case 'Service':
			return getServiceData(object);
		case 'NetworkPolicy':
			return getNetworkPolicyData(object);
		case 'PersistentVolumeClaim':
			return getPVCData(object);
		case 'PersistentVolume':
			return getPVData(object);
		case 'StorageClass':
			return getStorageClassData(object);
		case 'Namespace':
			return getNamespaceData(object);
		case 'ServiceAccount':
			return getServiceAccountData(object);
		case 'Role':
			return getRoleData(object);
		case 'RoleBinding':
			return getRoleBindingData(object);
		case 'ClusterRole':
			return getClusterRoleData(object);
		case 'ClusterRoleBinding':
			return getClusterRoleBindingData(object);
		case 'LimitRange':
			return getLimitRangeData(object);
		case 'Event':
			return getEventData(object);
		case 'Node':
			return getNodeData(object);
		case 'CustomResourceDefinition':
			return getCRDData(object);
		case 'ResourceQuota':
			return getResourceQuotaData(object);
		case 'Workspace':
			return getWorkspaceData(object);
		case 'SimpleApp':
			return getSimpleAppData(object);
		case 'HTTPRoute':
			return getHTTPRouteData(object);
		case 'Gateway':
			return getGatewayData(object);
		default:
			return getDefaultData(apiResource, object);
	}
}

function getUISchemas(kind: string): Record<string, UISchemaType> {
	switch (kind) {
		case 'CronJob':
			return getCronJobUISchemas();
		case 'DaemonSet':
			return getDaemonSetUISchemas();
		case 'Deployment':
			return getDeploymentUISchemas();
		case 'Job':
			return getJobUISchemas();
		case 'Pod':
			return getPodUISchemas();
		case 'StatefulSet':
			return getStatefulSetUISchemas();
		case 'ConfigMap':
			return getConfigMapUISchemas();
		case 'Secret':
			return getSecretUISchemas();
		case 'Service':
			return getServiceUISchemas();
		case 'NetworkPolicy':
			return getNetworkPolicyUISchemas();
		case 'PersistentVolumeClaim':
			return getPVCUISchemas();
		case 'PersistentVolume':
			return getPVUISchemas();
		case 'StorageClass':
			return getStorageClassUISchemas();
		case 'Namespace':
			return getNamespaceUISchemas();
		case 'ServiceAccount':
			return getServiceAccountUISchemas();
		case 'Role':
			return getRoleUISchemas();
		case 'RoleBinding':
			return getRoleBindingUISchemas();
		case 'ClusterRole':
			return getClusterRoleUISchemas();
		case 'ClusterRoleBinding':
			return getClusterRoleBindingUISchemas();
		case 'LimitRange':
			return getLimitRangeUISchemas();
		case 'Event':
			return getEventUISchemas();
		case 'Node':
			return getNodeUISchemas();
		case 'CustomResourceDefinition':
			return getCRDUISchemas();
		case 'ResourceQuota':
			return getResourceQuotaUISchemas();
		case 'Workspace':
			return getWorkspaceUISchemas();
		case 'SimpleApp':
			return getSimpleAppUISchemas();
		case 'HTTPRoute':
			return getHTTPRouteUISchemas();
		case 'Gateway':
			return getGatewayUISchemas();
		default:
			return getDefaultUISchemas();
	}
}

function getColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<string, UISchemaType>,
	dataSchemas: Record<string, DataSchemaType>
): ColumnDef<Record<string, JsonValue>>[] {
	switch (apiResource.kind) {
		case 'CronJob':
			return getCronJobColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'DaemonSet':
			return getDaemonSetColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'Deployment':
			return getDeploymentColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'Job':
			return getJobColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'Pod':
			return getPodColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'StatefulSet':
			return getStatefulSetColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'ConfigMap':
			return getConfigMapColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'Secret':
			return getSecretColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'Service':
			return getServiceColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'NetworkPolicy':
			return getNetworkPolicyColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'PersistentVolumeClaim':
			return getPVCColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'PersistentVolume':
			return getPVColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'StorageClass':
			return getStorageClassColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'Namespace':
			return getNamespaceColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'ServiceAccount':
			return getServiceAccountColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'Role':
			return getRoleColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'RoleBinding':
			return getRoleBindingColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'ClusterRole':
			return getClusterRoleColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'ClusterRoleBinding':
			return getClusterRoleBindingColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'LimitRange':
			return getLimitRangeColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'Event':
			return getEventColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'Node':
			return getNodeColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'CustomResourceDefinition':
			return getCRDColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'ResourceQuota':
			return getResourceQuotaColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'Workspace':
			return getWorkspaceColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'SimpleApp':
			return getSimpleAppColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'HTTPRoute':
			return getHTTPRouteColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'Gateway':
			return getGatewayColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		default:
			return getDefaultColumnDefinitions(apiResource, uiSchemas, dataSchemas);
	}
}

export { getColumnDefinitions, getData, getDataSchemas, getUISchemas };
