import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { LogIn } from 'lucide-react'
import { AuthCard } from '../components/AuthCard'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { useAuth } from '../hooks/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { loginSchema } from '../lib/validation'
import { applyServerErrors } from '../lib/formErrors'

export function LoginPage() {
  useDocumentTitle('Log in')
  const { login } = useAuth()
  const [params] = useSearchParams()
  const next = params.get('next')
  const [formError, setFormError] = useState(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })

  // On success PublicOnlyRoute redirects to the safe ?next= path (or /dashboard).
  async function onSubmit(values) {
    setFormError(null)
    try {
      await login(values)
    } catch (error) {
      setFormError(applyServerErrors(error, setError, ['email', 'password']))
    }
  }

  const registerLink = next ? `/register?next=${encodeURIComponent(next)}` : '/register'

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Log in to see today's climate-health picture for your family."
      footer={
        <>
          New to EcoHealth?{' '}
          <Link to={registerLink} className="font-semibold text-brand underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        {formError && <Alert>{formError}</Alert>}
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
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" icon={LogIn} loading={isSubmitting} className="w-full">
          {isSubmitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
    </AuthCard>
  )
}
