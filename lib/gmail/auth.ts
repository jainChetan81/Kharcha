import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { env } from "@/lib/env";

WebBrowser.maybeCompleteAuthSession();

const IOS_CLIENT_ID = env.GOOGLE_IOS_CLIENT_ID;
const WEB_CLIENT_ID = env.GOOGLE_WEB_CLIENT_ID;
const WEB_CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET;
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
  console.log("[Gmail] getValidAccessToken called");
  const expiry = await SecureStore.getItemAsync(SECURE_STORE_KEYS.TOKEN_EXPIRY);
  const accessToken = await SecureStore.getItemAsync(
    SECURE_STORE_KEYS.ACCESS_TOKEN,
  );
  const refreshToken = await SecureStore.getItemAsync(
    SECURE_STORE_KEYS.REFRESH_TOKEN,
  );

  console.log(
    "[Gmail] Stored tokens — access:",
    !!accessToken,
    "refresh:",
    !!refreshToken,
    "expiry:",
    expiry,
  );

  if (!accessToken) return null;

  if (expiry && Date.now() < Number.parseInt(expiry, 10) - 60000) {
    console.log("[Gmail] Access token still valid");
    return accessToken;
  }

  if (!refreshToken) {
    console.log("[Gmail] No refresh token, cannot refresh");
    return null;
  }

  console.log("[Gmail] Token expired, refreshing...");
  try {
    const tokenResult = await AuthSession.refreshAsync(
      {
        clientId: WEB_CLIENT_ID,
        clientSecret: WEB_CLIENT_SECRET,
        refreshToken,
      },
      discovery,
    );
    console.log("[Gmail] Refresh result: success");

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
  } catch (err) {
    console.log("[Gmail] Refresh failed:", err);
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
    console.log("[Gmail] signIn called");
    console.log(
      "[Gmail] iOS CLIENT_ID:",
      IOS_CLIENT_ID ? `${IOS_CLIENT_ID.slice(0, 20)}...` : "MISSING",
    );
    console.log(
      "[Gmail] Web CLIENT_ID:",
      WEB_CLIENT_ID ? `${WEB_CLIENT_ID.slice(0, 20)}...` : "MISSING",
    );
    console.log("[Gmail] redirectUri:", request?.redirectUri);
    console.log("[Gmail] request ready:", !!request);

    const result = await promptAsync();
    console.log("[Gmail] promptAsync result type:", result.type);

    if (result.type !== "success") return false;

    const { code } = result.params;
    console.log(
      "[Gmail] Got auth code, exchanging for tokens via exchangeCodeAsync...",
    );

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

      console.log(
        "[Gmail] Token exchange success — accessToken:",
        !!tokenResult.accessToken,
        "refreshToken:",
        !!tokenResult.refreshToken,
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

      console.log("[Gmail] Tokens stored successfully");
      return true;
    } catch (err) {
      console.log("[Gmail] Token exchange failed:", err);
      return false;
    }
  };

  const signOut = async () => {
    console.log("[Gmail] signOut called, clearing tokens");
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
