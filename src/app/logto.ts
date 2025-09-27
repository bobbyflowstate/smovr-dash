import { LogtoNextConfig } from '@logto/next';

export const logtoConfig: LogtoNextConfig = {
  appId: process.env.LOGTO_APP_ID!,
  appSecret: process.env.LOGTO_APP_SECRET!,
  endpoint: process.env.LOGTO_ENDPOINT!, // E.g. https://your-domain.logto.app
  baseUrl: process.env.LOGTO_BASE_URL || 'http://localhost:3000', // E.g. http://localhost:3000
  cookieSecret: process.env.LOGTO_COOKIE_SECRET || 'complex_password_at_least_32_characters_long_for_development_only',
  cookieSecure: process.env.NODE_ENV === 'production',
  scopes: ['openid', 'profile', 'email'], // Request email scope to get email claims
};
