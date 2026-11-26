import { m } from '$lib/messages';

// Ceph health check codes in words, keyed by the `name` label of `ceph_health_detail`. Ceph's
// own message is not exported, so a code missing here shows as the code itself.

export type CheckContext = {
	/** The fullest OSD, for the checks about full OSDs. */
	osd?: { id: string; pct: string };
	/** The full ratio as a percentage, e.g. "95%". */
	full?: string;
};

type Text = { title: string; description: string };

const OSD_FULLNESS = new Set(['OSD_NEARFULL', 'OSD_BACKFILLFULL', 'OSD_FULL']);

const STATIC: Record<string, () => Text> = {
	POOL_NEARFULL: () => ({
		title: m.storage_check_pool_nearfull_title(),
		description: m.storage_check_pool_nearfull_desc()
	}),
	POOL_FULL: () => ({
		title: m.storage_check_pool_full_title(),
		description: m.storage_check_pool_full_desc()
	}),
	PG_DEGRADED: () => ({
		title: m.storage_check_pg_degraded_title(),
		description: m.storage_check_pg_degraded_desc()
	}),
	PG_AVAILABILITY: () => ({
		title: m.storage_check_pg_availability_title(),
		description: m.storage_check_pg_availability_desc()
	}),
	PG_DAMAGED: () => ({
		title: m.storage_check_pg_damaged_title(),
		description: m.storage_check_pg_damaged_desc()
	}),
	PG_RECOVERY_FULL: () => ({
		title: m.storage_check_pg_recovery_full_title(),
		description: m.storage_check_pg_recovery_full_desc()
	}),
	PG_BACKFILL_FULL: () => ({
		title: m.storage_check_pg_backfill_full_title(),
		description: m.storage_check_pg_backfill_full_desc()
	}),
	OBJECT_UNFOUND: () => ({
		title: m.storage_check_object_unfound_title(),
		description: m.storage_check_object_unfound_desc()
	}),
	OSD_SCRUB_ERRORS: () => ({
		title: m.storage_check_osd_scrub_errors_title(),
		description: m.storage_check_osd_scrub_errors_desc()
	}),
	POOL_NO_REDUNDANCY: () => ({
		title: m.storage_check_pool_no_redundancy_title(),
		description: m.storage_check_pool_no_redundancy_desc()
	}),
	TOO_FEW_OSDS: () => ({
		title: m.storage_check_too_few_osds_title(),
		description: m.storage_check_too_few_osds_desc()
	}),
	OSD_DOWN: () => ({
		title: m.storage_check_osd_down_title(),
		description: m.storage_check_osd_down_desc()
	}),
	OSD_HOST_DOWN: () => ({
		title: m.storage_check_osd_host_down_title(),
		description: m.storage_check_osd_host_down_desc()
	}),
	MON_DOWN: () => ({
		title: m.storage_check_mon_down_title(),
		description: m.storage_check_mon_down_desc()
	}),
	MON_DISK_LOW: () => ({
		title: m.storage_check_mon_disk_low_title(),
		description: m.storage_check_mon_disk_low_desc()
	}),
	MON_DISK_CRIT: () => ({
		title: m.storage_check_mon_disk_crit_title(),
		description: m.storage_check_mon_disk_crit_desc()
	}),
	MON_CLOCK_SKEW: () => ({
		title: m.storage_check_mon_clock_skew_title(),
		description: m.storage_check_mon_clock_skew_desc()
	}),
	MGR_DOWN: () => ({
		title: m.storage_check_mgr_down_title(),
		description: m.storage_check_mgr_down_desc()
	}),
	MDS_INSUFFICIENT_STANDBY: () => ({
		title: m.storage_check_mds_insufficient_standby_title(),
		description: m.storage_check_mds_insufficient_standby_desc()
	}),
	FS_DEGRADED: () => ({
		title: m.storage_check_fs_degraded_title(),
		description: m.storage_check_fs_degraded_desc()
	}),
	MDS_SLOW_METADATA_IO: () => ({
		title: m.storage_check_mds_slow_metadata_io_title(),
		description: m.storage_check_mds_slow_metadata_io_desc()
	}),
	FS_WITH_FAILED_MDS: () => ({
		title: m.storage_check_fs_with_failed_mds_title(),
		description: m.storage_check_fs_with_failed_mds_desc()
	}),
	SLOW_OPS: () => ({
		title: m.storage_check_slow_ops_title(),
		description: m.storage_check_slow_ops_desc()
	}),
	RECENT_CRASH: () => ({
		title: m.storage_check_recent_crash_title(),
		description: m.storage_check_recent_crash_desc()
	}),
	AUTH_INSECURE_KEYS_ALLOWED: () => ({
		title: m.storage_check_auth_insecure_keys_allowed_title(),
		description: m.storage_check_auth_insecure_keys_allowed_desc()
	}),
	AUTH_INSECURE_CLIENT_KEY_TYPE: () => ({
		title: m.storage_check_auth_insecure_client_key_type_title(),
		description: m.storage_check_auth_insecure_client_key_type_desc()
	}),
	AUTH_INSECURE_KEYS_CREATABLE: () => ({
		title: m.storage_check_auth_insecure_keys_creatable_title(),
		description: m.storage_check_auth_insecure_keys_creatable_desc()
	}),
	POOL_APP_NOT_ENABLED: () => ({
		title: m.storage_check_pool_app_not_enabled_title(),
		description: m.storage_check_pool_app_not_enabled_desc()
	}),
	OSDMAP_FLAGS: () => ({
		title: m.storage_check_osdmap_flags_title(),
		description: m.storage_check_osdmap_flags_desc()
	}),
	TOO_MANY_PGS: () => ({
		title: m.storage_check_too_many_pgs_title(),
		description: m.storage_check_too_many_pgs_desc()
	}),
	BLUESTORE_SLOW_OP_ALERT: () => ({
		title: m.storage_check_bluestore_slow_op_alert_title(),
		description: m.storage_check_bluestore_slow_op_alert_desc()
	})
};

export function isKnownCheck(code: string): boolean {
	return code in STATIC || OSD_FULLNESS.has(code);
}

export function describeCheck(code: string, context: CheckContext): Text {
	if (OSD_FULLNESS.has(code) && context.osd) {
		const params = { osd: context.osd.id, pct: context.osd.pct };
		if (code === 'OSD_NEARFULL') {
			return {
				title: m.storage_check_osd_nearfull_title(params),
				description: m.storage_check_osd_nearfull_desc({ full: context.full ?? '—' })
			};
		}
		if (code === 'OSD_BACKFILLFULL') {
			return {
				title: m.storage_check_osd_backfillfull_title(params),
				description: m.storage_check_osd_backfillfull_desc()
			};
		}
		return {
			title: m.storage_check_osd_full_title(params),
			description: m.storage_check_osd_full_desc()
		};
	}
	const known = STATIC[code];
	if (known) return known();
	return { title: code, description: m.storage_check_unknown_desc({ code }) };
}

/** Codes whose presence means data is unavailable, writes are stopped, or objects are missing. */
export function errorImpact(codes: string[]): 'unavailable' | 'full' | 'unfound' | undefined {
	const has = (code: string) => codes.includes(code);
	if (has('OBJECT_UNFOUND')) return 'unfound';
	if (has('PG_AVAILABILITY')) return 'unavailable';
	if (has('OSD_FULL') || has('POOL_FULL')) return 'full';
	return undefined;
}
