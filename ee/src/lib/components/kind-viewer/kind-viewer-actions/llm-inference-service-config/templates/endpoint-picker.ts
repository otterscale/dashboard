function getModelUriProtocol(modelUri: string): string {
	const match = modelUri.trim().match(/^([^:]+):/);
	return match ? match[1] : '';
}

function getEnvironments(modelUri: string) {
	if (getModelUriProtocol(modelUri) === 's3') {
		const uri = modelUri;
		const bucket = modelUri
			.trim()
			.replace(/^s3:\/\//i, '')
			.split('/')[0];
		return [
			{ name: 'S3_MODEL_URI', value: `${uri}` },

			{ name: 'MODEL_S3_BUCKET', value: `${bucket}` },
			{
				name: 'MODEL_S3_ENDPOINT',
				value: 'http://rook-ceph-rgw-ceph-objectstore.rook-ceph.svc:8301'
			},
			{
				name: 'AWS_ACCESS_KEY_ID',
				valueFrom: {
					secretKeyRef: { name: 'models', key: 'AWS_ACCESS_KEY_ID', optional: true }
				}
			},
			{
				name: 'AWS_SECRET_ACCESS_KEY',
				valueFrom: {
					secretKeyRef: { name: 'models', key: 'AWS_SECRET_ACCESS_KEY', optional: true }
				}
			}
		];
	}
	return [];
}

export function getFamilyEndpointPickerConfiguration({
	modelServiceName,
	namespace,
	modelUri
}: {
	modelServiceName: string;
	namespace: string;
	modelUri: string;
}) {
	return {
		apiVersion: 'serving.kserve.io/v1alpha2',
		kind: 'LLMInferenceServiceConfig',
		metadata: {
			name: `${modelServiceName}-family-epp`,
			namespace: namespace
		},
		spec: {
			storageInitializer: { enabled: false },
			router: {
				scheduler: {
					pool: {
						spec: {
							endpointPickerRef: {
								failureMode: 'FailOpen',
								kind: 'Service',
								name: '{{ ChildName .ObjectMeta.Name `-epp-service` }}',
								port: { number: 9002 }
							},
							selector: {
								matchLabels: { 'app.kubernetes.io/part-of': 'llminferenceservice' }
							},
							targetPorts: [{ number: 8000 }]
						}
					},
					template: {
						serviceAccountName: `${modelServiceName}-epp-sa`,
						initContainers: [
							{
								name: 's3-tokenizer-download',
								image: 'harbor.phison.com/ai-mw/mw-s3-downloader:latest',
								imagePullPolicy: 'IfNotPresent',
								command: [
									'python3',
									'-c',
									`
import boto3, os, pathlib, sys
from urllib.parse import urlparse
from botocore.client import Config

uri = os.environ.get('S3_MODEL_URI', '').strip()
if not uri:
    print('[s3-dl] S3_MODEL_URI not set, skipping')
    sys.exit(0)
parsed = urlparse(uri)
bucket = parsed.netloc
prefix = parsed.path.lstrip('/')

dst_dir = pathlib.Path('/model') / prefix
if (dst_dir / 'config.json').exists():
    print(f'[s3-dl] already present at {dst_dir}, skipping')
    sys.exit(0)
dst_dir.mkdir(parents=True, exist_ok=True)

endpoint = os.environ.get('MODEL_S3_ENDPOINT') or os.environ.get('AWS_ENDPOINT_URL') or None
s3 = boto3.client('s3',
    endpoint_url=endpoint,
    aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID', ''),
    aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY', ''),
    config=Config(signature_version='s3v4'))

SKIP_SUFFIXES = ('.safetensors', '.bin', '.pt', '.gguf', '.ggml')
count = 0
for page in s3.get_paginator('list_objects_v2').paginate(Bucket=bucket, Prefix=prefix + '/'):
    for obj in page.get('Contents', []):
        key = obj['Key']
        if any(key.endswith(s) for s in SKIP_SUFFIXES):
            print(f'[s3-dl] skip weight file: {key}')
            continue
        rel = key[len(prefix) + 1:]
        dst = dst_dir / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        print(f'-> {key}')
        s3.download_file(bucket, key, str(dst))
        count += 1
print(f'[s3-dl] downloaded {count} tokenizer files to {dst_dir}')
`
								],
								env: [...getEnvironments(modelUri)],
								volumeMounts: [{ mountPath: '/model', name: 'model' }]
							}
						],
						containers: [
							{
								name: 'tokenizer',
								image: 'harbor.phison.com/ai-mw/mw-llm-d-uds-tokenizer:vllm-v0.19.1-tx5.8',
								imagePullPolicy: 'IfNotPresent',
								env: [
									{ name: 'TRANSFORMERS_OFFLINE', value: '1' },
									{ name: 'HF_HUB_OFFLINE', value: '1' },
									{ name: 'TOKENIZERS_DIR', value: '/model' },
									{ name: 'TMPDIR', value: '/tmp/tokenizer' },
									{ name: 'CUDA_VISIBLE_DEVICES', value: '' }
								],
								workingDir: '/model',
								ports: [{ containerPort: 8082, name: 'health', protocol: 'TCP' }],
								startupProbe: {
									failureThreshold: 60,
									httpGet: { path: '/healthz', port: 8082, scheme: 'HTTP' },
									initialDelaySeconds: 5,
									periodSeconds: 10,
									successThreshold: 1,
									timeoutSeconds: 5
								},
								livenessProbe: {
									failureThreshold: 3,
									httpGet: { path: '/healthz', port: 8082, scheme: 'HTTP' },
									periodSeconds: 15,
									successThreshold: 1,
									timeoutSeconds: 5
								},
								readinessProbe: {
									failureThreshold: 3,
									httpGet: { path: '/healthz', port: 8082, scheme: 'HTTP' },
									periodSeconds: 10,
									successThreshold: 1,
									timeoutSeconds: 5
								},
								resources: { requests: { cpu: '256m', memory: '500Mi' } },
								securityContext: {
									allowPrivilegeEscalation: false,
									capabilities: { drop: ['ALL'] },
									readOnlyRootFilesystem: true,
									runAsNonRoot: true,
									seccompProfile: { type: 'RuntimeDefault' }
								},
								volumeMounts: [
									{ mountPath: '/tmp/tokenizer', name: 'tokenizer-uds' },
									{ mountPath: '/model', name: 'model', readOnly: true }
								]
							},
							{
								name: 'main',
								ports: [
									{ containerPort: 9002, name: 'grpc', protocol: 'TCP' },
									{ containerPort: 9003, name: 'grpc-health', protocol: 'TCP' },
									{ containerPort: 9090, name: 'metrics', protocol: 'TCP' },
									// KServe's LLMInferenceService controller expects this port name.
									{ containerPort: 5557, name: 'zmq', protocol: 'TCP' }
								],
								image: 'harbor.phison.com/ai-mw/llm-d-inference-scheduler:v0.8.0',
								imagePullPolicy: 'IfNotPresent',
								env: [{ name: 'LLMD_TOKENPROCESSORCONFIG_HASHSEED', value: '0' }],
								startupProbe: {
									failureThreshold: 60,
									grpc: { port: 9003, service: 'envoy.service.ext_proc.v3.ExternalProcessor' },
									initialDelaySeconds: 5,
									periodSeconds: 10,
									successThreshold: 1,
									timeoutSeconds: 5
								},
								livenessProbe: {
									failureThreshold: 3,
									grpc: { port: 9003, service: 'envoy.service.ext_proc.v3.ExternalProcessor' },
									initialDelaySeconds: 5,
									periodSeconds: 10,
									successThreshold: 1,
									timeoutSeconds: 5
								},
								readinessProbe: {
									failureThreshold: 3,
									grpc: { port: 9003, service: 'envoy.service.ext_proc.v3.ExternalProcessor' },
									initialDelaySeconds: 30,
									periodSeconds: 10,
									successThreshold: 1,
									timeoutSeconds: 5
								},
								args: [
									// Pool name matches controller-created InferencePool (inference-pool suffix).
									// All replicas are under the base LLMIS so the auto-created pool covers them.
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
									// KServe v0.17 skips cert-hash restart when scheduler supports reload.
									'--enable-cert-reload',
									'--v',
									'4'
								],
								resources: { requests: { cpu: '256m', memory: '500Mi' } },
								volumeMounts: [
									{ mountPath: '/etc/config', name: 'endpoint-picker-config', readOnly: true },
									{ mountPath: '/model', name: 'model', readOnly: true },
									{ mountPath: '/tmp/tokenizer', name: 'tokenizer-uds' }
								]
							}
						],
						volumes: [
							{
								name: 'endpoint-picker-config',
								configMap: { name: `${modelServiceName}-endpoint-picker-config` }
							},
							{ name: 'model', emptyDir: {} },
							{ name: 'tokenizer-uds', emptyDir: {} }
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
