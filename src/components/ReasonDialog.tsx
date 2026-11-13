import { useEffect, useState } from 'react'
import { Button } from './lightswind/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './lightswind/dialog'
import { Textarea } from './lightswind/textarea'

type ReasonDialogProps = {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  busy?: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
}

/**
 * A moderation decision always needs a reason the other person can read, so the
 * prompt lives in a real dialog instead of a blocking browser prompt.
 */
export function ReasonDialog({ open, title, description, confirmLabel, busy = false, onCancel, onConfirm }: ReasonDialogProps) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (open) setReason('')
  }, [open])

  return <Dialog open={open} onOpenChange={next => { if (!next) onCancel() }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <Textarea
        value={reason}
        onChange={event => setReason(event.target.value)}
        placeholder="Write the reason that will be shown to the account owner."
        aria-label="Reason"
        rows={4}
      />
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button onClick={() => onConfirm(reason.trim())} disabled={busy || !reason.trim()}>{busy ? 'Saving...' : confirmLabel}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
