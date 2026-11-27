import { z } from 'zod'

/*
 * Form schemas that mirror the backend rules (backend/app/core/constants.py,
 * backend/app/schemas/*). Frontend validation is for usability only; the backend
 * always validates again (design.md §7).
 */
export const LIMITS = Object.freeze({
  NAME_MAX: 100,
  EMAIL_MAX: 254,
  PASSWORD_MIN: 10,
  PASSWORD_MAX: 128,
})

const email = z
  .string()
  .trim()
  .min(1, 'Enter your email address.')
  .max(LIMITS.EMAIL_MAX, `Email must be at most ${LIMITS.EMAIL_MAX} characters.`)
  .pipe(z.email('Enter a valid email address.'))

export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Enter your name.')
      .max(LIMITS.NAME_MAX, `Name must be at most ${LIMITS.NAME_MAX} characters.`),
    email,
    password: z
      .string()
      .min(LIMITS.PASSWORD_MIN, `Use at least ${LIMITS.PASSWORD_MIN} characters.`)
      .max(LIMITS.PASSWORD_MAX, `Use at most ${LIMITS.PASSWORD_MAX} characters.`),
    consent: z.literal(true, { error: 'Please agree to continue.' }),
  })
  .refine((data) => data.password.toLowerCase() !== data.email.toLowerCase(), {
    path: ['password'],
    message: "Your password can't be the same as your email.",
  })

export const loginSchema = z.object({
  email,
  // No minimum (older passwords may predate the policy); the max bounds hashing work.
  password: z
    .string()
    .min(1, 'Enter your password.')
    .max(LIMITS.PASSWORD_MAX, `Password must be at most ${LIMITS.PASSWORD_MAX} characters.`),
})
