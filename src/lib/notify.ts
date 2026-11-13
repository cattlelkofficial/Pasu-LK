import { toast } from '../hooks/use-toast'

type Tone = 'default' | 'success' | 'destructive' | 'warning' | 'info'

/** The app reports outcomes through the Lightswind toaster, always the same way. */
export function notify(title: string, description?: string, variant: Tone = 'default') {
  toast({ title, description, variant })
}
