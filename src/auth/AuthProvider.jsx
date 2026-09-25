import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabase } from './supabaseClient';
import { friendlyError } from './core/errors';
import { sessionIdOf } from './core/validators';
import { screenFor } from './core/screenFor';
import { createApiFetch } from './core/apiFetch';
import { setUserNamespace } from './userStorage';

const AuthContext = createContext(null);
const CLAIMED_KEY = 'funnel_claimed_session';
const PROFILE_FIELDS = 'id,full_name,email,phone,status,role';

function readLinkError() {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const code = params.get('error_code');
    return code ? { code, description: params.get('error_description') || '' } : null;
}

const result = (error) => ({ error: friendlyError(error), code: error?.code ?? null });

export function AuthProvider({ children, client: clientProp }) {
    const client = useMemo(() => clientProp ?? getSupabase(), [clientProp]);
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState(null);
    const [profileError, setProfileError] = useState(false);
    const [recovery, setRecovery] = useState(false);
    const [linkError, setLinkError] = useState(readLinkError);
    const [displaced, setDisplaced] = useState(false);
    const sessionRef = useRef(null);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    const adoptSession = useCallback((s) => { sessionRef.current = s; setSession(s); }, []);

    // One device at a time: a new session claims the account and signs out the others.
    const claimIfNew = useCallback(async (s) => {
        const sid = sessionIdOf(s?.access_token);
        if (!sid) return;
        let claimed = null;
        try { claimed = localStorage.getItem(CLAIMED_KEY); } catch {}
        if (claimed === sid) return;
        const { error } = await client.rpc('claim_session');
        if (error) return;
        try { localStorage.setItem(CLAIMED_KEY, sid); } catch {}
        await client.auth.signOut({ scope: 'others' });
    }, [client]);

    const loadProfile = useCallback(async (userId) => {
        const { data, error } = await client.from('profiles').select(PROFILE_FIELDS).eq('id', userId).maybeSingle();
        if (error) { setProfileError(true); return; }
        setProfileError(false);
        setProfile(data);
    }, [client]);

    useEffect(() => {
        let active = true;
        client.auth.getSession().then(({ data }) => {
            if (!active) return;
            adoptSession(data.session);
            setLoading(false);
        });
        const { data: sub } = client.auth.onAuthStateChange((event, s) => {
            adoptSession(s);
            if (event === 'PASSWORD_RECOVERY') setRecovery(true);
            if (event === 'SIGNED_IN' && s) claimIfNew(s);
            if (event === 'SIGNED_OUT') { setProfile(null); setDisplaced(false); }
        });
        return () => { active = false; sub.subscription.unsubscribe(); };
    }, [client, claimIfNew, adoptSession]);

    const userId = session?.user?.id ?? null;
    const phoneVerified = Boolean(session?.user?.phone_confirmed_at);
    useEffect(() => {
        setUserNamespace(userId);
        if (userId) loadProfile(userId); else { setProfile(null); setProfileError(false); }
    }, [userId, phoneVerified, loadProfile]);

    const refreshSessionState = useCallback(async () => {
        const { data, error } = await client.auth.refreshSession();
        if (!error && data?.session) adoptSession(data.session);
        return error;
    }, [client, adoptSession]);

    const apiFetch = useMemo(() => createApiFetch({
        getAccessToken: async () => (await client.auth.getSession()).data.session?.access_token ?? null,
        onSignedInElsewhere: () => setDisplaced(true),
        onUnauthenticated: () => { client.auth.signOut({ scope: 'local' }); },
    }), [client]);

    const actions = useMemo(() => ({
        signInWithGoogle: async () => result((await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: origin } })).error),
        signInWithPassword: async (email, password) => result((await client.auth.signInWithPassword({ email: email.trim(), password })).error),
        signUpWithEmail: async ({ name, email, password }) => result((await client.auth.signUp({
            email: email.trim(), password, options: { data: { full_name: name.trim() }, emailRedirectTo: origin },
        })).error),
        resendSignupEmail: async (email) => result((await client.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: origin } })).error),
        sendPhoneOtp: async (phone, { createUser }) => result((await client.auth.signInWithOtp({ phone, options: { shouldCreateUser: createUser } })).error),
        verifyPhoneOtp: async (phone, code) => result((await client.auth.verifyOtp({ phone, token: code.trim(), type: 'sms' })).error),
        addEmail: async ({ name, email }) => {
            const { error } = await client.auth.updateUser({ email: email.trim(), data: { full_name: name.trim() } }, { emailRedirectTo: origin });
            if (error) return result(error);
            const uid = sessionRef.current?.user?.id;
            if (uid) await client.from('profiles').update({ full_name: name.trim() }).eq('id', uid);
            await refreshSessionState();
            return result(null);
        },
        resendEmailVerification: async () => {
            const u = sessionRef.current?.user;
            const r = u?.new_email
                ? await client.auth.resend({ type: 'email_change', email: u.new_email })
                : await client.auth.resend({ type: 'signup', email: u?.email ?? '', options: { emailRedirectTo: origin } });
            return result(r.error);
        },
        refreshUser: async () => result(await refreshSessionState()),
        startAddMobile: async (phone) => result((await client.auth.updateUser({ phone })).error),
        verifyAddMobile: async (phone, code) => {
            const { error } = await client.auth.verifyOtp({ phone, token: code.trim(), type: 'phone_change' });
            if (!error) await refreshSessionState();
            return result(error);
        },
        sendPasswordReset: async (email) => result((await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${origin}/reset-password` })).error),
        updatePassword: async (password) => {
            const { error } = await client.auth.updateUser({ password });
            if (!error) {
                setRecovery(false);
                if (typeof window !== 'undefined' && window.location.pathname === '/reset-password') window.history.replaceState(null, '', '/');
            }
            return result(error);
        },
        signOut: async () => {
            try { localStorage.removeItem(CLAIMED_KEY); } catch {}
            await client.auth.signOut({ scope: 'global' });
            setDisplaced(false);
        },
        signOutHere: async () => {
            try { localStorage.removeItem(CLAIMED_KEY); } catch {}
            await client.auth.signOut({ scope: 'local' });
            setDisplaced(false);
        },
        refreshProfile: async () => { const uid = sessionRef.current?.user?.id; if (uid) await loadProfile(uid); },
        clearLinkError: () => {
            setLinkError(null);
            if (typeof window !== 'undefined') window.history.replaceState(null, '', window.location.pathname);
        },
        markDisplaced: () => setDisplaced(true),
    }), [client, origin, loadProfile, refreshSessionState]);

    const value = useMemo(() => ({
        screen: screenFor({ loading, recovery, linkError, session, profile, profileError }),
        loading, session, user: session?.user ?? null, profile, profileError, recovery, linkError, displaced,
        accessToken: session?.access_token ?? null,
        apiFetch,
        ...actions,
    }), [loading, recovery, linkError, session, profile, profileError, displaced, apiFetch, actions]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
    return ctx;
}
