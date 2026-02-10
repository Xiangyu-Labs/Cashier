"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "@/i18n/routing";
import { useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSmartPolling } from "@/hooks/use-smart-polling";
import {
    updateLedgerAction,
} from "@/features/ledger/server/actions/ledgers";
import {
    createEntryCategoryAction,
    updateEntryCategoryAction,
    deleteEntryCategoryAction,
    reorderEntryCategoriesAction,
    getEntryCategoriesAction,
    getUncategorizedCountAction,
} from "@/features/ledger/server/actions/categories";
import { submitAutoCategorizeAction } from "@/features/ledger/server/actions/categorize";
import {
    createServiceCredentialAction,
    deleteServiceCredentialAction,
} from "@/features/ledger/server/actions/credentials";
import { CurrencySection } from "./settings/CurrencySection";
import { CategorySection } from "./settings/CategorySection";
import { ServiceCredentialSection } from "./settings/ServiceCredentialSection";

import { getServiceCredentialsAction } from "@/features/ledger/server/actions/credentials";
import { useQuery } from "@tanstack/react-query";
import { queryKeys, invalidateLedgerCache } from "@/lib/query-keys";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";

import { EntryCategory, EntryCategoryWithCount, Ledger, ServiceCredential, Settings } from "@/types/api";
import { Switch } from "@/components/ui/switch";
import { Monitor, Sun, Moon, LogOut, ChevronDown } from "lucide-react";
import { useTranslations, useLocale } from 'next-intl';
import { useTheme } from "next-themes";
import { UI_LANGUAGES, AI_LANGUAGES } from "@/config/languages";
import { toast } from "sonner";
import { signOut } from "next-auth/react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface SettingsTabProps {
    ledger: Ledger;
    initialCategories: EntryCategoryWithCount[];
    ledgerId: string;
}

// Collapsible Section wrapper component
function CollapsibleSection({
    title,
    defaultOpen = false,
    children,
}: {
    title: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] overflow-hidden">
                <CollapsibleTrigger asChild>
                    <button
                        className="w-full p-4 sm:p-6 flex items-center justify-between text-left hover:bg-[var(--surface2)]/50 transition-colors"
                        type="button"
                    >
                        <h2 className="text-lg font-medium">{title}</h2>
                        <ChevronDown
                            className={cn(
                                "h-5 w-5 text-muted-foreground transition-transform duration-200",
                                isOpen && "rotate-180"
                            )}
                        />
                    </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-0 space-y-6 border-t border-[var(--border)]">
                        {children}
                    </div>
                </CollapsibleContent>
            </section>
        </Collapsible>
    );
}

export function SettingsTab({ ledger, initialCategories, ledgerId }: SettingsTabProps) {
    const router = useRouter();
    const pathname = usePathname();
    const locale = useLocale();
    const t = useTranslations('Settings');
    const { theme, setTheme } = useTheme();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const queryClient = useQueryClient();
    const queryKey = queryKeys.entryCategories(ledgerId);

    const handleRefresh = async () => {
        await queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
    };

    // Categories - Use smart polling
    const { data: categories = [] } = useSmartPolling<EntryCategoryWithCount[]>({
        queryKey,
        queryFn: () => getEntryCategoriesAction(ledgerId),
        isActive: (data) => data?.some((c) => !c.icon || !c.description) ?? false,
        interval: 3000,
        initialData: initialCategories
    });

    // Uncategorized count - separate query for cleaner cache management
    const { data: uncategorizedCount = 0 } = useQuery<number>({
        queryKey: queryKeys.uncategorizedCount(ledgerId),
        queryFn: () => getUncategorizedCountAction(ledgerId),
        staleTime: 30 * 1000, // 30 seconds
    });

    // Credentials - fetch client-side with long staleTime
    const { data: credentials = [] } = useQuery<ServiceCredential[]>({
        queryKey: queryKeys.serviceCredentials(ledgerId),
        queryFn: () => getServiceCredentialsAction(ledgerId) as Promise<ServiceCredential[]>,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });

    // Local state for Ledger Name
    const [localLedgerName, setLocalLedgerName] = useState(ledger.name);
    const [isNameFocused, setIsNameFocused] = useState(false);

    // Sync from props only when not focused and not pending
    if (!isNameFocused && !isPending && localLedgerName !== ledger.name) {
        setLocalLedgerName(ledger.name);
    }

    // Local state for AI Prompt
    const [localAiPrompt, setLocalAiPrompt] = useState(ledger.metadata?.settings?.aiCustomPrompt || "");
    const [isPromptFocused, setIsPromptFocused] = useState(false);

    // Sync from props only when not focused and not pending
    if (!isPromptFocused && !isPending && localAiPrompt !== (ledger.metadata?.settings?.aiCustomPrompt || "")) {
        setLocalAiPrompt(ledger.metadata?.settings?.aiCustomPrompt || "");
    }

    // Optimistic states

    const [optimisticCollapseBills, setOptimisticCollapseBills] = useState(ledger.metadata?.settings?.collapseBillsDefault);

    function handleUpdateLedger(data: {
        name?: string;
        currencies?: string[];
        mainCurrency?: string;
        aiLanguage?: string;
        collapseBillsDefault?: boolean;
        aiCustomPrompt?: string;
    }) {
        startTransition(async () => {
            // Construct the settings object
            // We need to be careful: the action expects `name` at top level, and everything else in `settings`

            const settingsUpdate: Parameters<typeof updateLedgerAction>[1]["settings"] = {};
            if (data.currencies !== undefined) settingsUpdate.currencies = data.currencies;
            if (data.mainCurrency !== undefined) settingsUpdate.mainCurrency = data.mainCurrency;
            if (data.aiLanguage !== undefined) settingsUpdate.aiLanguage = data.aiLanguage;

            if (data.collapseBillsDefault !== undefined) settingsUpdate.collapseBillsDefault = data.collapseBillsDefault;
            if (data.aiCustomPrompt !== undefined) settingsUpdate.aiCustomPrompt = data.aiCustomPrompt;

            const payload: Parameters<typeof updateLedgerAction>[1] = {};
            if (data.name !== undefined) payload.name = data.name;
            if (Object.keys(settingsUpdate).length > 0) payload.settings = settingsUpdate;

            try {
                await updateLedgerAction(ledgerId, payload);
                toast.success(t("settingsUpdated"));
                router.refresh();
            } catch {
                toast.error(t("updateFailed"));
                // Revert optimistic updates on error

                setOptimisticCollapseBills(ledger.metadata?.settings?.collapseBillsDefault);
            }
        });
    }

    // Track category creation success to clear input
    const [categoryCreatedTrigger, setCategoryCreatedTrigger] = useState<() => void>(() => () => { });

    const createCategoryMutation = useMutation({
        mutationFn: async (data: { name: string }) => {
            return await createEntryCategoryAction(ledgerId, data);
        },
        onMutate: async (newCategory: { name: string }) => {
            await queryClient.cancelQueries({ queryKey });
            const previousCategories = queryClient.getQueryData<EntryCategoryWithCount[]>(queryKey);

            queryClient.setQueryData<EntryCategoryWithCount[]>(queryKey, (old = []) => [
                ...old,
                {
                    id: `temp-${Date.now()}`,
                    name: newCategory.name,
                    icon: null,
                    description: null,
                    isEditable: true,
                    sortOrder: categories.length,
                    ledgerId,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    deletedAt: null,
                    entryCount: 0,
                } as EntryCategoryWithCount
            ]);

            return { previousCategories };
        },
        onSuccess: () => {
            toast.success(t("categoryCreated"));
            setCategoryCreatedTrigger(() => () => { });
            queryClient.invalidateQueries({ queryKey });
            queryClient.invalidateQueries({ queryKey: queryKeys.processingTasks(ledgerId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.taskQueue(ledgerId) });
        },
        onError: (_err: Error, _: { name: string }, context: { previousCategories?: EntryCategoryWithCount[] } | undefined) => {
            toast.error(t("createCategoryFailed"));
            if (context?.previousCategories) {
                queryClient.setQueryData(queryKey, context.previousCategories);
            }
        },
    });

    const updateCategoryMutation = useMutation({
        mutationFn: async ({ id, data }: { id: string; data: Partial<EntryCategory> }) => {
            await updateEntryCategoryAction(ledgerId, id, {
                ...data,
                description: data.description ?? undefined,
                icon: data.icon ?? undefined,
            });
        },
        onMutate: async ({ id, data }: { id: string; data: Partial<EntryCategory> }) => {
            await queryClient.cancelQueries({ queryKey });
            const previousCategories = queryClient.getQueryData<EntryCategoryWithCount[]>(queryKey);

            queryClient.setQueryData<EntryCategoryWithCount[]>(queryKey, (old = []) =>
                old.map((c) => c.id === id ? { ...c, ...data } : c)
            );

            return { previousCategories };
        },
        onSuccess: () => {
            toast.success(t("categoryUpdated"));
            queryClient.invalidateQueries({ queryKey });
        },
        onError: (_err: Error, _: { id: string; data: Partial<EntryCategory> }, context: { previousCategories?: EntryCategoryWithCount[] } | undefined) => {
            toast.error(t("updateCategoryFailed"));
            if (context?.previousCategories) {
                queryClient.setQueryData(queryKey, context.previousCategories);
            }
        },
    });

    const deleteCategoryMutation = useMutation({
        mutationFn: async (id: string) => {
            await deleteEntryCategoryAction(ledgerId, id);
        },
        onMutate: async (id: string) => {
            await queryClient.cancelQueries({ queryKey });
            const previousCategories = queryClient.getQueryData<EntryCategoryWithCount[]>(queryKey);

            queryClient.setQueryData<EntryCategoryWithCount[]>(queryKey, (old = []) =>
                old.filter((c) => c.id !== id)
            );

            return { previousCategories };
        },
        onSuccess: () => {
            toast.success(t("categoryDeleted"));
            queryClient.invalidateQueries({ queryKey });
            // Also invalidate uncategorized count since deleted category's entries become uncategorized
            queryClient.invalidateQueries({ queryKey: queryKeys.uncategorizedCount(ledgerId) });
            // Invalidate task queue to immediately reflect cancelled tasks
            queryClient.invalidateQueries({ queryKey: queryKeys.taskQueue(ledgerId) });
        },
        onError: (_err: Error, _: string, context: { previousCategories?: EntryCategoryWithCount[] } | undefined) => {
            toast.error(t("deleteCategoryFailed"));
            if (context?.previousCategories) {
                queryClient.setQueryData(queryKey, context.previousCategories);
            }
        },
    });

    const reorderCategoriesMutation = useMutation({
        mutationFn: async (categoryIds: string[]) => {
            await reorderEntryCategoriesAction(ledgerId, categoryIds);
        },
        onMutate: async (categoryIds: string[]) => {
            await queryClient.cancelQueries({ queryKey });
            const previousCategories = queryClient.getQueryData<EntryCategoryWithCount[]>(queryKey);

            // Optimistically reorder categories
            queryClient.setQueryData<EntryCategoryWithCount[]>(queryKey, (old = []) => {
                const categoryMap = new Map(old.map(c => [c.id, c]));
                return categoryIds
                    .map((id, index) => {
                        const cat = categoryMap.get(id);
                        return cat ? { ...cat, sortOrder: index } : null;
                    })
                    .filter((c): c is EntryCategoryWithCount => c !== null);
            });

            return { previousCategories };
        },
        onSuccess: () => {
            toast.success(t("categoriesReordered"));
        },
        onError: (_err: Error, _: string[], context: { previousCategories?: EntryCategoryWithCount[] } | undefined) => {
            toast.error(t("reorderCategoriesFailed"));
            if (context?.previousCategories) {
                queryClient.setQueryData(queryKey, context.previousCategories);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey });
        },
    });

    const createCredentialMutation = useMutation({
        mutationFn: async (name: string) => {
            return await createServiceCredentialAction(ledgerId, { name });
        },
        onMutate: async (name: string) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.serviceCredentials(ledgerId) });
            const previousCredentials = queryClient.getQueryData<ServiceCredential[]>(queryKeys.serviceCredentials(ledgerId));

            // Optimistically add the new credential
            queryClient.setQueryData<ServiceCredential[]>(queryKeys.serviceCredentials(ledgerId), (old = []) => [
                ...old,
                {
                    id: `temp-${Date.now()}`,
                    name,
                    ledgerId,
                    key: '••••••••', // Placeholder
                    createdAt: new Date().toISOString(),
                    deletedAt: null,
                    lastUsedAt: null,
                } as ServiceCredential
            ]);

            return { previousCredentials };
        },
        onSuccess: () => {
            toast.success(t("credentialCreated"));
        },
        onError: (_err: Error, _: string, context: { previousCredentials?: ServiceCredential[] } | undefined) => {
            toast.error(t("createFailed"));
            if (context?.previousCredentials) {
                queryClient.setQueryData(queryKeys.serviceCredentials(ledgerId), context.previousCredentials);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.serviceCredentials(ledgerId) });
        },
    });

    const deleteCredentialMutation = useMutation({
        mutationFn: async (id: string) => {
            await deleteServiceCredentialAction(ledgerId, id);
        },
        onMutate: async (id: string) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.serviceCredentials(ledgerId) });
            const previousCredentials = queryClient.getQueryData<ServiceCredential[]>(queryKeys.serviceCredentials(ledgerId));

            // Optimistically remove the credential
            queryClient.setQueryData<ServiceCredential[]>(queryKeys.serviceCredentials(ledgerId), (old = []) =>
                old.filter((c) => c.id !== id)
            );

            return { previousCredentials };
        },
        onSuccess: () => {
            toast.success(t("credentialDeleted"));
        },
        onError: (_err: Error, _: string, context: { previousCredentials?: ServiceCredential[] } | undefined) => {
            toast.error(t("deleteFailed"));
            if (context?.previousCredentials) {
                queryClient.setQueryData(queryKeys.serviceCredentials(ledgerId), context.previousCredentials);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.serviceCredentials(ledgerId) });
        },
    });

    return (
        <PullToRefresh onRefresh={handleRefresh}>
        <div className="space-y-6 sm:space-y-8">
            {/* Ledger Name Settings - Always visible */}
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-4 sm:p-6">
                <h2 className="text-lg font-medium mb-6">{t('ledgerName')}</h2>
                <div className="space-y-4">
                    <div>
                        <p className="text-sm text-[var(--muted)] mb-2">{t('ledgerNameDesc')}</p>
                        <input
                            type="text"
                            value={localLedgerName}
                            onChange={(e) => setLocalLedgerName(e.target.value)}
                            onFocus={() => setIsNameFocused(true)}
                            onBlur={() => {
                                setIsNameFocused(false);
                                if (localLedgerName !== ledger.name) {
                                    handleUpdateLedger({ name: localLedgerName });
                                }
                            }}
                            disabled={isPending}
                            placeholder={t('ledgerNamePlaceholder')}
                            className="w-full bg-[var(--background)] border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all disabled:opacity-50"
                        />
                    </div>
                </div>
            </section>

            {/* Appearance Settings - Always visible */}
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-4 sm:p-6">
                <h2 className="text-lg font-medium mb-6">{t('appearance')}</h2>
                <div className="space-y-6">
                    {/* Theme Setting */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
                                    const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
                                    router.push(`${pathname}${query}`, { locale: newLocale as "en-US" | "zh-CN" });
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
                </div>
            </section>

            {/* Advanced Settings - Collapsible, default closed */}
            <CollapsibleSection title={t('advancedSettings')} defaultOpen={false}>
                {/* Collapse Bills Setting */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-4">
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

                <div className="h-px bg-[var(--border)]" />

                {/* AI Language Setting */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h3 className="text-base font-medium">{t('aiLanguage')}</h3>
                        <p className="text-sm text-[var(--muted)]">{t('aiLanguageDesc')}</p>
                    </div>
                    <select
                        value={ledger.metadata?.settings?.aiLanguage || 'zh-CN'}
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

                {/* AI Prompt */}
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
                            if (localAiPrompt !== (ledger.metadata?.settings?.aiCustomPrompt || "")) {
                                handleUpdateLedger({ aiCustomPrompt: localAiPrompt });
                            }
                        }}
                        disabled={isPending}
                        placeholder={t('aiPromptPlaceholder')}
                        className="w-full min-h-[100px] bg-[var(--background)] border border-[var(--border)] rounded-[var(--radius-md)] p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-none disabled:opacity-50"
                    />
                </div>
            </CollapsibleSection>

            {/* Data Configuration - Collapsible, default closed */}
            <CollapsibleSection title={t('dataConfig')} defaultOpen={false}>
                <div className="space-y-8 pt-4">
                    {/* Currency Settings */}
                    <CurrencySection
                        settings={{ ...ledger.metadata?.settings, currencies: ledger.metadata?.settings?.currencies || [] } as unknown as Settings}
                        onUpdateSettings={(data) => handleUpdateLedger(data)}
                    />

                    <div className="h-px bg-[var(--border)]" />

                    {/* Category Settings */}
                    {categories && (
                        <CategorySection
                            categories={categories}
                            uncategorizedCount={uncategorizedCount}
                            onCreateCategory={(name) => createCategoryMutation.mutate({ name })}
                            onUpdateCategory={(id, data) => updateCategoryMutation.mutate({ id, data })}
                            onDeleteCategory={(id) => deleteCategoryMutation.mutate(id)}
                            onReorderCategories={(ids) => reorderCategoriesMutation.mutate(ids)}
                            onCategoryCreated={categoryCreatedTrigger}
                            onAutoCategorize={async () => {
                                const result = await submitAutoCategorizeAction(ledgerId);
                                // Invalidate uncategorized count and task queue after submitting tasks
                                queryClient.invalidateQueries({ queryKey: queryKeys.uncategorizedCount(ledgerId) });
                                queryClient.invalidateQueries({ queryKey: queryKeys.taskQueue(ledgerId) });
                                return { submittedCount: result.submittedCount, skippedCount: result.skippedCount };
                            }}
                        />
                    )}
                </div>
            </CollapsibleSection>

            {/* Service Credentials Settings - Collapsible, default closed */}
            <CollapsibleSection title={t('serviceCredentialsSection')} defaultOpen={false}>
                <div className="pt-4">
                    <ServiceCredentialSection
                        credentials={credentials || []}
                        onCreateCredential={(name) => createCredentialMutation.mutateAsync(name)}
                        onDeleteCredential={(id) => deleteCredentialMutation.mutate(id)}
                    />
                </div>
            </CollapsibleSection>

            {/* Account Settings (Sign Out) - Always visible */}
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-4 sm:p-6">
                <h2 className="text-lg font-medium mb-6">{t('account')}</h2>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h3 className="text-base font-medium">{t('signOut')}</h3>
                        <p className="text-sm text-[var(--muted)]">{t('signOutDesc')}</p>
                    </div>
                    <button
                        onClick={() => signOut({ callbackUrl: "/login" })}
                        disabled={isPending}
                        className="flex items-center gap-2 px-4 py-2 border border-[var(--border)] rounded-md hover:bg-[var(--surface2)] transition-colors disabled:opacity-50"
                    >
                        <LogOut className="h-4 w-4" />
                        <span>{t('signOut')}</span>
                    </button>
                </div>
            </section>
        </div >
        </PullToRefresh>
    );
}
