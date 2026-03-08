/**
 * Guest session management.
 * A guest ID is a random UUID stored in sessionStorage (cleared on tab close).
 * It's sent as the `x-guest-id` header on every tRPC request.
 * Calling `enterGuestMode()` sets the flag; `exitGuestMode()` clears it.
 */

const GUEST_MODE_KEY = 'psd_guest_mode';
const GUEST_ID_KEY = 'psd_guest_id';

function generateGuestId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function getGuestId(): string | null {
  try {
    return sessionStorage.getItem(GUEST_ID_KEY);
  } catch {
    return null;
  }
}

export function isGuestMode(): boolean {
  try {
    return sessionStorage.getItem(GUEST_MODE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function enterGuestMode(): string {
  const id = generateGuestId();
  try {
    sessionStorage.setItem(GUEST_MODE_KEY, 'true');
    sessionStorage.setItem(GUEST_ID_KEY, id);
  } catch {}
  return id;
}

export function exitGuestMode(): void {
  try {
    sessionStorage.removeItem(GUEST_MODE_KEY);
    sessionStorage.removeItem(GUEST_ID_KEY);
  } catch {}
}

// ── Pending job handoff ───────────────────────────────────────────────────────
// Written by UploadInterface after batch.create; read+cleared by ProcessingDashboard.
// Works for both guests (no DB) and authenticated users (instant display before poll).

const PENDING_JOB_KEY = 'psd_pending_job';

export interface PendingJob {
  // For authenticated users — DB job ID
  jobId?: number;
  // For guests — S3 keys passed directly to batch.start
  guestTemplateFileKey?: string;
  guestExcelFileKey?: string;
  guestSizeId?: string;
  totalRows?: number;
  isGuest: boolean;
}

export function setPendingJob(job: PendingJob): void {
  try { sessionStorage.setItem(PENDING_JOB_KEY, JSON.stringify(job)); } catch {}
}

export function consumePendingJob(): PendingJob | null {
  try {
    const raw = sessionStorage.getItem(PENDING_JOB_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_JOB_KEY);
    return JSON.parse(raw) as PendingJob;
  } catch { return null; }
}
