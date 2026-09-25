import { test, expect, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthProvider';
import { createFakeSupabase, jwtWithSession } from '../test/fakeSupabase';

const fullUser = { id: 'u1', email: 'a@b.in', email_confirmed_at: 't', phone_confirmed_at: 't' };
const sessionFor = (sid, user = fullUser) => ({ access_token: jwtWithSession(sid), user });

function Probe() {
    const a = useAuth();
    return <div data-testid="screen">{a.screen}{a.displaced ? ' displaced' : ''}</div>;
}
const renderWith = (client) => render(<AuthProvider client={client}><Probe /></AuthProvider>);

test('no session → signIn', async () => {
    renderWith(createFakeSupabase());
    await waitFor(() => expect(screen.getByTestId('screen')).toHaveTextContent('signIn'));
});

test('approved user → app', async () => {
    renderWith(createFakeSupabase({ session: sessionFor('s1'), profile: { id: 'u1', status: 'approved', role: 'user' } }));
    await waitFor(() => expect(screen.getByTestId('screen')).toHaveTextContent('app'));
});

test('SIGNED_IN claims the session and signs out other devices', async () => {
    const client = createFakeSupabase({ profile: { id: 'u1', status: 'approved' } });
    renderWith(client);
    await act(async () => { client.emit('SIGNED_IN', sessionFor('s-new')); });
    await waitFor(() => expect(client.rpc).toHaveBeenCalledWith('claim_session'));
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'others' });
    expect(localStorage.getItem('funnel_claimed_session')).toBe('s-new');
});

test('does not re-claim an already-claimed session (reload of a displaced device)', async () => {
    localStorage.setItem('funnel_claimed_session', 's-old');
    const client = createFakeSupabase({ profile: { id: 'u1', status: 'approved' } });
    renderWith(client);
    await act(async () => { client.emit('SIGNED_IN', sessionFor('s-old')); });
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.auth.signOut).not.toHaveBeenCalled();
});

test('profile load error → unavailable', async () => {
    renderWith(createFakeSupabase({ session: sessionFor('s1'), profileError: { message: 'down' } }));
    await waitFor(() => expect(screen.getByTestId('screen')).toHaveTextContent('unavailable'));
});

test('PASSWORD_RECOVERY → resetPassword', async () => {
    const client = createFakeSupabase();
    renderWith(client);
    await act(async () => { client.emit('PASSWORD_RECOVERY', sessionFor('s1')); });
    await waitFor(() => expect(screen.getByTestId('screen')).toHaveTextContent('resetPassword'));
});

test('expired email link in the URL hash → linkExpired', async () => {
    window.history.replaceState(null, '', '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid');
    renderWith(createFakeSupabase());
    await waitFor(() => expect(screen.getByTestId('screen')).toHaveTextContent('linkExpired'));
    window.history.replaceState(null, '', '/');
});

test('actions return friendly errors', async () => {
    const client = createFakeSupabase();
    client.auth.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { code: 'invalid_credentials', message: 'Invalid login credentials' } });
    let api;
    function Grab() { api = useAuth(); return null; }
    render(<AuthProvider client={client}><Grab /></AuthProvider>);
    await waitFor(() => expect(api.loading).toBe(false));
    expect(await api.signInWithPassword(' a@b.in ', 'x')).toEqual({ error: 'Wrong email or password.', code: 'invalid_credentials' });
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.in', password: 'x' });
});

test('apiFetch 401 signed_in_elsewhere marks displaced', async () => {
    const client = createFakeSupabase({ session: sessionFor('s1'), profile: { id: 'u1', status: 'approved' } });
    const realFetch = global.fetch;
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ code: 'signed_in_elsewhere', message: 'x' }), { status: 401 }));
    let api;
    function Grab() { api = useAuth(); return <Probe />; }
    render(<AuthProvider client={client}><Grab /></AuthProvider>);
    await waitFor(() => expect(api.screen).toBe('app'));
    await act(async () => { await api.apiFetch('/api/admin/users'); });
    expect(screen.getByTestId('screen')).toHaveTextContent('displaced');
    global.fetch = realFetch;
});
