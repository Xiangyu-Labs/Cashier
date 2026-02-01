"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/routing";
import { useMutation } from "@tanstack/react-query";
import {
    updateLedgerAction,
} from "@/features/ledger/server/actions/ledgers";
import {
    createEntryCategoryAction,
    updateEntryCategoryAction,
    deleteEntryCategoryAction,
} from "@/features/ledger/server/actions/categories";
import {
    createServiceCredentialAction,
    deleteServiceCredentialAction,
} from "@/features/ledger/server/actions/credentials";
import { useLedgerEvents } from "@/features/ledger/client/hooks/use-ledger-events";
import { CurrencySection } from "@/app/[locale]/ledger/[id]/settings/components/CurrencySection";
import { CategorySection } from "@/app/[locale]/ledger/[id]/settings/components/CategorySection";
import { ServiceCredentialSection } from "@/app/[locale]/ledger/[id]/settings/components/ServiceCredentialSection";
import { ProcessingSystemSection } from "@/app/[locale]/ledger/[id]/settings/components/ProcessingSystemSection";
import { PushNotificationManager } from "@/features/notifications/components/PushNotificationManager";
import { EntryCategory, Ledger, ServiceCredential } from "@/types/api";
import { Switch } from "@/components/ui/switch";
import { Monitor, Sun, Moon } from "lucide-react";
import { useTranslations, useLocale } from 'next-intl';
import { usePathname } from "@/i18n/routing";
import { useTheme } from "next-themes";
import { UI_LANGUAGES, AI_LANGUAGES } from "@/config/languages";
import { toast } from "sonner";

interface SettingsTabProps {
    ledger: Ledger;
    initialCategories: EntryCategory[];
    initialCredentials: ServiceCredential[];
    ledgerId: string;
}

export function SettingsTab({ ledger, initialCategories, initialCredentials, ledgerId }: SettingsTabProps) {
    const router = useRouter();
    const pathname = usePathname();
    const locale = useLocale();
    const t = useTranslations('Settings');
    const { theme, setTheme } = useTheme();
    const [isPending, startTransition] = useTransition();

    // Categories - Use props directly
    const categories = initialCategories;
    const credentials = initialCredentials;

    // Local state for AI Prompt
    const [localAiPrompt, setLocalAiPrompt] = useState(ledger.aiCustomPrompt || "");
    const [isPromptFocused, setIsPromptFocused] = useState(false);

    // Sync from props only when not focused and not pending
    if (!isPromptFocused && !isPending && localAiPrompt !== (ledger.aiCustomPrompt || "")) {
        setLocalAiPrompt(ledger.aiCustomPrompt || "");
    }

    // Optimistic states
    const [optimisticCollapseProcessing, setOptimisticCollapseProcessing] = useState(ledger.collapseProcessingDefault);
    const [optimisticCollapseBills, setOptimisticCollapseBills] = useState(ledger.collapseBillsDefault);
    const [optimisticAutoRecognizeDate, setOptimisticAutoRecognizeDate] = useState(ledger.autoRecognizeDate);
    const [optimisticMergeSimilar, setOptimisticMergeSimilar] = useState(ledger.mergeSimilarItems);

    function handleUpdateLedger(data: Partial<Ledger>) {
        startTransition(async () => {
            const cleanData = {
                ...data,
                currencies: data.currencies || undefined,
                mainCurrency: data.mainCurrency || undefined,
                autoRecognizeDate: data.autoRecognizeDate === null ? undefined : data.autoRecognizeDate,
                collapseProcessingDefault: data.collapseProcessingDefault === null ? undefined : data.collapseProcessingDefault,
                mergeSimilarItems: data.mergeSimilarItems === null ? undefined : data.mergeSimilarItems,
                collapseBillsDefault: data.collapseBillsDefault === null ? undefined : data.collapseBillsDefault,
                aiCustomPrompt: data.aiCustomPrompt === null ? undefined : data.aiCustomPrompt,
            };
            const result = await updateLedgerAction(ledgerId, cleanData);
            if (result.success) {
                toast.success(t("settingsUpdated"));
                router.refresh();
            } else {
                toast.error(t("updateFailed"));
                setOptimisticCollapseProcessing(ledger.collapseProcessingDefault);
                setOptimisticCollapseBills(ledger.collapseBillsDefault);
                setOptimisticAutoRecognizeDate(ledger.autoRecognizeDate);
                setOptimisticMergeSimilar(ledger.mergeSimilarItems);
            }
        });
    }

    const createCategoryMutation = useMutation({
        mutationFn: async (data: { name: string }) => {
            const result = await createEntryCategoryAction(ledgerId, data);
            if (!result.success) throw new Error(result.error || "Unknown error");
        },
        onSuccess: () => {
            toast.success(t("categoryCreated"));
            router.refresh();
        },
        onError: () => toast.error(t("createCategoryFailed")),
    });

    const updateCategoryMutation = useMutation({
        mutationFn: async ({ id, data }: { id: string; data: Partial<EntryCategory> }) => {
            const result = await updateEntryCategoryAction(ledgerId, id, {
                ...data,
                description: data.description ?? undefined,
                icon: data.icon ?? undefined,
            });
            if (!result.success) throw new Error(result.error || "Unknown error");
        },
        onSuccess: () => {
            toast.success(t("categoryUpdated"));
            router.refresh();
        },
        onError: () => toast.error(t("updateCategoryFailed")),
    });

    const deleteCategoryMutation = useMutation({
        mutationFn: async (id: string) => {
            const result = await deleteEntryCategoryAction(ledgerId, id);
            if (!result.success) throw new Error(result.error || "Unknown error");
        },
        onSuccess: () => {
            toast.success(t("categoryDeleted"));
            router.refresh();
        },
        onError: () => toast.error(t("deleteCategoryFailed")),
    });

    const reorderCategoriesMutation = useMutation({
        mutationFn: async (categoryIds: string[]) => {
            console.warn("Reorder not implemented yet");
        },
    });

    const createCredentialMutation = useMutation({
        mutationFn: async (name: string) => {
            const result = await createServiceCredentialAction(ledgerId, { name });
            if (!result.success || !result.data) throw new Error(result.error || "Failed to create credential");
            return result.data;
        },
        onSuccess: () => {
            toast.success(t("credentialCreated"));
            router.refresh();
        },
        onError: () => toast.error(t("createFailed"))
    });

    const deleteCredentialMutation = useMutation({
        mutationFn: async (id: string) => {
            const result = await deleteServiceCredentialAction(ledgerId, id);
            if (!result.success) throw new Error(result.error || "Unknown error");
        },
        onSuccess: () => {
            toast.success(t("credentialDeleted"));
            router.refresh();
        },
        onError: () => toast.error(t("deleteFailed"))
    });

    return (
        <div className="space-y-6 sm:space-y-8">
            {/* Appearance Settings */}
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-4 sm:p-6">
                <h2 className="text-lg font-medium mb-6">{t('appearance')}</h2>
                <div className="space-y-6">
                    {/* Theme Setting */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-medium">{t('theme')}</h3>
                            <p className="text-sm text-[var(--muted)]">{t('themeDescription')}</p>
                        </div>
                        <div className="flex bg-[var(--background)] border border-[var(--border)] rounded-lg p-1">
                            <button
                                onClick={() => setTheme("system")}
                                className={`p-1.5 rounded-md transition-all ${theme === 'system' ? 'bg-[var(--surface)] shadow-sm text-primary' : 'text-[var(--muted)] hover:text-text'}`}
                                title={t('themeAuto')}
                                disabled={isPending}
                            >
                                <Monitor className="h-4 w-4" />
                            </button>
                            <button
                                onClick={() => setTheme("light")}
                                className={`p-1.5 rounded-md transition-all ${theme === 'light' ? 'bg-[var(--surface)] shadow-sm text-primary' : 'text-[var(--muted)] hover:text-text'}`}
                                title={t('themeLight')}
                                disabled={isPending}
                            >
                                <Sun className="h-4 w-4" />
                            </button>
                            <button
                                onClick={() => setTheme("dark")}
                                className={`p-1.5 rounded-md transition-all ${theme === 'dark' ? 'bg-[var(--surface)] shadow-sm text-primary' : 'text-[var(--muted)] hover:text-text'}`}
                                title={t('themeDark')}
                                disabled={isPending}
                            >
                                <Moon className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    <div className="h-px bg-[var(--border)]" />

                    {/* UI Language Setting */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-medium">{t('uiLanguage')}</h3>
                            <p className="text-sm text-[var(--muted)]">{t('uiLanguageDesc')}</p>
                        </div>
                        <select
                            value={locale}
                            onChange={(e) => {
                                const newLocale = e.target.value;
                                if (newLocale === 'auto') {
                                    document.cookie = `NEXT_LOCALE=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
                                    window.location.reload();
                                    return;
                                }
                                if (newLocale !== locale) {
                                    router.push(pathname as any, { locale: newLocale as any });
                                }
                            }}
                            disabled={isPending}
                            className="bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all disabled:opacity-50"
                        >
                            {UI_LANGUAGES.map(lang => (
                                <option key={lang.value} value={lang.value}>
                                    {lang.value === 'auto' ? t('uiLanguageAuto') : lang.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="h-px bg-[var(--border)]" />

                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-medium">{t('collapseProcessing')}</h3>
                            <p className="text-sm text-[var(--muted)]">{t('collapseProcessingDesc')}</p>
                        </div>
                        <Switch
                            checked={optimisticCollapseProcessing || false}
                            onCheckedChange={(checked: boolean) => {
                                setOptimisticCollapseProcessing(checked);
                                handleUpdateLedger({ collapseProcessingDefault: checked });
                            }}
                            disabled={isPending}
                        />
                    </div>

                    <div className="h-px bg-[var(--border)]" />

                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-medium">{t('collapseBills')}</h3>
                            <p className="text-sm text-[var(--muted)]">{t('collapseBillsDesc')}</p>
                        </div>
                        <Switch
                            checked={optimisticCollapseBills || false}
                            onCheckedChange={(checked: boolean) => {
                                setOptimisticCollapseBills(checked);
                                handleUpdateLedger({ collapseBillsDefault: checked });
                            }}
                            disabled={isPending}
                        />
                    </div>
                </div>
            </section>

            {/* AI Settings */}
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-4 sm:p-6">
                <h2 className="text-lg font-medium mb-6">{t('assistant')}</h2>
                <div className="space-y-6">
                    {/* AI Language Setting */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-medium">{t('aiLanguage')}</h3>
                            <p className="text-sm text-[var(--muted)]">{t('aiLanguageDesc')}</p>
                        </div>
                        <select
                            value={ledger.aiLanguage || 'zh-CN'}
                            onChange={(e) => {
                                handleUpdateLedger({ aiLanguage: e.target.value });
                            }}
                            disabled={isPending}
                            className="bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all max-w-[150px] disabled:opacity-50"
                        >
                            {AI_LANGUAGES.map(lang => (
                                <option key={lang.value} value={lang.value}>{lang.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="h-px bg-[var(--border)]" />
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-medium">{t('autoRecognizeDate')}</h3>
                            <p className="text-sm text-[var(--muted)]">{t('autoRecognizeDateDesc')}</p>
                        </div>
                        <Switch
                            checked={optimisticAutoRecognizeDate || false}
                            onCheckedChange={(checked: boolean) => {
                                setOptimisticAutoRecognizeDate(checked);
                                handleUpdateLedger({ autoRecognizeDate: checked });
                            }}
                            disabled={isPending}
                        />
                    </div>

                    <div className="h-px bg-[var(--border)]" />

                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-medium">{t('mergeSimilar')}</h3>
                            <p className="text-sm text-[var(--muted)]">{t('mergeSimilarDesc')}</p>
                        </div>
                        <Switch
                            checked={optimisticMergeSimilar || false}
                            onCheckedChange={(checked: boolean) => {
                                setOptimisticMergeSimilar(checked);
                                handleUpdateLedger({ mergeSimilarItems: checked });
                            }}
                            disabled={isPending}
                        />
                    </div>

                    <div className="h-px bg-[var(--border)]" />

                    <div className="space-y-4">
                        <div>
                            <h3 className="text-base font-medium">{t('aiPrompt')}</h3>
                            <p className="text-sm text-[var(--muted)]">{t('aiPromptDesc')}</p>
                        </div>
                        <textarea
                            value={localAiPrompt}
                            onChange={(e) => {
                                setLocalAiPrompt(e.target.value);
                            }}
                            onFocus={() => setIsPromptFocused(true)}
                            onBlur={(_e) => {
                                setIsPromptFocused(false);
                                if (localAiPrompt !== (ledger.aiCustomPrompt || "")) {
                                    handleUpdateLedger({ aiCustomPrompt: localAiPrompt });
                                }
                            }}
                            disabled={isPending}
                            placeholder={t('aiPromptPlaceholder')}
                            className="w-full min-h-[100px] bg-[var(--background)] border border-[var(--border)] rounded-[var(--radius-md)] p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-none disabled:opacity-50"
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
                        settings={{ ...ledger, currencies: ledger.currencies || [] } as unknown as any}
                        onUpdateSettings={(data) => handleUpdateLedger(data)}
                    />

                    <div className="h-px bg-[var(--border)]" />

                    {/* Category Settings */}
                    {categories && (
                        <CategorySection
                            categories={categories}
                            onCreateCategory={(name) => createCategoryMutation.mutate({ name })}
                            onUpdateCategory={(id, data) => updateCategoryMutation.mutate({ id, data })}
                            onDeleteCategory={(id) => deleteCategoryMutation.mutate(id)}
                            onReorderCategories={(ids) => reorderCategoriesMutation.mutate(ids)}
                        />
                    )}
                </div>
            </section>

            {/* Notification Settings */}
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-4 sm:p-6">
                <h2 className="text-lg font-medium mb-6">{t('notifications')}</h2>
                <div className="space-y-6">
                    <PushNotificationManager />
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
