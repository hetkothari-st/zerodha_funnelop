import React, { useState } from 'react';
import { useAuth } from '../AuthProvider';
import { theme } from '../theme';
import { Title, Field, PrimaryButton, GoogleButton, Divider, Tabs, Notice, TextButton, Legal } from '../ui';
import PhoneOtpForm from '../PhoneOtpForm';
import { isEmail } from '../core/validators';

export default function SignIn({ onSwitch, onForgot }) {
    const auth = useAuth();
    const [tab, setTab] = useState('email');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [code, setCode] = useState(null);
    const [info, setInfo] = useState(null);
    const [busy, setBusy] = useState(false);

    async function onSubmit(e) {
        e.preventDefault();
        if (!isEmail(email)) { setError('Enter a valid email address.'); return; }
        if (!password) { setError('Enter your password.'); return; }
        setBusy(true); setError(null); setInfo(null);
        const r = await auth.signInWithPassword(email.trim(), password);
        setBusy(false);
        setError(r.error); setCode(r.code);
    }

    async function onResend() {
        const r = await auth.resendSignupEmail(email.trim());
        if (r.error) setError(r.error); else { setError(null); setCode(null); setInfo('Verification email sent. Check your inbox.'); }
    }

    return (
        <div className="flex flex-col gap-4">
            <theme.Wordmark />
            <Title title="Sign in" subtitle={theme.tagline} />
            <GoogleButton onClick={() => auth.signInWithGoogle()} />
            <Divider />
            <Tabs value={tab} onChange={(v) => { setTab(v); setError(null); }} options={[{ value: 'email', label: 'Email' }, { value: 'mobile', label: 'Mobile OTP' }]} />
            {tab === 'email' ? (
                <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
                    <Field id="signin-email" label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    <Field id="signin-password" label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    <div className="flex justify-end"><TextButton onClick={onForgot}>Forgot password?</TextButton></div>
                    <Notice>{error}</Notice>
                    {code === 'email_not_confirmed' && <TextButton onClick={onResend}>Resend verification email</TextButton>}
                    <Notice kind="info">{info}</Notice>
                    <PrimaryButton busy={busy}>Sign in</PrimaryButton>
                </form>
            ) : (
                <PhoneOtpForm idPrefix="signin"
                    sendCode={(phone) => auth.sendPhoneOtp(phone, { createUser: false })}
                    verifyCode={(phone, c) => auth.verifyPhoneOtp(phone, c)} />
            )}
            <p className={`${theme.classes.muted} text-center`}>
                New to {theme.productName}? <TextButton onClick={() => onSwitch('signUp')}>Create an account</TextButton>
            </p>
            <Legal />
        </div>
    );
}
