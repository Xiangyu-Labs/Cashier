"use client";
import { useEffect, useState } from "react";
import { Trash2, Copy, Plus, Key, Check } from "lucide-react";
import type { ServiceCredential, CreatedServiceCredentialDto } from "@/modules/ledger/contracts";
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
  onCreateCredential: (name: string) => Promise<CreatedServiceCredentialDto>;
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
  const [createdCredential, setCreatedCredential] = useState<CreatedServiceCredentialDto | null>(
    null
  );
  const [hasCopied, setHasCopied] = useState(false);

  useEffect(() => {
    if (!hasCopied) return;

    const timer = setTimeout(() => setHasCopied(false), UI.COPY_FEEDBACK_DURATION_MS);
    return () => clearTimeout(timer);
  }, [hasCopied]);

  const handleCreate = async () => {
    if (newCredName.trim() === "") return;

    try {
      const newCredential = await onCreateCredential(newCredName.trim());
      setCreatedCredential(newCredential);
      setNewCredName("");
      setIsCreateDialogOpen(false);
    } catch (error) {
      console.error("Failed to create credential", error);
    }
  };

  const handleCopy = async (text: string) => {
    const success = await copyToClipboard(text);

    if (success) {
      setHasCopied(true);
      toast.success(t("copied"));
      return;
    }

    toast.error(tCommon("error"));
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-text">{t("title")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} size="sm" className="gap-2">
          <Plus size={16} />
          {t("newCredential")}
        </Button>
      </div>

      <div className="space-y-3">
        {credentials.length === 0 ? (
          <div className="rounded-[var(--radius)] border border-dashed border-border py-8 text-center text-muted">
            {t("noCredentials")}
          </div>
        ) : (
          credentials.map((credential) => (
            <div
              key={credential.id}
              className="flex items-center justify-between rounded-[var(--radius)] border border-border bg-surface2 p-4"
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="rounded-full bg-surface p-2">
                  <Key size={16} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{credential.name}</div>
                  <div className="truncate font-mono text-xs text-muted">
                    {credential.tokenPrefix && credential.tokenSuffix
                      ? `${credential.tokenPrefix}...${credential.tokenSuffix}`
                      : "******"}
                  </div>
                  <div className="mt-1 text-[10px] text-muted">
                    {t("createdAt", { date: new Date(credential.createdAt).toLocaleDateString() })}
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCredentialToDelete(credential.id)}
                className="shrink-0 text-muted hover:text-danger"
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))
        )}
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent variant="modal">
          <DialogHeader>
            <DialogTitle>{t("createTitle")}</DialogTitle>
            <DialogDescription>{t("createDesc")}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder={t("namePlaceholder")}
              value={newCredName}
              onChange={(event) => setNewCredName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && handleCreate()}
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

      <Dialog
        open={createdCredential != null}
        onOpenChange={(open) => !open && setCreatedCredential(null)}
      >
        <DialogContent variant="modal">
          <DialogHeader>
            <DialogTitle>{t("createSuccessTitle")}</DialogTitle>
            <DialogDescription>{t("createSuccessDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="group relative break-all rounded border bg-surface p-4 font-mono text-sm">
              {createdCredential?.token}
              <Button
                size="sm"
                variant="outline"
                className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => handleCopy(createdCredential?.token ?? "")}
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
              onClick={() => handleCopy(createdCredential?.token ?? "")}
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

      <Dialog
        open={credentialToDelete != null}
        onOpenChange={(open) => !open && setCredentialToDelete(null)}
      >
        <DialogContent variant="modal">
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
                if (credentialToDelete == null) return;
                onDeleteCredential(credentialToDelete);
                setCredentialToDelete(null);
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
