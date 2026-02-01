export const safeError = (error: any): string => {
    // Log the full error for server-side debugging
    console.error("SERVER ERROR:", error);

    // Return a generic friendly message to the client
    // You might want to map specific error types (like "Rate Limit") to friendly messages here
    // But for now, mask everything else.
    return "An unexpected error occurred. Please try again later.";
};
