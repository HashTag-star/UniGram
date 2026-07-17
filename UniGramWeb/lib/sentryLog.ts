import * as Sentry from "@sentry/nextjs";

export const sentryLog = {
  info: (message: string, extra?: Record<string, any>) => {
    if (process.env.NODE_ENV === "development") {
      console.log(`[INFO] ${message}`, extra || "");
    }
    Sentry.captureMessage(message, {
      level: "info",
      extra,
    });
  },

  warn: (message: string, extra?: Record<string, any>) => {
    if (process.env.NODE_ENV === "development") {
      console.warn(`[WARN] ${message}`, extra || "");
    }
    Sentry.captureMessage(message, {
      level: "warning",
      extra,
    });
  },

  error: (error: any, context?: string, extra?: Record<string, any>) => {
    if (process.env.NODE_ENV === "development") {
      console.error(`[ERROR]${context ? ` (${context})` : ""}:`, error, extra || "");
    }
    
    const errorObject = error instanceof Error 
      ? error 
      : new Error(typeof error === "string" ? error : JSON.stringify(error));
    
    Sentry.captureException(errorObject, {
      extra: {
        context,
        ...extra,
      },
    });
  },

  setUser: (id: string, email?: string, username?: string) => {
    if (process.env.NODE_ENV === "development") {
      console.log(`[USER] Set user context: ${id} | ${email || ""} | ${username || ""}`);
    }
    Sentry.setUser({ id, email, username });
  },

  clearUser: () => {
    if (process.env.NODE_ENV === "development") {
      console.log(`[USER] Clear user context`);
    }
    Sentry.setUser(null);
  },

  setTag: (key: string, value: string) => {
    if (process.env.NODE_ENV === "development") {
      console.log(`[TAG] ${key} = ${value}`);
    }
    Sentry.setTag(key, value);
  },
};
