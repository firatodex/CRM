/** Optional CRM policies stored in localStorage (device-local). */

const REQUIRE_PAYMENT_KEY = 'dyzen_require_payment_plan'

export function getRequirePaymentPlan() {
  try {
    return localStorage.getItem(REQUIRE_PAYMENT_KEY) === '1'
  } catch {
    return false
  }
}

export function setRequirePaymentPlan(enabled) {
  try {
    localStorage.setItem(REQUIRE_PAYMENT_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
  return !!enabled
}
