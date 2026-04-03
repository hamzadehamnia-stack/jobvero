import { redirect } from 'next/navigation';

// Redirect root to the default locale.
// The middleware handles all other locale redirects — this catches
// the edge case where middleware doesn't intercept the bare root.
export default function RootPage() {
  redirect('/en');
}
