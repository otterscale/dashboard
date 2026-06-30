import {extractBlockSize} from './utils.ts'
import type { ServingKserveIoV1Alpha2LLMInferenceService } from '@otterscale/types';

export function getFamilyEndpointPickerConfiguration({
	modelServiceName,
	namespace,
	object,
}: {
	modelServiceName: string;
	namespace: string;
	object: ServingKserveIoV1Alpha2LLMInferenceService;
}) {
	const blockSize = extractBlockSize(object)

	return {
		apiVersion: 'serving.kserve.io/v1alpha1',
		kind: 'LLMInferenceServiceConfig',
		metadata: {
			name: `${modelServiceName}-family-epp`,
			namespace: namespace
		},
		spec: {
			storageInitializer: {
				enabled: true
			},
			router: {
				scheduler: {
					pool: {
						spec: {
							extensionRef: {
								failureMode: 'FailOpen',
								kind: 'Service',
								name: '{{ ChildName .ObjectMeta.Name `-epp-service` }}'
							},
							selector: {},
							targetPortNumber: 8000
						}
					},
					template: {
						serviceAccountName: `${modelServiceName}-epp-sa`,
						affinity: {
							nodeAffinity: {
								requiredDuringSchedulingIgnoredDuringExecution: {
									nodeSelectorTerms: [
										{
											matchExpressions: [
												{
													key: 'node-role.phison.mw/gpu',
													operator: 'In',
													values: ['true']
												}
											]
										}
									]
								}
							}
						},
						containers: [
							{
								name: 'tokenizer',
								image: 'harbor.phison.com/ai-mw/mw-llm-d-uds-tokenizer:501-0006.001',
								imagePullPolicy: 'IfNotPresent',
								env: [
									{
										name: 'TRANSFORMERS_OFFLINE',
										value: '1'
									},
									{
										name: 'HF_HUB_OFFLINE',
										value: '1'
									},
									{
										name: 'TOKENIZERS_DIR',
										value: '/mnt/models/base'
									},
									{
										name: 'TMPDIR',
										value: '/tmp/tokenizer'
									},
									{
										name: 'CUDA_VISIBLE_DEVICES',
										value: ''
									}
								],
								workingDir: '/mnt/models/base',
								ports: [
									{
										containerPort: 8082,
										name: 'health',
										protocol: 'TCP'
									}
								],
								startupProbe: {
									failureThreshold: 60,
									httpGet: {
										path: '/healthz',
										port: 8082,
										scheme: 'HTTP'
									},
									initialDelaySeconds: 5,
									periodSeconds: 10,
									successThreshold: 1,
									timeoutSeconds: 5
								},
								livenessProbe: {
									failureThreshold: 3,
									httpGet: {
										path: '/healthz',
										port: 8082,
										scheme: 'HTTP'
									},
									periodSeconds: 15,
									successThreshold: 1,
									timeoutSeconds: 5
								},
								readinessProbe: {
									failureThreshold: 3,
									httpGet: {
										path: '/healthz',
										port: 8082,
										scheme: 'HTTP'
									},
									periodSeconds: 10,
									successThreshold: 1,
									timeoutSeconds: 5
								},
								resources: {
									requests: {
										cpu: '256m',
										memory: '500Mi'
									}
								},
								securityContext: {
									allowPrivilegeEscalation: false,
									capabilities: {
										drop: ['ALL']
									},
									readOnlyRootFilesystem: true,
									runAsNonRoot: true,
									seccompProfile: {
										type: 'RuntimeDefault'
									}
								},
								volumeMounts: [
									{
										mountPath: '/tmp/tokenizer',
										name: 'tokenizer-uds'
									}
								]
							},
							{
								name: 'main',
								ports: [
									{
										containerPort: 9002,
										name: 'grpc',
										protocol: 'TCP'
									},
									{
										containerPort: 9003,
										name: 'grpc-health',
										protocol: 'TCP'
									},
									{
										containerPort: 9090,
										name: 'metrics',
										protocol: 'TCP'
									},
									{
										containerPort: 5557,
										name: 'zmq',
										protocol: 'TCP'
									}
								],
								image: 'harbor.phison.com/ai-mw/llm-d-inference-scheduler:501-0006.001',
								imagePullPolicy: 'IfNotPresent',
								env: [
									{
										name: 'LLMD_TOKENPROCESSORCONFIG_HASHSEED',
										value: '0'
									},
									{
										name: 'LLMD_TOKENPROCESSORCONFIG_BLOCKSIZETOKEN',
										value: blockSize
									}
								],
								startupProbe: {
									failureThreshold: 60,
									grpc: {
										port: 9003,
										service: 'envoy.service.ext_proc.v3.ExternalProcessor'
									},
									initialDelaySeconds: 5,
									periodSeconds: 10,
									successThreshold: 1,
									timeoutSeconds: 5
								},
								livenessProbe: {
									failureThreshold: 3,
									grpc: {
										port: 9003,
										service: 'envoy.service.ext_proc.v3.ExternalProcessor'
									},
									initialDelaySeconds: 5,
									periodSeconds: 10,
									successThreshold: 1,
									timeoutSeconds: 5
								},
								readinessProbe: {
									failureThreshold: 3,
									grpc: {
										port: 9003,
										service: 'envoy.service.ext_proc.v3.ExternalProcessor'
									},
									initialDelaySeconds: 30,
									periodSeconds: 10,
									successThreshold: 1,
									timeoutSeconds: 5
								},
								args: [
									'--pool-name',
									'{{ ChildName .ObjectMeta.Name `-inference-pool` }}',
									'--pool-namespace',
									'{{ .ObjectMeta.Namespace }}',
									'--zap-encoder',
									'json',
									'--grpc-port',
									'9002',
									'--grpc-health-port',
									'9003',
									'--config-file',
									'/etc/config/endpoint-picker-config.yaml',
									'--enable-cert-reload',
									'--v',
									'4'
								],
								resources: {
									requests: {
										cpu: '256m',
										memory: '500Mi'
									}
								},
								volumeMounts: [
									{
										mountPath: '/etc/config',
										name: 'endpoint-picker-config',
										readOnly: true
									},
									{
										mountPath: '/tmp/tokenizer',
										name: 'tokenizer-uds'
									}
								]
							}
						],
						volumes: [
							{
								name: 'endpoint-picker-config',
								configMap: {
									name: `${modelServiceName}-endpoint-picker-config`
								}
							},
							{
								name: 'tokenizer-uds',
								emptyDir: {}
							}
						],
						dnsPolicy: 'ClusterFirst',
						restartPolicy: 'Always',
						terminationGracePeriodSeconds: 30
					}
				}
			}
		}
	};
}
