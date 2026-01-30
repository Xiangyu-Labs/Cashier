"use client";


import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    fetchLedger,
    updateLedger,
    fetchEntryCategories,
    createEntryCategory,
    updateEntryCategory,
    deleteEntryCategory,
    fetchServiceCredentials,
    createServiceCredential,
    deleteServiceCredential
} from "@/lib/api";
import { useLedgerEvents } from "@/lib/events/use-ledger-events";
import { CurrencySection } from "./components/CurrencySection";
import { CategorySection } from "./components/CategorySection";
import { ServiceCredentialSection } from "./components/ServiceCredentialSection";
import { ProcessingSystemSection } from "./components/ProcessingSystemSection";
import { EntryCategory, Ledger } from "@/types/api";
import { Switch } from "@/components/ui/switch";

import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useTranslations, useLocale } from 'next-intl';
import { usePathname, useRouter } from "@/i18n/routing";

export default function LedgerSettingsPage() {
    const params = useParams();
    const router = useRouter();
    const pathname = usePathname();
    const locale = useLocale();
    const t = useTranslations('Settings');
    const ledgerId = params.id as string;
    const queryClient = useQueryClient();

    // Enable real-time updates
    useLedgerEvents(ledgerId);

    // Ledger Query
    const { data: ledger, isLoading: isLedgerLoading } = useQuery({
        queryKey: ["ledger", ledgerId],
        queryFn: () => fetchLedger(ledgerId),
    });

    // Categories Query
    const { data: categories, isLoading: isCategoriesLoading } = useQuery({
        queryKey: ["entryCategories", ledgerId],
        queryFn: () => fetchEntryCategories(ledgerId),
    });

    // Mutations
    const updateLedgerMutation = useMutation({
        mutationFn: (data: Partial<Ledger>) => updateLedger(ledgerId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["ledger", ledgerId] });
        },
    });

    const createCategoryMutation = useMutation({
        mutationFn: (data: { name: string }) => createEntryCategory(ledgerId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["entryCategories", ledgerId] });
        },
    });

    const updateCategoryMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<EntryCategory> }) =>
            updateEntryCategory(ledgerId, id, {
                ...data,
                description: data.description ?? undefined,
                icon: data.icon ?? undefined,
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["entryCategories", ledgerId] });
        },
    });

    const deleteCategoryMutation = useMutation({
        mutationFn: (id: string) => deleteEntryCategory(ledgerId, id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["entryCategories", ledgerId] });
        },
    });

    // Service Credentials Query
    const { data: credentials } = useQuery({
        queryKey: ["serviceCredentials", ledgerId],
        queryFn: () => fetchServiceCredentials(ledgerId),
    });

    const createCredentialMutation = useMutation({
        mutationFn: (name: string) => createServiceCredential(ledgerId, name),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["serviceCredentials", ledgerId] });
        },
    });

    const deleteCredentialMutation = useMutation({
        mutationFn: (id: string) => deleteServiceCredential(ledgerId, id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["serviceCredentials", ledgerId] });
        },
    });

    if (isLedgerLoading || isCategoriesLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
            </div>
        );
    }

    if (!ledger) return <div>Ledger not found</div>;

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-8 space-y-6 sm:space-y-8">
            <div className="flex items-center gap-4 mb-6">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <h1 className="text-xl sm:text-2xl font-semibold truncate">{t('title')} - {ledger.name}</h1>
            </div>

            {/* Appearance Settings */}
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-4 sm:p-6">
                <h2 className="text-lg font-medium mb-6">{t('appearance')}</h2>
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-medium">{t('language')}</h3>
                            <p className="text-sm text-[var(--muted)]">设置当前账本使用的 UI 语言和 AI 识别语言</p>
                        </div>
                        <select
                            value={ledger.language || 'zh'}
                            onChange={(e) => {
                                const newLang = e.target.value;
                                updateLedgerMutation.mutate({ language: newLang });
                                if (newLang !== locale) {
                                    // Redirect to the new locale
                                    router.push(pathname, { locale: newLang });
                                    router.refresh();
                                }
                            }}
                            className="bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                        >
                            <option value="zh">简体中文</option>
                            <option value="en">English</option>
                        </select>
                    </div>

                    <div className="h-px bg-[var(--border)]" />

                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-medium">{t('collapsePending')}</h3>
                            <p className="text-sm text-[var(--muted)]">{t('collapsePendingDesc')}</p>
                        </div>
                        <Switch
                            checked={ledger.collapsePendingDefault || false}
                            onCheckedChange={(checked: boolean) => {
                                updateLedgerMutation.mutate({ collapsePendingDefault: checked });
                            }}
                        />
                    </div>
                </div>
            </section>

            {/* AI Settings */}
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-4 sm:p-6">
                <h2 className="text-lg font-medium mb-6">{t('assistant')}</h2>
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-medium">{t('autoRecognizeDate')}</h3>
                            <p className="text-sm text-[var(--muted)]">{t('autoRecognizeDateDesc')}</p>
                        </div>
                        <Switch
                            checked={ledger.autoRecognizeDate || false}
                            onCheckedChange={(checked: boolean) => {
                                updateLedgerMutation.mutate({ autoRecognizeDate: checked });
                            }}
                        />
                    </div>

                    <div className="h-px bg-[var(--border)]" />

                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-medium">{t('mergeSimilar')}</h3>
                            <p className="text-sm text-[var(--muted)]">{t('mergeSimilarDesc')}</p>
                        </div>
                        <Switch
                            checked={ledger.mergeSimilarItems || false}
                            onCheckedChange={(checked: boolean) => {
                                updateLedgerMutation.mutate({ mergeSimilarItems: checked });
                            }}
                        />
                    </div>

                    <div className="h-px bg-[var(--border)]" />

                    <div className="space-y-4">
                        <div>
                            <h3 className="text-base font-medium">{t('aiPrompt')}</h3>
                            <p className="text-sm text-[var(--muted)]">{t('aiPromptDesc')}</p>
                        </div>
                        <textarea
                            value={ledger.aiCustomPrompt || ""}
                            onChange={(_e) => {
                                // Handled onBlur for performance
                            }}
                            onBlur={(e) => {
                                if (e.target.value !== (ledger.aiCustomPrompt || "")) {
                                    updateLedgerMutation.mutate({ aiCustomPrompt: e.target.value });
                                }
                            }}
                            placeholder={t('aiPromptPlaceholder')}
                            className="w-full min-h-[100px] bg-[var(--background)] border border-[var(--border)] rounded-[var(--radius-md)] p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-none"
                        />
                    </div>
                </div>
            </section>


            {/* Data Configuration */}
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-4 sm:p-6">
                <h2 className="text-lg font-medium mb-6">{t('dataConfig')}</h2>

                <div className="space-y-8">
                    {/* Currency Settings */}
                    <CurrencySection
                        // Adapt CurrencySection to accept ledger structure which is compatible with Settings for these fields
                        settings={ledger as unknown as Ledger}
                        onUpdateSettings={(data) => updateLedgerMutation.mutate(data)}
                    />

                    <div className="h-px bg-[var(--border)]" />

                    {/* Category Settings */}
                    {categories && (
                        <CategorySection
                            categories={categories}
                            onCreateCategory={(name) => createCategoryMutation.mutate({ name })}
                            onUpdateCategory={(id, data) => updateCategoryMutation.mutate({ id, data })}
                            onDeleteCategory={(id) => deleteCategoryMutation.mutate(id)}
                        />
                    )}
                </div>
            </section>

            {/* Processing System Stats & Tasks */}
            <ProcessingSystemSection ledgerId={ledgerId} />

            {/* Service Credentials Settings */}
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-4 sm:p-6">
                <ServiceCredentialSection
                    credentials={credentials || []}
                    onCreateCredential={(name) => createCredentialMutation.mutateAsync(name)}
                    onDeleteCredential={(id) => deleteCredentialMutation.mutate(id)}
                />
            </section>
        </div>
    );
}
