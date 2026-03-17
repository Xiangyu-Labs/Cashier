"use client";

import { useState, useEffect } from "react";
import { Trash2, Copy, Plus, Key, Check } from "lucide-react";
import { type ServiceCredential } from "@/types/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

import { useTranslations } from "next-intl";
import { copyToClipboard } from "@/lib/utils";
import { UI } from "@/lib/constants";

interface ServiceCredentialSectionProps {
  credentials: ServiceCredential[];
  onCreateCredential: (name: string) => Promise<ServiceCredential>;
  onDeleteCredential: (id: string) => void;
}

export function ServiceCredentialSection({
  credentials,
  onCreateCredential,
  onDeleteCredential,
}: ServiceCredentialSectionProps) {
  const t = useTranslations("ServiceCredentials");
  const tCommon = useTranslations("Common");
  const [newCredName, setNewCredName] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [credentialToDelete, setCredentialToDelete] = useState<string | null>(null);
  const [createdCredential, setCreatedCredential] = useState<ServiceCredential | null>(null);
  const [hasCopied, setHasCopied] = useState(false);

  useEffect(() => {
    if (hasCopied) {
      const timer = setTimeout(() => setHasCopied(false), UI.COPY_FEEDBACK_DURATION_MS);
      return () => clearTimeout(timer);
    }
  }, [hasCopied]);

  const handleCreate = async () => {
    if (newCredName.trim() === "") return;
    try {
      const newCred = await onCreateCredential(newCredName.trim());
      setCreatedCredential(newCred);
      setNewCredName("");
      setIsCreateDialogOpen(false);
    } catch (error) {
      console.error("Failed to create credential", error);
      toast.error(t("createFailed"));
    }
  };

  const handleCopy = async (text: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setHasCopied(true);
      toast.success(t("copied"));
    } else {
      toast.error(tCommon("error"));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-medium">{t("title")}</h3>
          <p className="text-sm text-muted">{t("description")}</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} size="sm" className="gap-2">
          <Plus size={16} />
          {t("newCredential")}
        </Button>
      </div>

      <div className="space-y-3">
        {credentials.length === 0 ? (
          <div className="text-center py-8 text-muted border border-dashed border-border rounded-[var(--radius)]">
            {t("noCredentials")}
          </div>
        ) : (
          credentials.map((cred) => (
            <div
              key={cred.id}
              className="flex items-center justify-between p-4 bg-surface2 rounded-[var(--radius)] border border-border"
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="p-2 bg-surface rounded-full">
                  <Key size={16} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{cred.name}</div>
                  <div className="text-xs text-muted font-mono truncate">
                    {/* Display masked key directly from prop, no copy button for list items */}
                    {cred.key ?? "******"}
                  </div>
                  <div className="text-[10px] text-muted mt-1">
                    {t("createdAt", { date: new Date(cred.createdAt).toLocaleDateString() })}
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCredentialToDelete(cred.id)}
                className="text-muted hover:text-danger shrink-0"
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("createTitle")}</DialogTitle>
            <DialogDescription>{t("createDesc")}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder={t("namePlaceholder")}
              value={newCredName}
              onChange={(e) => setNewCredName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsCreateDialogOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleCreate} disabled={newCredName.trim() === ""}>
              {tCommon("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog with Full Key */}
      <Dialog
        open={!!createdCredential}
        onOpenChange={(open) => !open && setCreatedCredential(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("createSuccessTitle")}</DialogTitle>
            <DialogDescription>{t("createSuccessDesc")}</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="p-4 bg-surface rounded border font-mono text-sm break-all relative group">
              {createdCredential?.key}
              <Button
                size="sm"
                variant="outline"
                className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => handleCopy(createdCredential?.key ?? "")}
              >
                {hasCopied ? (
                  <Check size={14} className="mr-1" />
                ) : (
                  <Copy size={14} className="mr-1" />
                )}
                {hasCopied ? tCommon("success") : t("copy")}
              </Button>
            </div>
            <Button
              className="w-full gap-2"
              onClick={() => handleCopy(createdCredential?.key ?? "")}
              variant={hasCopied ? "outline" : "default"}
            >
              {hasCopied ? <Check size={16} /> : <Copy size={16} />}
              {hasCopied ? tCommon("success") : t("copyCredential")}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreatedCredential(null)}>{t("saved")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!credentialToDelete}
        onOpenChange={(open) => !open && setCredentialToDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteDesc")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCredentialToDelete(null)}>
              {tCommon("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (credentialToDelete) {
                  onDeleteCredential(credentialToDelete);
                  setCredentialToDelete(null);
                }
              }}
            >
              {tCommon("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
