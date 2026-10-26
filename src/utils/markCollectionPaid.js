import { markPaymentPaid, markPaymentUnpaid } from '../api/payments'
import { patchDeal } from '../api/deals'
import { todayStr } from './index'
import { completePaymentReminder } from './paymentReminders'

/**
 * Persist Mark paid for a unified collection queue item.
 * Returns undo payload so a toast can reverse the action.
 *
 * @param {{ kind: string, payment?: object, deal?: object }} item
 * @param {string} [today]
 * @returns {Promise<{ type: string, paymentId?: string, undo: object, label?: string, amount?: number, clientName?: string }>}
 */
export async function markCollectionItemPaid(item, today = todayStr()) {
  if (!item) throw new Error('Nothing to mark paid')

  const meta = {
    label: item.label,
    amount: item.amount,
    clientName: item.client?.name,
  }

  if (item.kind === 'invoice' && item.payment?.id) {
    const { error } = await markPaymentPaid(item.payment.id, today)
    if (error) throw error
    return {
      type: 'invoice',
      paymentId: item.payment.id,
      undo: { kind: 'invoice', paymentId: item.payment.id },
      ...meta,
    }
  }

  if (item.kind === 'renewal' && item.deal) {
    const previousNextReminderAt = item.deal.next_reminder_at || null
    const result = await completePaymentReminder(item.deal, {
      createPaymentRow: true,
      markPaid: true,
    })
    const paymentId = result.payment?.id || null
    return {
      type: 'renewal',
      paymentId,
      dealId: item.deal.id,
      undo: {
        kind: 'renewal',
        paymentId,
        dealId: item.deal.id,
        previousNextReminderAt,
      },
      ...meta,
    }
  }

  throw new Error('Unknown collection item')
}

/**
 * Reverse a Mark paid action from toast undo metadata.
 * @param {{ kind: string, paymentId?: string, dealId?: string, previousNextReminderAt?: string|null }} undo
 */
export async function undoMarkCollectionPaid(undo) {
  if (!undo) throw new Error('Nothing to undo')

  if (undo.kind === 'invoice' && undo.paymentId) {
    const { error } = await markPaymentUnpaid(undo.paymentId)
    if (error) throw error
    return
  }

  if (undo.kind === 'renewal') {
    if (undo.paymentId) {
      const { error } = await markPaymentUnpaid(undo.paymentId)
      if (error) throw error
    }
    if (undo.dealId && undo.previousNextReminderAt) {
      const { error } = await patchDeal(undo.dealId, { next_reminder_at: undo.previousNextReminderAt })
      if (error) throw error
    }
    return
  }

  throw new Error('Unknown undo kind')
}
