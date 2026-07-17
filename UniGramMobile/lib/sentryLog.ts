import * as Sentry from '@sentry/react-native';

const isSentryEnabled = !!process.env.EXPO_PUBLIC_SENTRY_DSN;

export const sentryLog = {
  info: (message: string, extra?: Record<string, any>) => {
    if (__DEV__) {
      console.log(`[INFO] ${message}`, extra || '');
    }
    if (!isSentryEnabled) {
      return;
    }
    Sentry.captureMessage(message, {
      level: 'info',
      extra,
    });
  },

  warn: (message: string, extra?: Record<string, any>) => {
    if (__DEV__) {
      console.warn(`[WARN] ${message}`, extra || '');
    }
    if (!isSentryEnabled) {
      return;
    }
    Sentry.captureMessage(message, {
      level: 'warning',
      extra,
    });
  },

  error: (error: any, context?: string, extra?: Record<string, any>) => {
    if (__DEV__) {
      console.error(`[ERROR]${context ? ` (${context})` : ''}:`, error, extra || '');
    }

    if (!isSentryEnabled) {
      return;
    }

    const errorObject = error instanceof Error
      ? error
      : new Error(typeof error === 'string' ? error : JSON.stringify(error));

    Sentry.captureException(errorObject, {
      extra: {
        context,
        ...extra,
      },
    });
  },

  setUser: (id: string, email?: string, username?: string) => {
    if (__DEV__) {
      console.log(`[USER] Set user context: ${id} | ${email || ''} | ${username || ''}`);
    }
    if (!isSentryEnabled) {
      return;
    }
    Sentry.setUser({ id, email, username });
  },

  clearUser: () => {
    if (__DEV__) {
      console.log('[USER] Clear user context');
    }
    if (!isSentryEnabled) {
      return;
    }
    Sentry.setUser(null);
  },

  setTag: (key: string, value: string) => {
    if (__DEV__) {
      console.log(`[TAG] ${key} = ${value}`);
    }
    if (!isSentryEnabled) {
      return;
    }
    Sentry.setTag(key, value);
  },
};
