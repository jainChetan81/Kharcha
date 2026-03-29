import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

const discovery = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
};

export const SECURE_STORE_KEYS = {
  ACCESS_TOKEN: "gmail_access_token",
  REFRESH_TOKEN: "gmail_refresh_token",
  TOKEN_EXPIRY: "gmail_token_expiry",
};

export async function getValidAccessToken(): Promise<string | null> {
  const expiry = await SecureStore.getItemAsync(SECURE_STORE_KEYS.TOKEN_EXPIRY);
  const accessToken = await SecureStore.getItemAsync(
    SECURE_STORE_KEYS.ACCESS_TOKEN,
  );
  const refreshToken = await SecureStore.getItemAsync(
    SECURE_STORE_KEYS.REFRESH_TOKEN,
  );

  if (!accessToken) return null;

  if (expiry && Date.now() < parseInt(expiry, 10) - 60000) return accessToken;

  if (!refreshToken) return null;

  const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  const refreshed = await refreshResponse.json();
  if (!refreshed.access_token) return null;

  await SecureStore.setItemAsync(
    SECURE_STORE_KEYS.ACCESS_TOKEN,
    refreshed.access_token,
  );
  const newExpiry = Date.now() + refreshed.expires_in * 1000;
  await SecureStore.setItemAsync(
    SECURE_STORE_KEYS.TOKEN_EXPIRY,
    newExpiry.toString(),
  );

  return refreshed.access_token;
}

export function useGoogleAuth() {
  // const redirectUri = AuthSession.makeRedirectUri({
  // 	scheme: "kharcha",
  // 	path: "auth/callback",
  // 	preferLocalhost: false
  // });
  const redirectUri = "https://auth.expo.io/@jainchetan81/kharcha";

  const [request, _response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: CLIENT_ID,
      scopes: SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      extraParams: { access_type: "offline", prompt: "consent" },
    },
    discovery,
  );

  const signIn = async () => {
    const result = await promptAsync();
    if (result.type !== "success") return false;

    const { code } = result.params;

    // exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: request?.codeVerifier ?? "",
      }).toString(),
    });

    const tokens = await tokenResponse.json();

    if (!tokens.access_token) return false;

    // store tokens securely
    await SecureStore.setItemAsync(
      SECURE_STORE_KEYS.ACCESS_TOKEN,
      tokens.access_token,
    );
    if (tokens.refresh_token) {
      await SecureStore.setItemAsync(
        SECURE_STORE_KEYS.REFRESH_TOKEN,
        tokens.refresh_token,
      );
    }
    const expiry = Date.now() + tokens.expires_in * 1000;
    await SecureStore.setItemAsync(
      SECURE_STORE_KEYS.TOKEN_EXPIRY,
      expiry.toString(),
    );

    return true;
  };

  const signOut = async () => {
    await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN);
    await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
    await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.TOKEN_EXPIRY);
  };

  const isConnected = async (): Promise<boolean> => {
    const token = await SecureStore.getItemAsync(
      SECURE_STORE_KEYS.REFRESH_TOKEN,
    );
    return !!token;
  };

  return { signIn, signOut, getValidAccessToken, isConnected, request };
}
