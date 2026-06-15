export function getWorkloadConfiguration({
	modelServiceName,
	namespace
}: {
	modelServiceName: string;
	namespace: string;
}) {
	return {
		apiVersion: 'serving.kserve.io/v1alpha2',
		kind: 'LLMInferenceServiceConfig',
		metadata: {
			name: `${modelServiceName}-workload-template`,
			namespace: namespace
		},
		spec: {
			storageInitializer: { enabled: true },
			template: {
				containers: [
					{
						name: 'main',
						env: [
							{ name: 'CUDA_DISABLE_CONTROL', value: 'true' },
							{ name: 'LMCACHE_LOG_LEVEL', value: 'INFO' },
							{ name: 'LMCACHE_CONFIG_FILE', value: '/mooncake-config/mooncake_config.yaml' },
							{ name: 'LMCACHE_USE_EXPERIMENTAL', value: 'True' },
							{ name: 'NCCL_CUMEM_HOST_ENABLE', value: '0' },
							{ name: 'PYTHONHASHSEED', value: '0' },
							{ name: 'HF_HOME', value: '/model-cache' },
							{ name: 'VLLM_CACHE_ROOT', value: '/vllm-cache' },
							{ name: 'PROMETHEUS_MULTIPROC_DIR', value: '/tmp/lmcache_prometheus' }
						],
						securityContext: {
							runAsNonRoot: false,
							capabilities: { add: ['IPC_LOCK'] }
						},
						livenessProbe: {
							httpGet: { path: '/health', port: 'vllm', scheme: 'HTTP' },
							periodSeconds: 10,
							timeoutSeconds: 5,
							failureThreshold: 3
						},
						readinessProbe: {
							httpGet: { path: '/v1/models', port: 'vllm', scheme: 'HTTP' },
							periodSeconds: 30,
							timeoutSeconds: 2,
							failureThreshold: 3
						},
						startupProbe: {
							httpGet: { path: '/v1/models', port: 'vllm', scheme: 'HTTP' },
							initialDelaySeconds: 60,
							periodSeconds: 15,
							timeoutSeconds: 5,
							failureThreshold: 80
						},
						volumeMounts: [
							{ mountPath: '/dev/shm', name: 'pod-shm' },
							{ mountPath: '/etc/ssl/certs', name: 'tls-certs', readOnly: true },
							{ mountPath: '/local-disk', name: 'local-disk' },
							{ mountPath: '/model-cache', name: 'hf-cache' },
							{ mountPath: '/mooncake-config', name: 'mooncake-config' },
							{ mountPath: '/tmp/lmcache_prometheus', name: 'lmcache-prometheus' },
							{ mountPath: '/vllm-cache', name: 'vllm-cache' }
						]
					}
				],
				terminationGracePeriodSeconds: 30,
				volumes: [
					{
						name: 'local-disk',
						persistentVolumeClaim: { claimName: `${modelServiceName}-local-disk-pvc` }
					},
					{
						name: 'pod-shm',
						hostPath: { path: '/dev/shm', type: 'Directory' }
					},
					{
						name: 'hf-cache',
						persistentVolumeClaim: { claimName: `${modelServiceName}-model-cache-pvc` }
					},
					{
						name: 'lmcache-prometheus',
						emptyDir: {}
					},
					{
						name: 'mooncake-config',
						configMap: {
							name: `${modelServiceName}-mooncake-lmcache-config`,
							items: [{ key: 'mooncake_config.yaml', path: 'mooncake_config.yaml' }]
						}
					},
					{
						name: 'tls-certs',
						secret: { secretName: '{{ ChildName .ObjectMeta.Name `-kserve-self-signed-certs` }}' }
					},
					{
						name: 'vllm-cache',
						persistentVolumeClaim: { claimName: `${modelServiceName}-vllm-cache-pvc` }
					}
				]
			}
		}
	};
}
