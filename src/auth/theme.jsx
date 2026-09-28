import React from 'react';

function Wordmark() {
    return (
        <span className="font-['Space_Grotesk',sans-serif] text-2xl font-bold tracking-tight text-slate-100">
            funnel<span className="text-[#38bdf8]">/op</span>
        </span>
    );
}

export const theme = {
    productName: 'Funnel Op',
    tagline: 'Pick up where the market left you.',
    Wordmark,
    accent: '#38bdf8',
    proFeatures: ['Live Logs with big-order alerts and sounds', 'Recent Alerts feed', 'Quick Strikes', 'Multiple monitors', 'Columns layout'],
    classes: {
        page: "min-h-screen flex flex-col min-[900px]:flex-row bg-[#04060a] text-slate-200 font-['Inter',sans-serif]",
        panel: 'relative h-40 shrink-0 overflow-hidden border-b border-[#1e293b] min-[900px]:h-auto min-[900px]:flex-[1.35] min-[900px]:border-b-0 min-[900px]:border-r',
        formSide: 'flex flex-1 items-center justify-center bg-[#070a10] px-4 py-10',
        title: 'text-2xl font-extrabold tracking-tight text-slate-100',
        subtitle: 'text-sm text-slate-400',
        label: 'text-xs font-semibold text-slate-400',
        input: 'w-full rounded-[10px] border border-[#1e293b] bg-[#0b1220] px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-[#38bdf8]',
        primary: 'w-full rounded-[10px] bg-[#38bdf8] py-2.5 text-sm font-extrabold text-[#04060a] hover:brightness-110 disabled:opacity-50',
        secondary: 'w-full rounded-[10px] border border-[#1e293b] py-2.5 text-sm font-semibold text-slate-200 hover:border-[#38bdf8] disabled:opacity-50',
        google: 'flex w-full items-center justify-center gap-2 rounded-[10px] bg-white py-2.5 text-sm font-semibold text-[#1f1f1f] hover:bg-slate-100 disabled:opacity-50',
        divider: 'flex items-center gap-3 text-[10px] uppercase tracking-[0.12em] text-slate-500 before:h-px before:flex-1 before:bg-slate-700 after:h-px after:flex-1 after:bg-slate-700',
        tabs: 'flex rounded-[10px] border border-[#1e293b] bg-[#0b1220] p-1 text-xs font-semibold',
        tabOn: 'flex-1 rounded-lg bg-[#38bdf8] py-1.5 text-[#04060a]',
        tabOff: 'flex-1 rounded-lg py-1.5 text-slate-400 hover:text-slate-200',
        link: 'font-semibold text-[#38bdf8] hover:underline',
        muted: 'text-xs text-slate-500',
        error: 'rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300',
        info: 'rounded-lg border border-[#38bdf8]/30 bg-[#38bdf8]/10 px-3 py-2 text-xs text-sky-200',
        card: 'rounded-xl border border-[#1e293b] bg-[#0b1220] p-4',
        modal: 'fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4',
        modalCard: 'flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-[#1e293b] bg-[#070a10] p-6',
        adminPage: "min-h-screen bg-[#04060a] px-4 py-8 text-slate-200 font-['Inter',sans-serif]",
    },
};
