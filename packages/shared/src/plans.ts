/**
 * Plan limits (section 3 of the project plan). Change prices or quotas here and
 * both the Worker API and the dashboard pick them up.
 *
 * plan_priority controls which jobs run first when a tick has more due jobs
 * than the per-tick ping budget (40 on the free plan): higher runs first.
 */
export type Plan = 'free' | 'pro' | 'team';

export interface PlanLimits {
  label: string;
  priceInr: string;
  intervalOptions: number[]; // minutes; 1440 = daily
  defaultInterval: number;
  maxJobs: number;
  methods: string[];
  canSetHeadersBody: boolean;
  successConditions: boolean;
  eventHistoryLimit: number; // events returned per job
  alertChannels: string[];
  planPriority: number;
}

export const PLANS: Record<Plan, PlanLimits> = {
  free: {
    label: 'Free',
    priceInr: '₹0',
    intervalOptions: [10], // fixed 10-minute pings on Free
    defaultInterval: 10,
    maxJobs: 3,
    methods: ['GET'],
    canSetHeadersBody: false,
    successConditions: false,
    eventHistoryLimit: 50,
    alertChannels: ['email'],
    planPriority: 0,
  },
  pro: {
    label: 'Pro',
    priceInr: '₹249/mo',
    intervalOptions: [1, 5, 10, 15, 30, 60, 1440],
    defaultInterval: 5,
    maxJobs: 25,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    canSetHeadersBody: true,
    successConditions: true,
    eventHistoryLimit: 50,
    alertChannels: ['email', 'telegram', 'discord', 'slack', 'webhook'],
    planPriority: 10,
  },
  team: {
    label: 'Team',
    priceInr: '₹599/mo',
    intervalOptions: [1, 5, 10, 15, 30, 60, 1440],
    defaultInterval: 5,
    maxJobs: 100,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    canSetHeadersBody: true,
    successConditions: true,
    eventHistoryLimit: 50,
    alertChannels: ['email', 'telegram', 'discord', 'slack', 'webhook'],
    planPriority: 20,
  },
};

/** Global cap of active free-plan jobs (plan section 2: ~300 free jobs). */
export const FREE_GLOBAL_JOB_CAP = 300;

/** Consecutive failures before a job is marked down. */
export const FAIL_THRESHOLD = 3;

/** Auto-pause a job that has been continuously down for this long. */
export const AUTO_PAUSE_AFTER_DOWN_MS = 7 * 24 * 60 * 60 * 1000;

/** Ping timeout bounds. Keep-alive jobs should default to 45s (sleeping hosts wake slowly). */
export const TIMEOUT_MIN_MS = 5_000;
export const TIMEOUT_MAX_MS = 60_000;
export const TIMEOUT_DEFAULT_MONITOR_MS = 30_000;
export const TIMEOUT_DEFAULT_KEEPALIVE_MS = 45_000;

export const MAX_URL_LENGTH = 2048;
export const MAX_HEADERS_COUNT = 10;
export const MAX_HEADER_NAME_LENGTH = 128;
export const MAX_HEADER_VALUE_LENGTH = 4096;
export const MAX_BODY_BYTES = 10_240;
export const MAX_REDIRECTS = 3;

/** Web login session lifetime. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** How many jobs a single tick can ping on the free Workers plan. */
export const TICK_PING_BUDGET = 40;
export const TICK_BATCH_SIZE = 6;
