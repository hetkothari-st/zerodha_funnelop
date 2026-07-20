import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, X, ChevronDown, Check, GripVertical, Zap, LogOut } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Reorder, useDragControls } from 'framer-motion';
import contractsData from '../contracts_nsefo.json';
import CandleChart from './CandleChart';

function cn(...inputs) {
    return twMerge(clsx(inputs));
}

const DraggableRow = ({ token, isAtm, onDragStateChange, onRemove, onUpdateQty, onUpdateStrike, onUpdateType, onUpdateHeight, depthEvents, depthDataRef }) => {
    const controls = useDragControls();
    const rowHeight = token.height || 400;

    // Resizing Logic
    const handleResizeStart = (e) => {
        e.stopPropagation();
        e.preventDefault();

        const startY = e.pageY;
        const startHeight = rowHeight;

        onDragStateChange(true); // Lock ATM logic/reordering

        const handlePointerMove = (moveEvent) => {
            const delta = moveEvent.pageY - startY;
            const newHeight = Math.min(700, Math.max(300, startHeight + delta));
            onUpdateHeight(newHeight);
        };

        const handlePointerUp = () => {
            onDragStateChange(false);
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            document.body.style.cursor = 'default';
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        document.body.style.cursor = 'row-resize';
    };

    // Derived All Strikes
    const allStrikes = useMemo(() => {
        let searchIndex = token.index === 'SENSEX' ? 'BSX' : token.index;
        const filtered = contractsData.filter(c =>
            c.s === searchIndex &&
            c.e === token.expiry
        );
        const strikes = [...new Set(filtered.map(c => Number(c.st)))];
        return strikes.sort((a, b) => a - b);
    }, [token.index, token.expiry, token.strike]); // Added token.strike to dependecy if needed, though mostly index/expiry matters

    const [isEditingStrike, setIsEditingStrike] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const dropdownRef = useRef(null);
    const inputRef = useRef(null);
    const containerRef = useRef(null); // Ref for click-outside detection

    // Handle Click Outside & Escape
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsEditingStrike(false);
            }
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setIsEditingStrike(false);
            }
        };

        if (isEditingStrike) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isEditingStrike]);

    useEffect(() => {
        if (isEditingStrike) {
            setSearchTerm(""); // Reset search
            // Tiny delay ensures DOM elements are rendered before we scroll/focus
            setTimeout(() => {
                if (inputRef.current) inputRef.current.focus();

                if (dropdownRef.current) {
                    const activeBtn = dropdownRef.current.querySelector('[data-active="true"]');
                    if (activeBtn) {
                        activeBtn.scrollIntoView({ block: 'center', behavior: 'instant' });
                    }
                }
            }, 50);
        }
    }, [isEditingStrike]);

    return (
        <Reorder.Item
            value={token}
            dragListener={false}
            dragControls={controls}
            onDragStart={() => onDragStateChange(true)}
            onDragEnd={() => onDragStateChange(false)}
            whileDrag={{ scale: 1.01, zIndex: 50 }}
            style={{ height: `${rowHeight}px` }}
            className={cn(
                "w-full shrink-0 flex flex-col bg-[#0f1115] border rounded-lg shadow-xl transition-[border-color,box-shadow,height] duration-500 relative",
                isAtm ? "border-yellow-400/50 shadow-[0_0_15px_rgba(250,204,21,0.15)] z-10" : "border-white/10"
            )}
        >
            {/* Resize Handle */}
            <div
                className="absolute bottom-0 left-0 w-full h-1.5 cursor-row-resize hover:bg-blue-500/20 z-50 transition-colors"
                onPointerDown={handleResizeStart}
            />
            {/* Row Header */}
            <div className="p-2 border-b border-white/10 space-y-2 bg-[#15171c]">
                <div className="flex items-center justify-between">
                    <div
                        className="flex items-center gap-2 cursor-grab active:cursor-grabbing hover:text-white/80 transition-colors"
                        onPointerDown={(e) => controls.start(e)}
                    >
                        <GripVertical size={14} className="text-white/20" />
                        <span className="text-[10px] font-bold text-white/50 select-none">{token.index} {token.expiry.split('T')[0]}</span>
                    </div>
                    <button onClick={onRemove} className="text-white/20 hover:text-red-400 transition-colors">
                        <X size={12} />
                    </button>
                </div>

                {/* Controls Row */}
                <div className="flex items-center justify-between h-7 px-1">
                    {/* Strike */}
                    <div className="relative flex items-center h-full" ref={containerRef}>
                        {/* Ghost/Shadow Strike Text */}
                        <div className={cn(
                            "absolute left-0 top-1/2 -translate-y-1/2 text-5xl font-black tracking-tighter opacity-[0.05] select-none pointer-events-none transition-colors",
                            token.type === 'CE' ? "text-cyan-500" : "text-purple-500"
                        )}>
                            {token.strike}
                        </div>

                        <button
                            onClick={() => setIsEditingStrike(!isEditingStrike)}
                            className={cn(
                                "relative z-10 bg-transparent border-none p-0 flex items-center gap-0.5 transition-colors",
                                token.type === 'CE' ? "text-cyan-400 hover:text-cyan-300" : "text-purple-400 hover:text-purple-300"
                            )}
                        >
                            <span className="text-xl font-black tracking-tight leading-none">{token.strike}</span>
                            <ChevronDown size={14} className="opacity-40 flex-shrink-0" />
                        </button>

                        {isEditingStrike && (
                            <div
                                ref={dropdownRef}
                                className="absolute top-full left-0 mt-1 bg-[#1a1c21] border border-white/10 rounded shadow-xl z-50 max-h-64 overflow-y-auto min-w-[140px]"
                            >
                                <div className="sticky top-0 bg-[#1a1c21] p-1.5 border-b border-white/10 z-10">
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        placeholder="Search..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-blue-500 placeholder-white/20"
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                </div>
                                {allStrikes.filter(s => s.toString().includes(searchTerm)).map(s => (
                                    <button
                                        key={s}
                                        data-active={s.toString() === token.strike}
                                        onClick={() => {
                                            onUpdateStrike(s.toString());
                                            setIsEditingStrike(false);
                                        }}
                                        className={cn(
                                            "w-full text-left px-2 py-1.5 text-xs hover:bg-white/5 flex items-center justify-between",
                                            s.toString() === token.strike ? "text-yellow-400 font-bold bg-white/5" : "text-white/60"
                                        )}
                                    >
                                        {s}
                                        {s.toString() === token.strike && <Check size={10} />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Controls Group */}
                    <div className="flex items-center gap-1 h-full">
                        <button
                            onClick={() => onUpdateType(token.type === 'CE' ? 'PE' : 'CE')}
                            className={cn("px-1.5 py-0.5 rounded text-[11px] font-bold border transition-colors hover:brightness-110 flex-shrink-0 h-full flex items-center",
                                token.type === 'CE' ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" : "bg-purple-500/10 text-purple-400 border-purple-500/20")}
                        >
                            {token.type}
                        </button>

                        <div className="flex items-center gap-1 bg-white/5 px-1.5 py-0.5 rounded border border-white/5 flex-shrink-0 h-full">
                            <span className="text-[10px] text-white/30 uppercase font-bold">Q</span>
                            <input
                                type="number"
                                value={token.quantity}
                                onChange={(e) => onUpdateQty(e.target.value)}
                                style={{ width: `${Math.max(1, token.quantity.toString().length) + 2}ch` }}
                                className="bg-transparent border-none text-[11px] font-bold text-yellow-500 min-w-[20px] max-w-[48px] focus:outline-none text-right [&::-webkit-inner-spin-button]:appearance-none"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Split Charts (Buy | Sell) */}
            <div className="flex-1 min-h-0 flex divide-x divide-white/10">
                {/* Buy Chart */}
                <div className="flex-1 flex flex-col min-w-0 group/buy">
                    <div className="p-1 border-b border-white/5 flex items-center justify-center gap-2 relative">
                        <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider opacity-80">Buy</span>
                    </div>
                    <div className="flex-1 min-h-0">
                        <CandleChart key={token.tkn} token={token} side="buy" depthEvents={depthEvents} depthDataRef={depthDataRef} />
                    </div>
                </div>

                {/* Sell Chart */}
                <div className="flex-1 flex flex-col min-w-0 group/sell">
                    <div className="p-1 border-b border-white/5 flex items-center justify-center gap-2 relative">
                        <span className="text-[9px] font-bold text-red-500 uppercase tracking-wider opacity-80">Sell</span>
                    </div>
                    <div className="flex-1 min-h-0">
                        <CandleChart key={token.tkn} token={token} side="sell" depthEvents={depthEvents} depthDataRef={depthDataRef} />
                    </div>
                </div>
            </div>
        </Reorder.Item>

    );
};

const VerticalLayout = ({
    monitoredTokens,
    logs,
    onAddTokens,
    onRemoveToken,
    onUpdateTokenQty,
    onUpdateTokenStrike,
    onUpdateTokenType,
    onUpdateTokenHeight,
    onClearTokens,
    visibleElements,

    onReorderTokens,
    isSidebarVisible,
    depthDataRef,
    depthEvents,
}) => {
    // --- Top Bar State (Unchanged) ---
    const [globalIndex, setGlobalIndex] = useState('NIFTY');
    const [globalExpiry, setGlobalExpiry] = useState('');
    const [atmStrikes, setAtmStrikes] = useState({});
    const isDraggingRef = useRef(false);

    // Throttle for activity sorting
    const lastActivitySortRef = useRef(0);

    // --- Spot Price & ATM Logic (Multi-Index) ---
    // All known indices and their spot tokens/steps
    const INDEX_SPOT_MAP = useMemo(() => ({
        NIFTY: { tokenId: '26000', step: 50 },
        BANKNIFTY: { tokenId: '26009', step: 100 },
        SENSEX: { tokenId: '1', step: 100 },
    }), []);

    useEffect(() => {
        if (!depthDataRef) return;

        const interval = setInterval(() => {
            // Prevent auto-reorder while user is manually dragging
            if (isDraggingRef.current) return;

            const depthData = depthDataRef.current;
            if (!depthData || Object.keys(depthData).length === 0) return;

            const newAtmStrikes = { ...atmStrikes };
            let changed = false;
            let allAtmTokenIds = new Set();

            Object.entries(INDEX_SPOT_MAP).forEach(([indexName, { tokenId, step }]) => {
                const spotPacket = depthData[tokenId];
                if (!spotPacket) return;

                const spotPrice = parseFloat(spotPacket.Price || spotPacket.iv || spotPacket.ltp || spotPacket.LastTradedPrice || 0);
                if (!spotPrice) return;

                const calculatedAtm = Math.round(spotPrice / step) * step;

                if (newAtmStrikes[indexName] !== calculatedAtm) {
                    newAtmStrikes[indexName] = calculatedAtm;
                    changed = true;
                    if (indexName === 'SENSEX') console.log(`[ATM] SENSEX ATM Updated: Spot=${spotPrice}, ATM=${calculatedAtm}`);
                }

                monitoredTokens.forEach(t => {
                    if (t.index === indexName && parseFloat(t.strike) === calculatedAtm) {
                        allAtmTokenIds.add(t.id);
                    }
                });
            });

            if (changed) setAtmStrikes(newAtmStrikes);

            let expectedOrder = [...monitoredTokens];

            if (monitoredTokens.length > 0) {
                const recentCounts = {};
                const totalCounts = {};
                const now = Date.now();

                monitoredTokens.forEach(t => {
                    recentCounts[t.id] = 0;
                    totalCounts[t.id] = 0;
                });

                logs.forEach(log => {
                    const tId = log.tokenId || log.tkn;
                    if (totalCounts[tId] !== undefined) {
                        totalCounts[tId]++;
                        if (now - (log.timestamp || 0) <= 60000) {
                            recentCounts[tId]++;
                        }
                    }
                });

                const atmTokens = monitoredTokens.filter(t => allAtmTokenIds.has(t.id));
                const nonAtmTokens = monitoredTokens.filter(t => !allAtmTokenIds.has(t.id));

                if (now - lastActivitySortRef.current > 5000) {
                    nonAtmTokens.sort((a, b) => {
                        const recentDiff = recentCounts[b.id] - recentCounts[a.id];
                        if (recentDiff !== 0) return recentDiff;
                        return totalCounts[b.id] - totalCounts[a.id];
                    });
                    lastActivitySortRef.current = now;
                }

                expectedOrder = [...atmTokens, ...nonAtmTokens];

                const isSameOrder = expectedOrder.every((t, i) => t.id === monitoredTokens[i]?.id);
                if (!isSameOrder) {
                    onReorderTokens(expectedOrder);
                }
            }
        }, 2000); // Poll every 2s — ATM detection doesn't need 50ms reactivity

        return () => clearInterval(interval);
    }, [depthDataRef, INDEX_SPOT_MAP, monitoredTokens, onReorderTokens, atmStrikes, logs]);


    const availableExpiries = useMemo(() => {
        let searchIndex = globalIndex === 'SENSEX' ? 'BSX' : globalIndex;
        const filtered = contractsData.filter(c => c.s === searchIndex);
        const expiries = [...new Set(filtered.map(c => c.e))].sort();
        return expiries;
    }, [globalIndex]);

    useEffect(() => {
        if (availableExpiries.length > 0 && !availableExpiries.includes(globalExpiry)) {
            const today = new Date().toISOString().split('T')[0];
            setGlobalExpiry(availableExpiries.find(e => e >= today) || availableExpiries[0]);
        }
    }, [availableExpiries, globalExpiry]);


    const handleQuickStrikes = () => {
        const indexInfo = INDEX_SPOT_MAP[globalIndex];
        if (!indexInfo) return;

        const { tokenId, step } = indexInfo;
        const spotPacket = depthDataRef?.current?.[tokenId];
        if (!spotPacket) {
            alert('Spot price not available yet. Wait for market data to load.');
            return;
        }

        const spotPrice = parseFloat(spotPacket.Price || spotPacket.iv || spotPacket.ltp || spotPacket.LastTradedPrice || 0);
        if (!spotPrice) {
            alert('Could not determine spot price.');
            return;
        }

        const atm = Math.round(spotPrice / step) * step;
        let searchIndex = globalIndex === 'SENSEX' ? 'BSX' : globalIndex;

        const ceStrikes = [];
        const peStrikes = [];
        for (let i = 3; i >= 1; i--) ceStrikes.push(atm - i * step);
        ceStrikes.push(atm);
        for (let i = 1; i <= 3; i++) ceStrikes.push(atm + i * step);
        for (let i = 3; i >= 1; i--) peStrikes.push(atm + i * step);
        peStrikes.push(atm);
        for (let i = 1; i <= 3; i++) peStrikes.push(atm - i * step);

        const newTokens = [];
        const addStrike = (strike, type) => {
            const strikeVal = Number(strike).toFixed(5);
            const match = contractsData.find(c =>
                c.s === searchIndex &&
                Number(c.st).toFixed(5) === strikeVal &&
                c.p === type &&
                c.e === globalExpiry
            );
            if (match) {
                const alreadyExists = monitoredTokens.some(m => m.tkn === match.t && m.type === type);
                if (!alreadyExists) {
                    newTokens.push({
                        id: `${match.t}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                        tkn: match.t,
                        symbol: `${globalIndex} ${strike} ${type}`,
                        strike: strike.toString(),
                        type: type,
                        side: 'both',
                        quantity: 25000,
                        expiry: globalExpiry,
                        index: globalIndex
                    });
                }
            }
        };

        ceStrikes.forEach(s => addStrike(s, 'CE'));
        peStrikes.forEach(s => addStrike(s, 'PE'));

        if (newTokens.length > 0) onAddTokens(newTokens);
    };

    const handleAddColumn = () => {
        let defaultStrike = '24000';
        if (globalIndex === 'BANKNIFTY') defaultStrike = '50000';
        if (globalIndex === 'SENSEX') defaultStrike = '80000';

        let searchIndex = globalIndex === 'SENSEX' ? 'BSX' : globalIndex;
        const validContract = contractsData.find(c =>
            c.s === searchIndex &&
            c.e === globalExpiry &&
            c.p === 'CE'
        );

        if (validContract) {
            const strike = typeof validContract.st === 'string' ? validContract.st : validContract.st.toString();
            const tokenObj = {
                id: `${validContract.t}_${Date.now()}`,
                tkn: validContract.t,
                symbol: validContract.ns,
                strike: parseFloat(strike).toString(),
                type: 'CE',
                side: 'both',
                quantity: 5000,
                expiry: globalExpiry,
                index: globalIndex
            };
            onAddTokens([tokenObj]);
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-[#050505]">
            {/* Top Bar */}
            {visibleElements?.config && (
                <div className={cn("flex items-center gap-4 p-2 border-b border-white/10 bg-[#0a0a0e] transition-all",
                    !isSidebarVisible && "pl-12" // Add padding when sidebar is closed to avoid overlap with toggle button
                )}>
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] text-white/40 uppercase font-bold">Index</label>
                        <select
                            value={globalIndex}
                            onChange={(e) => setGlobalIndex(e.target.value)}
                            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                        >
                            <option className="bg-[#0a0a0e] text-white" value="NIFTY">NIFTY</option>
                            <option className="bg-[#0a0a0e] text-white" value="BANKNIFTY">BANKNIFTY</option>
                            <option className="bg-[#0a0a0e] text-white" value="FINNIFTY">FINNIFTY</option>
                            <option className="bg-[#0a0a0e] text-white" value="SENSEX">SENSEX</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-[10px] text-white/40 uppercase font-bold">Expiry</label>
                        <select
                            value={globalExpiry}
                            onChange={(e) => setGlobalExpiry(e.target.value)}
                            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                        >
                            {availableExpiries.map(e => <option className="bg-[#0a0a0e] text-white" key={e} value={e}>{e.split('T')[0]}</option>)}
                        </select>
                    </div>

                    <button
                        onClick={handleQuickStrikes}
                        className="ml-auto bg-amber-600 hover:bg-amber-500 text-white px-3 py-1 rounded text-xs font-bold flex items-center gap-1 transition-colors"
                        title="Add 1 ATM + 3 ITM + 3 OTM (CE & PE)"
                    >
                        <Zap size={14} /> Quick Strikes
                    </button>
                    <button
                        onClick={handleAddColumn}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-xs font-bold flex items-center gap-1 transition-colors"
                    >
                        <Plus size={14} /> Add Strike
                    </button>

                    <button onClick={onClearTokens} className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 font-bold py-1 px-3 rounded text-[10px] h-7 flex items-center gap-2">
                        <Trash2 size={10} /> Clear
                    </button>

                </div>
            )}

            {/* Main Content with Reorder.Group */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 relative">
                <Reorder.Group
                    axis="y"
                    values={monitoredTokens}
                    onReorder={onReorderTokens}
                    className="flex flex-col gap-4 pb-4 w-full"
                >
                    {monitoredTokens.map(token => {
                        const isAtm = atmStrikes[token.index] !== undefined && parseFloat(token.strike) === atmStrikes[token.index];
                        return (
                            <DraggableRow
                                key={token.id}
                                token={token}
                                isAtm={isAtm}
                                depthEvents={depthEvents}
                                depthDataRef={depthDataRef}
                                onDragStateChange={(val) => (isDraggingRef.current = val)}
                                onRemove={() => onRemoveToken(token.id)}
                                onUpdateQty={(q) => onUpdateTokenQty(token.id, q)}
                                onUpdateStrike={(s) => {
                                    let searchIndex = token.index === 'SENSEX' ? 'BSX' : token.index;
                                    const strikeVal = Number(s).toFixed(5);
                                    const contract = contractsData.find(c =>
                                        c.s === searchIndex &&
                                        c.p === token.type &&
                                        c.e === token.expiry &&
                                        Number(c.st).toFixed(5) === strikeVal
                                    );
                                    if (contract) {
                                        onUpdateTokenStrike(token.id, s, contract.t, contract.ns);
                                    }
                                }}
                                onUpdateType={(newType) => {
                                    let searchIndex = token.index === 'SENSEX' ? 'BSX' : token.index;
                                    const strikeVal = Number(token.strike).toFixed(5);
                                    const contract = contractsData.find(c =>
                                        c.s === searchIndex &&
                                        c.p === newType &&
                                        c.e === token.expiry &&
                                        Number(c.st).toFixed(5) === strikeVal
                                    );
                                    if (contract) {
                                        onUpdateTokenType(token.id, newType, contract.t, contract.ns);
                                    }
                                }}
                                onUpdateHeight={(h) => onUpdateTokenHeight(token.id, h)}
                            />
                        );
                    })}

                    {monitoredTokens.length === 0 && (
                        <div className="flex items-center justify-center w-full h-40 border border-dashed border-white/10 rounded text-white/20 text-sm">
                            Add a strike to start
                        </div>
                    )}
                </Reorder.Group>
            </div>
        </div>
    );
};

export default VerticalLayout;
