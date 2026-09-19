import { z } from 'zod'

export const pricingModelEnum = z.enum(['one_time', 'recurring'])
export const billingCadenceEnum = z.enum(['1m', '3m', '6m', '12m', 'custom'])

export const paymentRecordSchema = z.object({
  product_sold: z.string().trim().optional().nullable(),
  pricing_model: pricingModelEnum,
  list_price: z.number().nonnegative('Deal close price is required'),
  discount_percent: z.number().min(0).max(100).default(0),
  discount_amount: z.number().nonnegative().default(0),
  net_price: z.number().nonnegative(),
  monthly_price: z.number().nonnegative().optional().nullable(),
  net_monthly_price: z.number().nonnegative().optional().nullable(),
  billing_cadence: billingCadenceEnum.optional().nullable(),
  custom_interval_months: z.number().int().min(1).optional().nullable(),
  billing_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  mark_paid_today: z.boolean().optional().default(false),
  reminder_enabled: z.boolean().optional().default(false),
}).superRefine((data, ctx) => {
  if (!(data.list_price > 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a deal close price greater than 0', path: ['list_price'] })
  }
  if (data.pricing_model === 'recurring') {
    if (!data.billing_cadence) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose a billing cadence', path: ['billing_cadence'] })
    }
    if (data.billing_cadence === 'custom' && !(data.custom_interval_months >= 1)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Custom interval must be at least 1 month', path: ['custom_interval_months'] })
    }
    if (!(Number(data.monthly_price) > 0) && !(Number(data.net_price) > 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a recurring price', path: ['monthly_price'] })
    }
  }
})
