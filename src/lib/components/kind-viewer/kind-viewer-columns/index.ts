import type { JsonObject, JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { ColumnDef } from '@tanstack/table-core';

import type { DataSchemaType, UISchemaType } from '$lib/components/dynamic-table/utils.js';

import {
	getApplicationColumnDefinitions,
	getApplicationData,
	getApplicationDataSchemas,
	getApplicationUISchemas
} from './application.js';
import {
	getObjectBucketClaimColumnDefinitions,
	getObjectBucketClaimData,
	getObjectBucketClaimDataSchemas,
	getObjectBucketClaimUISchemas
} from './cephobjectbucketclaim.js';
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
	getDataVolumeColumnDefinitions,
	getDataVolumeData,
	getDataVolumeDataSchemas,
	getDataVolumeUISchemas
} from './datavolume.js';
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
	getHelmReleaseColumnDefinitions,
	getHelmReleaseData,
	getHelmReleaseDataSchemas,
	getHelmReleaseUISchemas
} from './helmrelease.js';
import {
	getHelmRepositoryColumnDefinitions,
	getHelmRepositoryData,
	getHelmRepositoryDataSchemas,
	getHelmRepositoryUISchemas
} from './helmrepository.js';
import {
	getHTTPRouteColumnDefinitions,
	getHTTPRouteData,
	getHTTPRouteDataSchemas,
	getHTTPRouteUISchemas
} from './httproute.js';
import {
	getVirtualMachineInstancetypeColumnDefinitions,
	getVirtualMachineInstancetypeData,
	getVirtualMachineInstancetypeDataSchemas,
	getVirtualMachineInstancetypeUISchemas
} from './instancetype.js';
import { getJobColumnDefinitions, getJobData, getJobDataSchemas, getJobUISchemas } from './job.js';
import {
	getLimitRangeColumnDefinitions,
	getLimitRangeData,
	getLimitRangeDataSchemas,
	getLimitRangeUISchemas
} from './limitrange.js';
import {
	getLLMInferenceServiceColumnDefinitions,
	getLLMInferenceServiceData,
	getLLMInferenceServiceDataSchemas,
	getLLMInferenceServiceUISchemas
} from './llminferenceservice.js';
import {
	getLLMInferenceServiceConfigColumnDefinitions,
	getLLMInferenceServiceConfigData,
	getLLMInferenceServiceConfigDataSchemas,
	getLLMInferenceServiceConfigUISchemas
} from './llminferenceserviceconfig.js';
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
} from './resourcequota.js';
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
	getScheduleColumnDefinitions,
	getScheduleData,
	getScheduleDataSchemas,
	getScheduleUISchemas
} from './schedule.js';
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
	getTaskColumnDefinitions,
	getTaskData,
	getTaskDataSchemas,
	getTaskUISchemas
} from './task.js';
import {
	getVirtualMachineColumnDefinitions,
	getVirtualMachineData,
	getVirtualMachineDataSchemas,
	getVirtualMachineUISchemas
} from './virtualmachine.js';
import {
	getWorkspaceColumnDefinitions,
	getWorkspaceData,
	getWorkspaceDataSchemas,
	getWorkspaceUISchemas
} from './workspace.js';

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
		case 'HelmRepository':
			return getHelmRepositoryDataSchemas();
		case 'HTTPRoute':
			return getHTTPRouteDataSchemas();
		case 'Gateway':
			return getGatewayDataSchemas();
		case 'HelmRelease':
			return getHelmReleaseDataSchemas();
		case 'VirtualMachine':
			return getVirtualMachineDataSchemas();
		case 'DataVolume':
			return getDataVolumeDataSchemas();
		case 'VirtualMachineInstancetype':
			return getVirtualMachineInstancetypeDataSchemas();
		case 'ObjectBucketClaim':
			return getObjectBucketClaimDataSchemas();
		case 'Application':
			return getApplicationDataSchemas();
		case 'Task':
			return getTaskDataSchemas();
		case 'Schedule':
			return getScheduleDataSchemas();
		case 'LLMInferenceService':
			return getLLMInferenceServiceDataSchemas();
		case 'LLMInferenceServiceConfig':
			return getLLMInferenceServiceConfigDataSchemas();
		default:
			return getDefaultDataSchemas();
	}
}

function getData(apiResource: APIResource, object: JsonObject): Record<string, JsonValue> {
	// Each Kind handler accepts its own specific K8s type; cast through `never` to satisfy
	// all of those signatures in a single dispatch without per-case casts.
	const resource = object as never;
	switch (apiResource.kind) {
		case 'CronJob':
			return getCronJobData(resource);
		case 'DaemonSet':
			return getDaemonSetData(resource);
		case 'Deployment':
			return getDeploymentData(resource);
		case 'Job':
			return getJobData(resource);
		case 'Pod':
			return getPodData(resource);
		case 'StatefulSet':
			return getStatefulSetData(resource);
		case 'ConfigMap':
			return getConfigMapData(resource);
		case 'Secret':
			return getSecretData(resource);
		case 'Service':
			return getServiceData(resource);
		case 'NetworkPolicy':
			return getNetworkPolicyData(resource);
		case 'PersistentVolumeClaim':
			return getPVCData(resource);
		case 'PersistentVolume':
			return getPVData(resource);
		case 'StorageClass':
			return getStorageClassData(resource);
		case 'Namespace':
			return getNamespaceData(resource);
		case 'ServiceAccount':
			return getServiceAccountData(resource);
		case 'Role':
			return getRoleData(resource);
		case 'RoleBinding':
			return getRoleBindingData(resource);
		case 'ClusterRole':
			return getClusterRoleData(resource);
		case 'ClusterRoleBinding':
			return getClusterRoleBindingData(resource);
		case 'LimitRange':
			return getLimitRangeData(resource);
		case 'Event':
			return getEventData(resource);
		case 'Node':
			return getNodeData(resource);
		case 'CustomResourceDefinition':
			return getCRDData(resource);
		case 'ResourceQuota':
			return getResourceQuotaData(resource);
		case 'Workspace':
			return getWorkspaceData(resource);
		case 'HelmRepository':
			return getHelmRepositoryData(resource);
		case 'HTTPRoute':
			return getHTTPRouteData(resource);
		case 'Gateway':
			return getGatewayData(resource);
		case 'HelmRelease':
			return getHelmReleaseData(resource);
		case 'VirtualMachine':
			return getVirtualMachineData(resource);
		case 'DataVolume':
			return getDataVolumeData(resource);
		case 'VirtualMachineInstancetype':
			return getVirtualMachineInstancetypeData(resource);
		case 'ObjectBucketClaim':
			return getObjectBucketClaimData(resource);
		case 'Application':
			return getApplicationData(resource);
		case 'Task':
			return getTaskData(resource);
		case 'Schedule':
			return getScheduleData(resource);
		case 'LLMInferenceService':
			return getLLMInferenceServiceData(resource);
		case 'LLMInferenceServiceConfig':
			return getLLMInferenceServiceConfigData(resource);
		default:
			return getDefaultData(apiResource, resource);
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
		case 'HelmRepository':
			return getHelmRepositoryUISchemas();
		case 'HTTPRoute':
			return getHTTPRouteUISchemas();
		case 'Gateway':
			return getGatewayUISchemas();
		case 'HelmRelease':
			return getHelmReleaseUISchemas();
		case 'VirtualMachine':
			return getVirtualMachineUISchemas();
		case 'DataVolume':
			return getDataVolumeUISchemas();
		case 'VirtualMachineInstancetype':
			return getVirtualMachineInstancetypeUISchemas();
		case 'ObjectBucketClaim':
			return getObjectBucketClaimUISchemas();
		case 'Application':
			return getApplicationUISchemas();
		case 'Task':
			return getTaskUISchemas();
		case 'Schedule':
			return getScheduleUISchemas();
		case 'LLMInferenceService':
			return getLLMInferenceServiceUISchemas();
		case 'LLMInferenceServiceConfig':
			return getLLMInferenceServiceConfigUISchemas();
		default:
			return getDefaultUISchemas();
	}
}

function getColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<string, UISchemaType>,
	dataSchemas: Record<string, DataSchemaType>,
	cluster?: string
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
		case 'HelmRepository':
			return getHelmRepositoryColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'HTTPRoute':
			return getHTTPRouteColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'Gateway':
			return getGatewayColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'HelmRelease':
			return getHelmReleaseColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'VirtualMachine':
			return getVirtualMachineColumnDefinitions(apiResource, uiSchemas, dataSchemas, cluster);
		case 'DataVolume':
			return getDataVolumeColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'VirtualMachineInstancetype':
			return getVirtualMachineInstancetypeColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'ObjectBucketClaim':
			return getObjectBucketClaimColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'Application':
			return getApplicationColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'Task':
			return getTaskColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'Schedule':
			return getScheduleColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'LLMInferenceService':
			return getLLMInferenceServiceColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		case 'LLMInferenceServiceConfig':
			return getLLMInferenceServiceConfigColumnDefinitions(apiResource, uiSchemas, dataSchemas);
		default:
			return getDefaultColumnDefinitions(apiResource, uiSchemas, dataSchemas);
	}
}

export { getColumnDefinitions, getData, getDataSchemas, getUISchemas };
