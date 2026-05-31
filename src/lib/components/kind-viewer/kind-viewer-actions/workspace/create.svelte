<script lang="ts" module>
	export interface Member {
		subject: string;
		role: string;
		name: string;
		username: string;
		isServiceAccount: boolean;
	}
</script>

<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { FormState, FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
	import { getValueSnapshot, setValue, SubmitButton } from '@sjsf/form';
	import Ajv from 'ajv';
	import { load } from 'js-yaml';
	import lodash from 'lodash';
	import { mode as themeMode } from 'mode-watcher';
	import { getContext, type Snippet } from 'svelte';
	import Monaco from 'svelte-monaco';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import { page } from '$app/state';
	import Form from '$lib/components/dynamic-form/form.svelte';
	import RoleComboboxWidget from '$lib/components/dynamic-form/widgets/role-combobox.svelte';
	import UserComboboxWidget, {
		getDisplayName,
		type KeycloakUser
	} from '$lib/components/dynamic-form/widgets/user-combobox.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { bump } from '$lib/stores/pulse.svelte';

	let {
		cluster,
		group,
		version,
		kind,
		resource,
		schema,
		role,
		onSuccess,
		open,
		trigger
	}: {
		cluster: unknown;
		group: unknown;
		version: unknown;
		kind: unknown;
		resource: unknown;
		schema: unknown;
		role: unknown;
		onSuccess: unknown;
		open: unknown;
		trigger: unknown;
	} = $props();

	// svelte-ignore state_referenced_locally
	void cluster;
	// svelte-ignore state_referenced_locally
	void group;
	// svelte-ignore state_referenced_locally
	void version;
	// svelte-ignore state_referenced_locally
	void kind;
	// svelte-ignore state_referenced_locally
	void resource;
	// svelte-ignore state_referenced_locally
	void schema;
	// svelte-ignore state_referenced_locally
	void role;
	// svelte-ignore state_referenced_locally
	void onSuccess;
	// svelte-ignore state_referenced_locally
	void open;
	// svelte-ignore state_referenced_locally
	void trigger;
</script>
