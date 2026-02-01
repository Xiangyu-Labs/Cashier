/**
 * Deeply converts Date properties to string.
 * This is useful for API response types where Dates are serialized to ISO strings.
 */
export type Serialized<T> = T extends Date
    ? string
    : T extends Array<infer U>
    ? Array<Serialized<U>>
    : T extends object
    ? { [K in keyof T]: Serialized<T[K]> }
    : T;
