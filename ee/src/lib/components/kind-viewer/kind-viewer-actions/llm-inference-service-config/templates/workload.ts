import type { ServingKserveIoV1Alpha2LLMInferenceServiceConfig } from '@otterscale/types';
import lodash from 'lodash';

export function getWorkloadConfiguration({
	modelServiceName,
	namespace,
	object
}: {
	modelServiceName: string;
	namespace: string;
	object: ServingKserveIoV1Alpha2LLMInferenceServiceConfig;
}) {
	const blockSize = lodash.get(object, [
		'metadata',
		'annotations',
		'model.otterscale.io/block-size'
	]);

	const chunkSize = blockSize
		? Math.max(1, Math.floor(1024 / Number(blockSize))) * Number(blockSize)
		: undefined;

	return {
		apiVersion: 'serving.kserve.io/v1alpha2',
		kind: 'LLMInferenceServiceConfig',
		metadata: {
			name: `${modelServiceName}-workload-template`,
			namespace: namespace
		},
		spec: {
			storageInitializer: {
				enabled: true
			},
			template: {
				serviceAccountName: `${namespace}-models`,
				runtimeClassName: 'nvidia',
				schedulerName: 'hami-scheduler',
				containers: [
					{
						image: 'harbor.phison.com/ai-mw/mw:501-0007.001',
						imagePullPolicy: 'IfNotPresent',
						name: 'lmcache-server',
						command: ['/bin/bash', '-lc'],
						args: [
							'set -euo pipefail\nulimit -l unlimited || true\nexec /usr/local/bin/start-lmcache.sh\n'
						],
						ports: [
							{
								containerPort: 5757,
								name: 'lmcache-zmq',
								protocol: 'TCP'
							},
							{
								containerPort: 8088,
								name: 'lmcache-http',
								protocol: 'TCP'
							}
						],
						env: [
							{
								name: 'POD_IP',
								valueFrom: {
									fieldRef: {
										apiVersion: 'v1',
										fieldPath: 'status.podIP'
									}
								}
							},
							{
								name: 'PYTHONHASHSEED',
								value: '0'
							},
							{
								name: 'LMCACHE_PORT',
								value: '5757'
							},
							{
								name: 'LMCACHE_CHUNK_SIZE',
								value: `'${chunkSize}'`
							},
							{
								name: 'LMCACHE_HASH_ALGORITHM',
								value: 'sha256_cbor'
							},
							{
								name: 'LMCACHE_L1_SIZE_GB',
								value: '20'
							},
							{
								name: 'LMCACHE_EVICTION_POLICY',
								value: 'LRU'
							},
							{
								name: 'LMCACHE_L2_STORE_POLICY',
								value: 'default'
							},
							{
								name: 'LMCACHE_NUM_WORKERS',
								value: '32'
							},
							{
								name: 'LMCACHE_HTTP_PORT',
								value: '8088'
							},
							{
								name: 'LMCACHE_FS_BASE_PATH',
								value: '/mnt/nvme0'
							},
							{
								name: 'LMCACHE_FS_NUM_WORKERS',
								value: '32'
							},
							{
								name: 'LMCACHE_FS_READ_AHEAD_SIZE',
								value: '4096'
							},
							{
								name: 'LMCACHE_FS_USE_ODIRECT',
								value: 'true'
							},
							{
								name: 'LMCACHE_LOG_LEVEL',
								value: 'INFO'
							},
							{
								name: 'LIBRARY_PATH',
								value:
									'/usr/lib/x86_64-linux-gnu:/usr/local/cuda-13.0/compat:/usr/local/cuda/compat'
							},
							{
								name: 'PROMETHEUS_MULTIPROC_DIR',
								value: '/tmp/lmcache_prometheus'
							}
						],
						resources: {
							requests: {
								cpu: '1',
								memory: '8Gi'
							},
							limits: {
								cpu: '4',
								memory: '28Gi'
							}
						},
						securityContext: {
							runAsNonRoot: false
						},
						startupProbe: {
							tcpSocket: {
								port: 5757
							},
							initialDelaySeconds: 10,
							periodSeconds: 10,
							timeoutSeconds: 5,
							failureThreshold: 30
						},
						livenessProbe: {
							tcpSocket: {
								port: 5757
							},
							periodSeconds: 15,
							timeoutSeconds: 5,
							failureThreshold: 3
						},
						volumeMounts: [
							{
								mountPath: '/dev/shm',
								name: 'pod-shm'
							},
							{
								mountPath: '/tmp/lmcache_prometheus',
								name: 'lmcache-prometheus'
							},
							{
								mountPath: '/data/kv-l2',
								name: 'local-disk'
							}
						]
					}
				],
				terminationGracePeriodSeconds: 30,
				volumes: [
					{
						name: 'local-disk',
						persistentVolumeClaim: {
							claimName: `${modelServiceName}-local-disk-pvc`
						}
					},
					{
						name: 'pod-shm',
						emptyDir: {
							medium: 'Memory',
							sizeLimit: '25Gi'
						}
					},
					{
						name: 'lmcache-prometheus',
						emptyDir: {}
					},
					{
						name: 'tls-certs',
						secret: {
							secretName: '{{ ChildName .ObjectMeta.Name `-kserve-self-signed-certs` }}'
						}
					}
				]
			}
		}
	};
}
