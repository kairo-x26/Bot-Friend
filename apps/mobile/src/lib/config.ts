export const config = {
  /** Show the email-only dev sign-in (the API refuses it in production regardless). */
  devLogin: __DEV__ || process.env.EXPO_PUBLIC_DEV_LOGIN === '1',
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, ''),
  google: {
    ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '',
    android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '',
    web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  },
};
