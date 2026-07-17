import { registerRootComponent } from 'expo';
import * as Sentry from '@sentry/react-native';

import App from './App';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN || '';

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 1.0,
    environment: __DEV__ ? 'development' : 'production',
    debug: __DEV__,
  });
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Sentry.wrap(App));
