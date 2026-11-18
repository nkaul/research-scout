import type { Metadata } from 'next';
import AuthPanel from '@/components/auth-panel';
export const metadata: Metadata = { title: 'Reset your password · Research Scout', referrer: 'no-referrer' };
export default function ForgotPasswordPage() { return <AuthPanel mode="forgot" />; }
