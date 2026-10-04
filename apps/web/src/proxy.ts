import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Skip API proxying, Next internals, media and files with an extension.
  // "\\." must stay double-escaped: in a JS string "\." is just "." (any character),
  // which excluded every non-empty path and disabled locale redirects for "/parts" etc.
  matcher: '/((?!api|_next|_vercel|media|.*\\..*).*)',
};
