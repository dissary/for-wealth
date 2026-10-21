// In development no email is sent, so this says where the link went instead.
export function DevEmailNote() {
  if (!import.meta.env.DEV) return null
  return (
    <p className="text-sm text-muted-foreground">
      In development no email is sent. The link is printed in the terminal
      running the API.
    </p>
  )
}
