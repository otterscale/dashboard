/**
 * Shared utilities for determining which VM actions are available
 * based on the current printableStatus.
 *
 * Source:
 *   - Status enum:  staging/src/kubevirt.io/api/core/v1/types.go  (VirtualMachinePrintableStatus)
 *   - Action gates: pkg/virt-api/rest/lifecycle.go  (StartVMRequestHandler, StopVMRequestHandler,
 *                   PauseVMIRequestHandler, UnpauseVMIRequestHandler, RestartVMRequestHandler)
 *
 * We use a whitelist approach: each action explicitly lists the statuses
 * in which it is valid. Any status NOT in the whitelist (including new /
 * unknown statuses) will be treated as disabled, which is the safest default.
 *
 * ---
 * Full VirtualMachinePrintableStatus enum (from types.go):
 *
 *   Stopped                  – stopped and not expected to start
 *   Provisioning             – DataVolumes being prepared
 *   Starting                 – being prepared for running
 *   Running                  – running
 *   Paused                   – paused
 *   Stopping                 – in the process of stopping
 *   Terminating              – being deleted
 *   CrashLoopBackOff         – crash-loop retry
 *   Migrating                – live-migration in progress
 *   Unknown                  – state could not be obtained
 *   ErrorUnschedulable       – scheduling failed (unsatisfiable constraints)
 *   ErrImagePull             – error pulling a containerDisk image
 *   ImagePullBackOff         – backing off before retrying image pull
 *   ErrorPvcNotFound         – referenced PVC doesn't exist
 *   DataVolumeError          – error reported by a referenced DataVolume
 *   WaitingForVolumeBinding  – PVCs backing the VM not yet bound
 *   WaitingForReceiver       – receiver VM waiting for incoming migration
 */

// ---------------------------------------------------------------------------
// Action whitelists
// ---------------------------------------------------------------------------

/**
 * Statuses in which a VM can be **started**.
 *
 * Gate (lifecycle.go StartVMRequestHandler): rejects if VMI already exists
 * and is not in a final/unknown phase.  The two statuses below are the only
 * ones where the VMI is absent or finalised.
 */
const STARTABLE_STATUSES = new Set([
	'Stopped',
	'ErrorUnschedulable' // VirtualMachineStatusUnschedulable – was wrongly "Stopped (Unschedulable)" before
]);

/**
 * Statuses in which a VM can be **stopped**.
 *
 * Gate (lifecycle.go StopVMRequestHandler): for RunStrategyManual/RerunOnFailure
 * it needs a non-final VMI; for RunStrategyAlways/Once it just patches spec.running.
 * We conservatively allow only the states where the VM is clearly active to
 * avoid confusing the user during intermediate transitions.
 */
const STOPPABLE_STATUSES = new Set(['Running', 'Paused', 'Starting', 'Migrating']);

/**
 * Statuses in which a VM can be **paused**.
 *
 * Gate (lifecycle.go PauseVMIRequestHandler): `vmi.Status.Phase != v1.Running`
 * → strictly only Running.
 */
const PAUSABLE_STATUSES = new Set(['Running']);

/**
 * Statuses in which a VM can be **resumed** (unpaused).
 *
 * Gate (lifecycle.go UnpauseVMIRequestHandler): needs VMI phase == Running
 * AND the VirtualMachineInstancePaused condition set → only Paused maps to this.
 */
const RESUMABLE_STATUSES = new Set(['Paused']);

/**
 * Statuses in which a VM can be **restarted**.
 *
 * Gate (lifecycle.go RestartVMRequestHandler): rejects RunStrategyHalted / Once;
 * requires the VMI to exist (non-404). Running and Migrating both satisfy this.
 * Paused VMs can also be restarted (VMI exists and is non-final).
 */
const RESTARTABLE_STATUSES = new Set(['Running', 'Paused', 'Migrating']);

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export function canStart(status: string): boolean {
	return STARTABLE_STATUSES.has(status);
}

export function canStop(status: string): boolean {
	return STOPPABLE_STATUSES.has(status);
}

/**
 * Whether the Start / Stop toggle action is available.
 * The component decides start vs. stop based on `isRunning`;
 * this helper checks that the *current* status allows the action.
 */
export function canStartOrStop(status: string): boolean {
	return canStart(status) || canStop(status);
}

export function canPause(status: string): boolean {
	return PAUSABLE_STATUSES.has(status);
}

export function canResume(status: string): boolean {
	return RESUMABLE_STATUSES.has(status);
}

export function canPauseOrResume(status: string): boolean {
	return canPause(status) || canResume(status);
}

export function canRestart(status: string): boolean {
	return RESTARTABLE_STATUSES.has(status);
}

/**
 * Statuses in which a VNC console can be opened.
 *
 * VNC requires the VMI to actually exist and be reachable by virt-handler.
 * - Running : VMI is active and the VNC server is available.
 * - Paused  : VMI is still alive (just CPU-frozen), VNC framebuffer is intact.
 *
 * All other statuses (Stopped, Provisioning, Starting, Error*, …) mean either
 * the VMI does not exist yet or is being torn down, so a connection would fail.
 */
const VNC_STATUSES = new Set(['Running', 'Paused']);

export function canVnc(status: string): boolean {
	return VNC_STATUSES.has(status);
}
