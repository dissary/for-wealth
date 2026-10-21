// Where to send someone after they sign in, from the ?redirect= on the
// sign-in page. Anyone can craft that link, so only a path on this app's own
// origin is followed; anything else goes to the home page. The browser's own
// URL parser decides, so tricks it would read as another site ("//evil",
// "/\evil", stray tabs) are caught the same way it reads them. The path it
// returns is checked too: dot segments can normalise "/.//evil" into
// "//evil", which a browser would read as another site.
export function pathInsideApp(target: unknown, origin: string): string {
  if (typeof target !== 'string' || !target.startsWith('/')) return '/'
  const url = new URL(target, origin)
  if (url.origin !== origin || url.pathname.startsWith('//')) return '/'
  return url.pathname + url.search + url.hash
}

// Where every Better Auth link and redirect lands (verification emails, the
// sign-in callbackURL): the sign-in page. It forwards a signed-in user to
// `redirectTo` and explains a link that didn't work.
export function signInURL(redirectTo: unknown, origin: string): string {
  const target = pathInsideApp(redirectTo, origin)
  return target === '/' ? '/sign-in' : `/sign-in?${new URLSearchParams({ redirect: target })}`
}
