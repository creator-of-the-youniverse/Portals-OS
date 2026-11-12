import React from 'react';
import { motion } from 'framer-motion';
import { Check, Crown, X } from 'lucide-react';
import { useKernel } from '../store/kernel';

const PaidTierApp: React.FC = () => {
    const serverEntitlements = useKernel((state) => state.serverEntitlements);
    const hasLifetimeGenesis = Boolean(serverEntitlements?.hasLifetimeGenesisAccess);

    return (
        <div className="flex-1 w-full h-full bg-[#020617] text-white flex flex-col font-sans overflow-y-auto">
            {/* Content */}
            <div className="flex-1 p-4 md:p-8 flex flex-col items-center justify-center gap-6">
                {hasLifetimeGenesis && (
                    <div className="w-full rounded-2xl border border-amber-300/35 bg-linear-to-r from-amber-400/12 via-[#0c101b] to-emerald-400/10 px-5 py-4 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/15 border border-amber-300/35 text-amber-300">
                                <Crown className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-xs font-mono font-bold tracking-[0.2em] uppercase text-amber-300">
                                    GENESIS 001 · FIRST PERSON OF THE YOUNIVERSE
                                </p>
                                <p className="text-sm font-semibold text-white">
                                    Lifetime first-party Portals OS entitlement is permanently active on this Youniverse.
                                </p>
                            </div>
                        </div>
                        <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-xs font-mono uppercase tracking-wider">
                            Lifetime Unlocked
                        </span>
                    </div>
                )}
                <div className="w-full mx-auto grid grid-cols-5 gap-4 lg:gap-6">

                    {/* FREE */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="h-full">
                        <div className="h-full bg-[#0B0F19] border border-white/5 rounded-2xl p-6 flex flex-col">
                            <h2 className="text-xl font-bold text-gray-400 uppercase tracking-widest mb-1">FREE</h2>
                            <div className="text-4xl font-bold text-white mb-2">$0</div>
                            <p className="text-sm text-gray-500 mb-8 font-medium">Try any single node</p>

                            <ul className="space-y-4 flex-1 mb-8">
                                <li className="flex items-start gap-3 text-sm text-gray-300">
                                    <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                                    <span>Any single node</span>
                                </li>
                                <li className="flex items-start gap-3 text-sm text-gray-300">
                                    <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                                    <span>Get your artifact</span>
                                </li>
                                <li className="flex items-start gap-3 text-sm text-gray-300">
                                    <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                                    <span>Walk away</span>
                                </li>
                                <li className="flex items-start gap-3 text-sm text-gray-500">
                                    <X className="w-4 h-4 text-gray-600 mt-0.5 shrink-0" />
                                    <span>Memory</span>
                                </li>
                                <li className="flex items-start gap-3 text-sm text-gray-500">
                                    <X className="w-4 h-4 text-gray-600 mt-0.5 shrink-0" />
                                    <span>NotNotes</span>
                                </li>
                                <li className="flex items-start gap-3 text-sm text-gray-500">
                                    <X className="w-4 h-4 text-gray-600 mt-0.5 shrink-0" />
                                    <span>Oracle</span>
                                </li>
                            </ul>

                            <button className="w-full py-3 rounded-lg border border-white/10 hover:bg-white/5 text-gray-300 font-bold tracking-widest text-xs uppercase transition-colors shrink-0">
                                START FREE
                            </button>
                        </div>
                    </motion.div>

                    {/* NODE */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="h-full">
                        <div className="h-full bg-[#0B0F19] border border-white/5 rounded-2xl p-6 flex flex-col">
                            <h2 className="text-xl font-bold text-gray-300 uppercase tracking-widest mb-1">NODE</h2>
                            <div className="text-4xl font-bold text-white mb-1">
                                $19<span className="text-lg text-gray-500 font-normal">/mo</span>
                            </div>
                            <p className="text-xs text-gray-500 mb-2 font-medium">or $47 lifetime</p>
                            <p className="text-sm text-gray-400 mb-8 font-medium">1 node, supercharged</p>

                            <ul className="space-y-4 flex-1 mb-8">
                                <li className="flex items-start gap-3 text-sm text-gray-300">
                                    <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                                    <span>1 node of your choice</span>
                                </li>
                                <li className="flex items-start gap-3 text-sm text-gray-300">
                                    <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                                    <span>Memory (saves context)</span>
                                </li>
                                <li className="flex items-start gap-3 text-sm text-gray-300">
                                    <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                                    <span>NotNotes integration</span>
                                </li>
                                <li className="flex items-start gap-3 text-sm text-gray-500">
                                    <X className="w-4 h-4 text-gray-600 mt-0.5 shrink-0" />
                                    <span>Oracle</span>
                                </li>
                            </ul>

                            <button className="w-full py-3 rounded-lg border border-white/10 hover:bg-white/5 text-gray-300 font-bold tracking-widest text-xs uppercase transition-colors shrink-0">
                                GET NODE
                            </button>
                        </div>
                    </motion.div>

                    {/* SQUAD - MOST POPULAR */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="h-full relative z-10">
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-400 text-black text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-sm z-20">
                            MOST POPULAR
                        </div>
                        <div className="h-full bg-[#0F131D] border border-yellow-400/50 rounded-2xl p-6 flex flex-col relative shadow-[0_0_30px_rgba(250,204,21,0.15)]">
                            <h2 className="text-xl font-bold text-yellow-400 uppercase tracking-widest mb-1">SQUAD</h2>
                            <div className="text-4xl font-bold text-white mb-1">
                                $97<span className="text-lg text-gray-400 font-normal"> flat</span>
                            </div>
                            <p className="text-sm text-gray-300 mb-8 font-medium">The full squad, unlocked</p>

                            <ul className="space-y-4 flex-1 mb-8">
                                <li className="flex items-start gap-3 text-sm text-gray-200">
                                    <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                                    <span>Every node in the squad</span>
                                </li>
                                <li className="flex items-start gap-3 text-sm text-gray-200">
                                    <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                                    <span>All finished artifacts</span>
                                </li>
                                <li className="flex items-start gap-3 text-sm text-gray-200">
                                    <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                                    <span>Complete idea-to-cash system</span>
                                </li>
                                <li className="flex items-start gap-3 text-sm text-gray-500">
                                    <X className="w-4 h-4 text-gray-600 mt-0.5 shrink-0" />
                                    <span>Memory</span>
                                </li>
                                <li className="flex items-start gap-3 text-sm text-gray-500">
                                    <X className="w-4 h-4 text-gray-600 mt-0.5 shrink-0" />
                                    <span>NotNotes</span>
                                </li>
                                <li className="flex items-start gap-3 text-sm text-gray-500">
                                    <X className="w-4 h-4 text-gray-600 mt-0.5 shrink-0" />
                                    <span>Oracle</span>
                                </li>
                            </ul>

                            <button className="w-full py-3 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-black tracking-widest text-xs uppercase transition-colors shrink-0 shadow-[0_0_15px_rgba(250,204,21,0.4)]">
                                GET THE SQUAD — SOON
                            </button>
                        </div>
                    </motion.div>

                    {/* SQUAD+ */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="h-full">
                        <div className="h-full bg-[#0B0F19] border border-white/5 rounded-2xl p-6 flex flex-col">
                            <h2 className="text-xl font-bold text-gray-300 uppercase tracking-widest mb-1">SQUAD+</h2>
                            <div className="text-4xl font-bold text-white mb-1">
                                $127<span className="text-lg text-gray-500 font-normal">/mo</span>
                            </div>
                            <p className="text-sm text-gray-400 mb-8 font-medium">Squad with full power</p>

                            <ul className="space-y-4 flex-1 mb-8">
                                <li className="flex items-start gap-3 text-sm text-gray-300">
                                    <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                                    <span>Every node in the squad</span>
                                </li>
                                <li className="flex items-start gap-3 text-sm text-gray-300">
                                    <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                                    <span>Memory (persistent context)</span>
                                </li>
                                <li className="flex items-start gap-3 text-sm text-gray-300">
                                    <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                                    <span>NotNotes integration</span>
                                </li>
                                <li className="flex items-start gap-3 text-sm text-gray-500">
                                    <X className="w-4 h-4 text-gray-600 mt-0.5 shrink-0" />
                                    <span>Oracle</span>
                                </li>
                            </ul>

                            <button className="w-full py-3 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 font-bold tracking-widest text-[10px] uppercase transition-colors shrink-0">
                                UPGRADE TO SQUAD+ — SOON
                            </button>
                        </div>
                    </motion.div>

                    {/* PLATOON */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="h-full">
                        <div className="h-full bg-[#0B0F19] border border-white/5 rounded-2xl p-6 flex flex-col">
                            <h2 className="text-xl font-bold text-gray-300 uppercase tracking-widest mb-1">PLATOON</h2>
                            <div className="text-4xl font-bold text-white mb-1">
                                $297<span className="text-lg text-gray-500 font-normal">/mo</span>
                            </div>
                            <p className="text-xs text-gray-500 mb-2 font-medium">or $1,997/yr</p>
                            <p className="text-sm text-gray-400 mb-8 font-medium">All 67 nodes. Everything.</p>

                            <ul className="space-y-4 flex-1 mb-8">
                                <li className="flex items-start gap-3 text-sm text-gray-300">
                                    <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                                    <span>All 67 nodes</span>
                                </li>
                                <li className="flex items-start gap-3 text-sm text-gray-300">
                                    <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                                    <span>BooksOS memory</span>
                                </li>
                                <li className="flex items-start gap-3 text-sm text-gray-300">
                                    <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                                    <span>NotNotes</span>
                                </li>
                                <li className="flex items-start gap-3 text-sm text-gray-300">
                                    <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                                    <span>Oracle AI assistant</span>
                                </li>
                            </ul>

                            <button className="w-full py-3 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 font-bold tracking-widest text-[10px] uppercase transition-colors shrink-0">
                                GO PLATOON — SOON
                            </button>
                        </div>
                    </motion.div>

                </div>
            </div>
        </div>
    );
};

export default PaidTierApp;
