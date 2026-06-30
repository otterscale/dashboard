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
		apiVersion: 'serving.kserve.io/v1alpha1',
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
				serviceAccountName: `${modelServiceName}-kserve-s3-sa`,
				runtimeClassName: 'nvidia',
				schedulerName: 'hami-scheduler',
				containers: [
					{
						image: 'harbor.phison.com/ai-mw/mw:501-0005.006',
						imagePullPolicy: 'IfNotPresent',
						name: 'lmcache-server',
						command: ['/bin/bash', '-lc'],
						args: [
							[
								'set -euo pipefail',
								'ulimit -l unlimited || true',
								`L2_ADAPTER_JSON='{"type":"fs_native","base_path":"/data/kv-l2","num_workers":32,"read_ahead_size":4096,"use_odirect":true}'`,
								`echo "starting lmcache server (L1=20GB lazy init=5GB, L2=fs_native+odirect, base_path=/data/kv-l2, port=5757, http=8088, hash=sha256_cbor, chunk-size=${chunkSize})"`,
								'echo "L2 adapter: ${L2_ADAPTER_JSON}"',
								'# chunk-size MUST be a multiple of vLLM block_size (2096, mamba page size at TP=4).',
								'# The vLLM-side connector queries this value from the server over MQ and asserts',
								'# tokens_per_chunk % vllm_block_size == 0 (LMCacheMPWorkerAdapter).',
								'exec /opt/vllm/bin/lmcache server \\',
								'  --host 0.0.0.0 \\',
								'  --port 5757 \\',
								`  --chunk-size ${chunkSize} \\`,
								'  --hash-algorithm sha256_cbor \\',
								'  --l1-size-gb 20 \\',
								'  --l1-use-lazy \\',
								'  --l1-init-size-gb 5 \\',
								'  --l1-align-bytes 4096 \\',
								'  --eviction-policy LRU \\',
								'  --engine-type default \\',
								'  --max-workers 32 \\',
								'  --l2-adapter "${L2_ADAPTER_JSON}" \\',
								'  --l2-store-policy default \\',
								'  --http-port 8088'
							].join('\n')
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
								name: 'LMCACHE_PORT',
								value: '5757'
							},
							{
								name: 'LMCACHE_HTTP_PORT',
								value: '8088'
							},
							{
								name: 'PYTHONHASHSEED',
								value: '0'
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
								name: 'host-dev-shm'
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
						name: 'host-dev-shm',
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
