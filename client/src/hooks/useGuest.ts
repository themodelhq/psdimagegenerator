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
