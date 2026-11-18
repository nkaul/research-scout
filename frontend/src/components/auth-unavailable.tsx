import Link from 'next/link';

export default function AuthUnavailable() {
  return <main style={{ maxWidth: 560, margin: '12vh auto', padding: 28, fontSize: 16, lineHeight: 1.7 }}>
    <h1>Sign-in service unavailable</h1>
    <p>We couldn’t reach the sign-in service. Please try again in a moment.</p>
    <p><Link href="/app" prefetch={false}>Try again</Link> · <Link href="/">Return to Research Scout</Link></p>
  </main>;
}
