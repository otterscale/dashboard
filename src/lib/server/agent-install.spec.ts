import { describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';

const { privateEnv, publicEnv } = vi.hoisted(() => ({
	privateEnv: { AGENT_TUNNEL_SERVER_URL: 'https://192.0.2.1:30300' } as Record<string, string>,
	publicEnv: {
		PUBLIC_WEB_URL: 'https://otterscale.example.com/',
		PUBLIC_HARBOR_URL: 'https://harbor.example.com'
	} as Record<string, string>
}));

vi.mock('$env/dynamic/private', () => ({ env: privateEnv }));
vi.mock('$env/dynamic/public', () => ({ env: publicEnv }));

const { buildAgentInstallCommands, validateClusterName } = await import('./agent-install');

const input = {
	cluster: 'devel',
	clusterAdminUsers: ['sub-1', 'sub-2'],
	joinToken: 'join-token-value',
	clusterInfo: {
		enabled: true,
		externalAddress: '192.0.2.1',
		nodePortRangeMin: 30000,
		nodePortRangeMax: 32767,
		inferenceURL: 'https://inference.example.com'
	},
	// Harbor's own naming. The `$` is why every heredoc below is quoted.
	harborRobotName: 'robot$devel',
	harborRobotSecret: 'robot-secret-value'
};

/** The document a `<<'DELIMITER'` heredoc feeds to the command. */
function heredocBody(command: string, delimiter: string): string {
	const lines = command.split('\n');
	const start = lines.findIndex((line) => line.endsWith(`<<'${delimiter}'`));
	const end = lines.indexOf(delimiter, start + 1);
	expect(start).toBeGreaterThanOrEqual(0);
	expect(end).toBeGreaterThan(start);
	return lines.slice(start + 1, end).join('\n');
}

describe('validateClusterName', () => {
	it('accepts a DNS-1123 label and rejects what the server would', () => {
		expect(validateClusterName('production-us-west-2')).toBeNull();
		expect(validateClusterName('')).not.toBeNull();
		expect(validateClusterName('-leading')).not.toBeNull();
		expect(validateClusterName('Upper')).not.toBeNull();
		expect(validateClusterName('a'.repeat(64))).not.toBeNull();
	});
});

describe('buildAgentInstallCommands', () => {
	it('refuses to emit anything without a cluster name or a join token', () => {
		expect(() => buildAgentInstallCommands({ ...input, cluster: 'Nope' })).toThrow(/cluster name/);
		expect(() => buildAgentInstallCommands({ ...input, joinToken: '' })).toThrow(/join token/);
	});

	// The bootstrap release has to be taken over by the wrapper's Flux HelmRelease,
	// which happens only when the release name and the storage namespace match
	// exactly. Both are a contract with the chart, so pin them here: breaking
	// either one leaves the install stuck on "release already exists" in a place no
	// type checker looks.
	it('bootstraps Flux under the release name and namespace the wrapper takes over', () => {
		const { fluxCommand } = buildAgentInstallCommands(input);
		expect(fluxCommand).toContain('helm upgrade --install flux');
		expect(fluxCommand).toContain('oci://ghcr.io/otterscale/helm-charts/flux');
		expect(fluxCommand).toContain('--namespace otterscale-system');
		expect(fluxCommand).toContain('--create-namespace');
		// No --version: always the newest tag, so version control lives in the chart.
		expect(fluxCommand).not.toContain('--version');
		// Values here would have to be repeated under the wrapper's flux.values, or
		// the first reconcile would roll them back.
		expect(fluxCommand).not.toContain('--values');
		expect(fluxCommand).not.toContain('--set');
	});

	it('puts the credentials in a Secret, not in the HelmRelease', () => {
		const { agentCommand } = buildAgentInstallCommands(input);

		const secret = parse(heredocBody(agentCommand, 'MANIFEST'));
		expect(secret.kind).toBe('Secret');
		expect(secret.metadata).toEqual({
			name: 'otterscale-agent-secrets',
			namespace: 'otterscale-system'
		});

		const credentials = parse(secret.stringData['values.yaml']);
		expect(credentials).toEqual({
			agent: { joinToken: 'join-token-value' },
			tenantOperator: {
				harbor: { robot: { name: 'robot$devel', secret: 'robot-secret-value' } }
			}
		});

		// The point of the split: neither credential appears in the values the
		// wrapper renders into the HelmRelease object, only in the Secret above.
		const wrapperValues = heredocBody(agentCommand, 'VALUES');
		expect(wrapperValues).not.toContain('join-token-value');
		expect(wrapperValues).not.toContain('robot-secret-value');
	});

	it('applies the Secret before installing the wrapper that references it', () => {
		const { agentCommand } = buildAgentInstallCommands(input);
		// Also the order the namespace requires: the Flux bootstrap creates it, this
		// applies into it, and only then does anything read it.
		expect(agentCommand.indexOf('kubectl apply')).toBeLessThan(
			agentCommand.indexOf('helm upgrade --install otterscale-agent-flux')
		);
	});

	it('references that Secret from the agent release and leaves its version to the wrapper', () => {
		const { agentCommand } = buildAgentInstallCommands(input);
		expect(agentCommand).toContain('helm upgrade --install otterscale-agent-flux');
		expect(agentCommand).toContain('--namespace otterscale-system');
		// No --version: always the newest tag, so version control lives in the chart.
		expect(agentCommand).not.toContain('--version');

		const values = parse(heredocBody(agentCommand, 'VALUES'));
		// Same HelmRepository the Modules page builds its catalog from, so the
		// versions it offers are versions these releases can resolve. An index, not
		// an oci:// reference: the page's index path is what reads the per-chart
		// annotations it filters on, and `oci://` would switch the repository to a
		// type that path cannot read.
		expect(values.repository).toEqual({
			name: 'modules',
			url: 'https://otterscale.github.io/helm-charts'
		});
		expect(values.agent.valuesFrom).toEqual([
			{ kind: 'Secret', name: 'otterscale-agent-secrets', valuesKey: 'values.yaml' },
			{
				kind: 'ConfigMap',
				name: 'otterscale-agent-values',
				valuesKey: 'values.yaml',
				optional: true
			}
		]);
		// Empty pins the agent chart version the wrapper was released for.
		expect(values.agent.version).toBeUndefined();
	});

	it('gives Flux the same optional override ConfigMap every module HelmRelease gets', () => {
		const { agentCommand } = buildAgentInstallCommands(input);
		const values = parse(heredocBody(agentCommand, 'VALUES'));

		expect(values.flux.valuesFrom).toEqual([
			{ kind: 'ConfigMap', name: 'flux-values', valuesKey: 'values.yaml', optional: true }
		]);
		// Empty pins the Flux chart version the wrapper was released for.
		expect(values.flux.version).toBeUndefined();
	});

	it('carries the cluster settings as plain values, with the port range joined', () => {
		const { agentCommand } = buildAgentInstallCommands(input);
		const values = parse(heredocBody(agentCommand, 'VALUES')).agent.values;

		expect(values.agent).toEqual({
			// Trailing slash: the HTTPRoute's PathPrefix /api/ rule needs it.
			serverURL: 'https://otterscale.example.com/api/',
			tunnelServerURL: 'https://192.0.2.1:30300',
			cluster: 'devel'
		});
		expect(values.clusterAdmin).toEqual({ enabled: true, users: ['sub-1', 'sub-2'] });
		expect(values.clusterInfo).toEqual({
			enabled: true,
			externalAddress: '192.0.2.1',
			// The chart wants one "min-max" string; the wizard carries them apart only
			// so "min < max" can be a schema rule.
			nodePortRange: '30000-32767',
			inferenceURL: 'https://inference.example.com'
		});
		expect(values.tenantOperator).toEqual({
			enabled: true,
			harbor: { url: 'https://harbor.example.com' }
		});
		expect(values.trustedCA).toBeUndefined();
	});

	it('omits an empty inferenceURL and disables cluster info when it is off', () => {
		const { agentCommand } = buildAgentInstallCommands({
			...input,
			clusterInfo: { ...input.clusterInfo, enabled: false, inferenceURL: undefined }
		});
		const values = parse(heredocBody(agentCommand, 'VALUES')).agent.values;
		expect(values.clusterInfo).toEqual({ enabled: false });
	});

	it('emits trustedCA only when the dashboard is told the CA is private', () => {
		privateEnv.AGENT_TRUSTED_CA_SECRET_NAME = 'otterscale-ca';
		try {
			const { agentCommand } = buildAgentInstallCommands(input);
			const values = parse(heredocBody(agentCommand, 'VALUES')).agent.values;
			expect(values.trustedCA).toEqual({ secretName: 'otterscale-ca', key: 'ca.crt' });

			// The chart pins the Secret's name while tenantOperator is enabled, so a
			// different one is a misconfiguration rather than something to pass along.
			privateEnv.AGENT_TRUSTED_CA_SECRET_NAME = 'our-own-ca';
			expect(() => buildAgentInstallCommands(input)).toThrow(/must be "otterscale-ca"/);
		} finally {
			delete privateEnv.AGENT_TRUSTED_CA_SECRET_NAME;
		}
	});

	it('fails loudly when the dashboard is missing its own configuration', () => {
		const tunnel = privateEnv.AGENT_TUNNEL_SERVER_URL;
		delete privateEnv.AGENT_TUNNEL_SERVER_URL;
		try {
			expect(() => buildAgentInstallCommands(input)).toThrow(/AGENT_TUNNEL_SERVER_URL/);
		} finally {
			privateEnv.AGENT_TUNNEL_SERVER_URL = tunnel;
		}
	});
});
