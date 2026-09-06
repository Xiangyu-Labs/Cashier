import { handleLedgerHistoryTraversal } from "@/lib/navigation/ledger-history-traversal";

// Register before hydration: Next's traversal handler can synchronously unmount dirty editors.
window.addEventListener("popstate", handleLedgerHistoryTraversal);
