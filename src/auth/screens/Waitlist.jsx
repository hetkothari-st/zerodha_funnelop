import React, { useEffect } from 'react';
import { useAuth } from '../AuthProvider';
import { theme } from '../theme';
import { Title, Notice, TextButton } from '../ui';

export default function Waitlist() {
    const auth = useAuth();
    useEffect(() => {
        const id = setInterval(() => { auth.refreshProfile(); }, 30000);
        return () => clearInterval(id);
    }, [auth]);
    return (
        <div className="flex flex-col gap-4">
            <theme.Wordmark />
            <Title title="You're on the list" subtitle={`Thanks for signing up for ${theme.productName}. We'll email and SMS you when you're in.`} />
            <Notice kind="info">{auth.profile?.email || auth.user?.email}{auth.profile?.phone ? ` · ${auth.profile.phone}` : ''}</Notice>
            <TextButton onClick={() => auth.signOut()}>Sign out</TextButton>
        </div>
    );
}
