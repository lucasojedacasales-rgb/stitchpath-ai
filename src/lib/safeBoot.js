export const SAFE_APP_BOOT_MODE_V1 = true;

export function logSafeBootStatus(scope = 'APP') {
  console.log(`[BOOT] ${scope} mounted`);
  if (SAFE_APP_BOOT_MODE_V1) {
    console.log('[BOOT] safe boot active');
    console.log('[BOOT] universal validation skipped until manual run');
    console.log('[BOOT] reference learning skipped until manual run');
  }
}

export function logBootError(error) {
  console.error('[BOOT ERROR]', error);
}