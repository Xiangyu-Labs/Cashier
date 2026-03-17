"use client";

import { useState } from "react";
import { deleteAccount } from "@/features/auth/server/actions/account";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

export function DeleteAccountForm() {
  const t = useTranslations("Settings.Account");
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleDelete = async () => {
    if (confirmText !== "DELETE") return;
    setIsLoading(true);
    try {
      await deleteAccount();
    } catch (error) {
      console.error("Failed to delete account", error);
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">{t("deleteButton") !== "" ? t("deleteButton") : "Delete Account"}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("confirmTitle") !== "" ? t("confirmTitle") : "Are you absolutely sure?"}</DialogTitle>
          <DialogDescription>
            {t("confirmDesc") !== ""
              ? t("confirmDesc")
              : "This action cannot be undone. This will permanently delete your account and remove your data from our servers. Type DELETE to confirm."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="confirm">Confirmation</Label>
            <Input
              id="confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={confirmText !== "DELETE" || isLoading}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete Account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
