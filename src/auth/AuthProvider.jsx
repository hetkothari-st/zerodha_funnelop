import React, { createContext, useContext } from 'react';

const AuthContext = createContext(null);
export function AuthProvider({ children }) { return <AuthContext.Provider value={null}>{children}</AuthContext.Provider>; }
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
    return ctx;
}
