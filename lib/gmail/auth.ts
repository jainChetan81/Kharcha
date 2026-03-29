import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "";
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";
const WEB_CLIENT_SECRET = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_SECRET ?? "";
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

const discovery = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  revocationEndpoint: "https://oauth2.googleapis.com/revoke",
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

  if (expiry && Date.now() < Number.parseInt(expiry, 10) - 60000) {
    return accessToken;
  }

  if (!refreshToken) {
    return null;
  }

  try {
    const tokenResult = await AuthSession.refreshAsync(
      {
        clientId: WEB_CLIENT_ID,
        clientSecret: WEB_CLIENT_SECRET,
        refreshToken,
      },
      discovery,
    );
    await SecureStore.setItemAsync(
      SECURE_STORE_KEYS.ACCESS_TOKEN,
      tokenResult.accessToken,
    );
    if (tokenResult.refreshToken) {
      await SecureStore.setItemAsync(
        SECURE_STORE_KEYS.REFRESH_TOKEN,
        tokenResult.refreshToken,
      );
    }
    const newExpiry = tokenResult.issuedAt + (tokenResult.expiresIn ?? 3600);
    await SecureStore.setItemAsync(
      SECURE_STORE_KEYS.TOKEN_EXPIRY,
      String(newExpiry * 1000),
    );

    return tokenResult.accessToken;
  } catch {
    return null;
  }
}

export function useGoogleAuth() {
  const redirectUri = AuthSession.makeRedirectUri({
    native: `com.chetanjain.kharcha:/oauthredirect`,
  });

  const [request, _response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: IOS_CLIENT_ID,
      scopes: SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      extraParams: { access_type: "offline", prompt: "consent" },
    },
    discovery,
  );

  const signIn = async () => {
    const result = await promptAsync();
    if (result.type !== "success") return false;

    const { code } = result.params;

    try {
      const tokenResult = await AuthSession.exchangeCodeAsync(
        {
          code,
          clientId: IOS_CLIENT_ID,
          redirectUri: request?.redirectUri ?? "",
          extraParams: request?.codeVerifier
            ? { code_verifier: request.codeVerifier }
            : undefined,
        },
        discovery,
      );

      await SecureStore.setItemAsync(
        SECURE_STORE_KEYS.ACCESS_TOKEN,
        tokenResult.accessToken,
      );
      if (tokenResult.refreshToken) {
        await SecureStore.setItemAsync(
          SECURE_STORE_KEYS.REFRESH_TOKEN,
          tokenResult.refreshToken,
        );
      }
      const expiry = tokenResult.issuedAt + (tokenResult.expiresIn ?? 3600);
      await SecureStore.setItemAsync(
        SECURE_STORE_KEYS.TOKEN_EXPIRY,
        String(expiry * 1000),
      );

      return true;
    } catch {
      return false;
    }
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
