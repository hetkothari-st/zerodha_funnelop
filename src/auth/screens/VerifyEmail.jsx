import React, { useState } from 'react';
import { useAuth } from '../AuthProvider';
import { Title, Notice, PrimaryButton, SecondaryButton, TextButton } from '../ui';

export default function VerifyEmail() {
    const auth = useAuth();
    const target = auth.user?.new_email || auth.user?.email;
    const [info, setInfo] = useState(null);
    const [error, setError] = useState(null);

    async function onRefresh() {
        setError(null);
        const r = await auth.refreshUser();
        if (r.error) setError(r.error); else setInfo('Still waiting for the link to be opened.');
    }
    async function onResend() {
        const r = await auth.resendEmailVerification();
        if (r.error) setError(r.error); else setInfo(`Sent again to ${target}.`);
    }

    return (
        <div className="flex flex-col gap-4">
            <Title title="Check your inbox" subtitle={`Open the verification link we sent to ${target}.`} />
            <Notice kind="info">{info}</Notice>
            <Notice>{error}</Notice>
            <PrimaryButton type="button" onClick={onRefresh}>I've verified</PrimaryButton>
            <SecondaryButton onClick={onResend}>Resend email</SecondaryButton>
            <TextButton onClick={() => auth.signOut()}>Sign out</TextButton>
        </div>
    );
}
