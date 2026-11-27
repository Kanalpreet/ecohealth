import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ShieldCheck, UserPlus } from 'lucide-react'
import { AuthCard } from '../components/AuthCard'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Checkbox } from '../components/ui/Checkbox'
import { Input } from '../components/ui/Input'
import { useAuth } from '../hooks/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useToast } from '../hooks/useToast'
import { LIMITS, registerSchema } from '../lib/validation'
import { applyServerErrors } from '../lib/formErrors'
import { ErrorCode } from '../services/api'

const FIELDS = ['name', 'email', 'password', 'consent']

export function RegisterPage() {
  useDocumentTitle('Create account')
  const { register: createAccount } = useAuth()
  const { toast } = useToast()
  const [params] = useSearchParams()
  const next = params.get('next')
  const [formError, setFormError] = useState(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', consent: false },
  })

  async function onSubmit(values) {
    setFormError(null)
    try {
      await createAccount(values)
      toast({ tone: 'success', title: 'Account created', description: 'Welcome to EcoHealth.' })
      // PublicOnlyRoute now redirects to the safe ?next= path (or /dashboard).
    } catch (error) {
      if (error?.code === ErrorCode.CONFLICT) {
        setError('email', { type: 'server', message: error.message })
        return
      }
      // Password policy errors (common password, same as email) come back as one 422 message.
      if (error?.code === ErrorCode.VALIDATION && !Object.keys(error.fieldErrors || {}).length) {
        setError('password', { type: 'server', message: error.message })
        return
      }
      setFormError(applyServerErrors(error, setError, FIELDS))
    }
  }

  const loginLink = next ? `/login?next=${encodeURIComponent(next)}` : '/login'

  return (
    <AuthCard
      title="Create your account"
      subtitle="Personalised climate-health awareness for you and your family."
      footer={
        <>
          Already have an account?{' '}
          <Link to={loginLink} className="font-semibold text-brand underline-offset-4 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        {formError && <Alert>{formError}</Alert>}
        <Input label="Name" autoComplete="name" maxLength={LIMITS.NAME_MAX} error={errors.name?.message} {...register('name')} />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          hint={`${LIMITS.PASSWORD_MIN} to ${LIMITS.PASSWORD_MAX} characters. A long phrase is easier to remember and harder to guess.`}
          error={errors.password?.message}
          {...register('password')}
        />

        <div className="flex gap-3 rounded-control bg-brand-soft p-3 text-sm text-ink">
          <ShieldCheck aria-hidden="true" size={20} className="mt-0.5 shrink-0 text-brand" />
          <p>
            <span className="font-semibold">Your privacy:</span> EcoHealth uses your account details and the family
            information you add only to show climate-health risk awareness. Your password is stored only as a secure
            hash, and you can export or delete all of your data at any time. EcoHealth is not medical advice.
          </p>
        </div>

        <Checkbox
          label="I agree that EcoHealth may store and use my account details and the family health information I add, as described above."
          error={errors.consent?.message}
          {...register('consent')}
        />

        <Button type="submit" icon={UserPlus} loading={isSubmitting} className="w-full">
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthCard>
  )
}
