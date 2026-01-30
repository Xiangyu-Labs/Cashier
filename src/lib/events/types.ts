export type EntityType = 'ledger_entry' | 'source_document' | 'task_run' | 'category' | 'ledger' | 'service_credential';
export type EntityAction = 'created' | 'updated' | 'deleted';

export type EntityChangeEvent = {
    type: 'entity:changed';
    ledgerId: string;
    entity: EntityType;
    action: EntityAction;
    ids: string[];
    // Optional: include metadata for UI optimization (e.g. status)
    metadata?: Record<string, unknown>;
};

export type LedgerEvent = EntityChangeEvent | {
    type: 'system:ping';
    timestamp: number;
};
