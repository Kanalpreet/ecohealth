import { ErrorCode } from '../services/api'

/**
 * Put an ApiError from a form submit onto react-hook-form fields where possible.
 * Returns a message for the form-level alert, or null if every error found a field.
 * `fields` = the form's field names.
 */
export function applyServerErrors(error, setError, fields) {
  const fieldErrors = error?.fieldErrors || {}
  let unplaced = false
  for (const [name, message] of Object.entries(fieldErrors)) {
    if (fields.includes(name)) setError(name, { type: 'server', message })
    else unplaced = true
  }
  if (error?.code === ErrorCode.VALIDATION && Object.keys(fieldErrors).length > 0 && !unplaced) return null
  return error?.message || 'Something went wrong. Please try again.'
}
