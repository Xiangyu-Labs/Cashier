export const safeError = (error: unknown): string => {
    // Log the full error for server-side debugging
    console.error("SERVER ERROR:", error);

    // If it's a standard Error, let the message through as it's likely a validation error
    if (error instanceof Error) {
        return error.message;
    }

    // Return a generic friendly message to the client
    return "An unexpected error occurred. Please try again later.";
};
