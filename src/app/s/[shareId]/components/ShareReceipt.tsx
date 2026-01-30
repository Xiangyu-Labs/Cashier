"use client";

import { ShareData } from "@/lib/api";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { format } from "date-fns";
import Image from "next/image";
import { useConvertedAmount } from "@/hooks/useConvertedAmount";
import { Check, ShoppingBag, Utensils, Plane, Car, Film, Coffee, Music, Home, Gift } from "lucide-react";

interface ShareReceiptProps {
    data: ShareData;
}

function getIcon(iconName: string | null) {
    switch (iconName) {
        case "utensils": return <Utensils className="w-4 h-4" />;
        case "coffee": return <Coffee className="w-4 h-4" />;
        case "car": return <Car className="w-4 h-4" />;
        case "bus": return <Car className="w-4 h-4" />;
        case "cart": return <ShoppingBag className="w-4 h-4" />;
        case "film": return <Film className="w-4 h-4" />;
        case "music": return <Music className="w-4 h-4" />;
        case "home": return <Home className="w-4 h-4" />;
        case "gift": return <Gift className="w-4 h-4" />;
        case "plane": return <Plane className="w-4 h-4" />;
        default: return <ShoppingBag className="w-4 h-4" />;
    }
}

export function ShareReceipt({ data }: ShareReceiptProps) {
    const t = useTranslations("SharePage");
    const { sourceDocument, entries } = data;

    // Calculate total
    const total = entries.reduce((acc, entry) => acc + parseFloat(entry.amount), 0);
    const currency = entries[0]?.currency || "CNY";

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-sm mx-auto perspective-1000"
        >
            <div className="relative bg-white text-neutral-800 shadow-2xl overflow-hidden rounded-t-sm">
                {/* Receipt Zigzag Top (CSS mask would be better but simple border radius works for now, let's try a CSS trick) */}
                <div className="absolute top-0 left-0 right-0 h-4 bg-white"
                    style={{
                        background: "linear-gradient(135deg, transparent 50%, white 50%), linear-gradient(-135deg, transparent 50%, white 50%)",
                        backgroundSize: "20px 20px",
                        backgroundRepeat: "repeat-x",
                        backgroundPosition: "0 -10px"
                    }}
                />

                <div className="pt-8 pb-6 px-6 text-center border-b-2 border-dashed border-neutral-300">
                    <div className="w-12 h-12 bg-neutral-900 text-white rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="font-bold text-xl">C</span>
                    </div>
                    <h1 className="text-xl font-bold font-mono uppercase tracking-wider mb-1">{sourceDocument.title || t("receipt")}</h1>
                    <p className="text-sm text-neutral-500 font-mono">
                        {format(new Date(sourceDocument.createdAt), "yyyy-MM-dd HH:mm")}
                    </p>
                </div>

                {/* Items List */}
                <div className="py-6 px-6 space-y-4">
                    <div className="flex justify-between items-end border-b-2 border-neutral-800 pb-2 mb-4">
                        <h3 className="font-bold uppercase text-xs tracking-widest text-neutral-500">{t("details")}</h3>
                        <span className="text-xs font-mono text-neutral-400">{t("items", { count: entries.length })}</span>
                    </div>

                    <div className="space-y-3">
                        {entries.map((entry) => (
                            <div key={entry.id} className="flex justify-between items-start group">
                                <div className="flex gap-3">
                                    <div className="mt-0.5 text-neutral-400 p-1 bg-neutral-100 rounded-full group-hover:bg-neutral-200 transition-colors">
                                        {getIcon(entry.category?.icon || null)}
                                    </div>
                                    <div>
                                        <div className="font-bold text-sm">{entry.itemName}</div>
                                        <div className="text-xs text-neutral-400 font-mono flex items-center gap-1">
                                            {entry.category?.name}
                                            {entry.description && <span className="text-neutral-300">•</span>}
                                            {entry.description}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right font-mono font-medium">
                                    {parseFloat(entry.amount).toFixed(2)}
                                    <span className="text-xs text-neutral-400 ml-1">{entry.currency}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Total Section */}
                <div className="bg-neutral-900 text-white p-6 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-[url('/noise.png')] opacity-10"></div>
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-neutral-400 uppercase text-xs tracking-widest">{t("total")}</span>
                        <span className="font-mono text-2xl font-bold tracking-tighter">
                            {currency} {total.toFixed(2)}
                        </span>
                    </div>
                    <div className="w-full h-px bg-neutral-700 my-4"></div>
                    <div className="flex justify-center items-center gap-2 text-neutral-500 text-xs uppercase tracking-widest">
                        <Check className="w-3 h-3" />
                        {t("poweredBy")}
                    </div>
                </div>

                {/* Receipt Zigzag Bottom - using Pseudo-elements logic via CSS class if possible, or SVG */}
                <div className="h-4 bg-neutral-100 flex" style={{
                    backgroundImage: "radial-gradient(circle, transparent 50%, white 50%)",
                    backgroundSize: "20px 20px",
                    backgroundPosition: "0 -10px"
                }}>
                    {/* Using a rough approximation for the ripped paper look */}
                    <svg className="w-full h-4 text-white fill-current transform rotate-180" preserveAspectRatio="none" viewBox="0 0 1200 120" xmlns="http://www.w3.org/2000/svg">
                        <path d="M0 0v46.29c47.79 22.2 103.59 32.17 158 28 70.36-5.37 136.33-33.31 206.8-37.5 73.84-4.36 147.54 16.88 218.2 35.26 69.27 18 138.3 24.88 209.4 13.08 36.15-6 69.85-17.84 104.45-29.34C989.49 25 1113-14.29 1200 52.47V0z" opacity=".25" />
                        <path d="M0 0v15.81c13 21.11 27.64 41.05 47.69 56.24C99.41 111.27 165 111 224.58 91.58c31.15-10.15 60.09-26.07 89.67-39.8 40.92-19 84.73-46 130.83-49.67 36.26-2.85 70.9 9.42 98.6 31.56 31.77 25.39 62.32 62 103.63 73 40.44 10.79 81.35-6.69 119.13-24.28s75.16-39 116.92-43.05c59.73-5.85 113.28 22.88 168.9 44.56V0z" opacity=".5" />
                        <path d="M0 0v5.63C149.93 59 314.09 71.32 475.83 42.57c43-7.64 84.23-20.12 127.61-26.46 59-8.63 112.48 12.24 165.56 35.4C827.93 77.22 886 95.24 951.2 90c86.53-7 172.46-45.71 248.8-84.81V0z" />
                    </svg>
                </div>
            </div>

            {/* Paper Shadow */}
            <div className="mx-2 h-4 bg-black/20 blur-xl rounded-full mt-[-10px]"></div>

        </motion.div>
    );
}
