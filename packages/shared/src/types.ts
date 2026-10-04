import type { Plan } from './plans';

export type JobMode = 'monitor' | 'keepalive' | 'heartbeat';
export const JOB_MODES = ['monitor', 'keepalive', 'heartbeat'] as const;

export type JobState = 'up' | 'down' | 'unknown';
export type JobStatus = 'active' | 'paused';
export type JobEventKind = 'down' | 'recovered' | 'paused' | 'resumed';

/** Result of one ping attempt. */
export interface PingOutcome {
  ok: boolean;
  httpStatus: number | null;
  error: string | null;
  durationMs: number;
}

/** Pro feature: what a "successful" ping means beyond the status code. */
export interface SuccessCondition {
  /** Allowed status codes; when omitted, any 2xx passes. */
  status?: number[];
  bodyContains?: string;
  /** Dot path into the JSON response body, e.g. "status" or "data.ok". */
  jsonPath?: string;
  /** Expected string value at jsonPath; defaults to "" (must be present). */
  /** Expected string value at jsonPath; defaults to "" (must be present). */
  jsonEquals?: string;
  /** Number of times to retry a failed ping. Max 3. */
  retries?: number;
}

export interface UserDTO {
  id: string;
  email: string;
  plan: Plan;
  createdAt: number;
}

export interface JobDTO {
  id: string;
  userId: string;
  name: string;
  url: string;
  method: string;
  cronExpression: string | null;
  timezone: string | null;
  mode: JobMode;
  intervalMin: number;
  slot: number;
  timeoutMs: number;
  status: JobStatus;
  state: JobState;
  failStreak: number;
  lastStateChange: number | null;
  lastStatus: number | null;
  lastError: string | null;
  successCondition: SuccessCondition | null;
  createdAt: number;
}

export interface JobEventDTO {
  id: number;
  jobId: string;
  at: number;
  kind: JobEventKind;
  httpStatus: number | null;
  error: string | null;
  durationMs: number | null;
}
