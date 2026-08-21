import * as AuthSession from "expo-auth-session";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { BUNDLE_ID, OAUTH_REDIRECT_PATH } from "@/lib/constants";
import { env } from "@/lib/env";
import { isAndroid } from "@/lib/utils";

// @react-native-google-signin/google-signin uses a native module (RNGoogleSignin)
// that only exists in dev client / production builds. In Expo Go, the native
// bridge isn't registered, and require() throws a fatal Invariant Violation
// that can't be caught with try/catch. We detect Expo Go via
// Constants.executionEnvironment and skip the require entirely.
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

type GoogleSigninModule = {
  GoogleSignin: typeof import("@react-native-google-signin/google-signin")["GoogleSignin"];
  statusCodes: typeof import("@react-native-google-signin/google-signin")["statusCodes"];
};

let _gsi: GoogleSigninModule | null = null;
let _gsiChecked = false;

function getGoogleSignin(): GoogleSigninModule | null {
  if (!_gsiChecked) {
    _gsiChecked = true;
    // Only attempt require() in dev client or production builds
    // where the native module is actually linked
    if (!isExpoGo) {
      try {
        const mod = require("@react-native-google-signin/google-signin");
        if (mod?.GoogleSignin) _gsi = mod;
      } catch {
        // Native module not linked in this build
      }
    }
  }
  return _gsi;
}

WebBrowser.maybeCompleteAuthSession();

const IOS_CLIENT_ID = env.GOOGLE_IOS_CLIENT_ID;
const WEB_CLIENT_ID = env.GOOGLE_WEB_CLIENT_ID;
// drive.appdata = a hidden, app-private folder in the user's Google Drive.
// Used for cloud backups; invisible in the Drive UI, no extra permission
// prompts beyond what the user sees today, and it's per-app so other apps
// can't read it. Adding the scope here means the user re-consents once on
// next sign-in (or on first backup if we trigger an incremental auth).
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.appdata",
];

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
  if (isAndroid) {
    const gsi = getGoogleSignin();
    if (!gsi) return null;
    try {
      gsi.GoogleSignin.configure({
        webClientId: WEB_CLIENT_ID,
        offlineAccess: true,
        scopes: SCOPES,
      });
      const tokens = await gsi.GoogleSignin.getTokens();
      return tokens.accessToken;
    } catch {
      return null;
    }
  }

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

  if (!refreshToken) return null;

  try {
    const tokenResult = await AuthSession.refreshAsync(
      {
        clientId: IOS_CLIENT_ID,
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
    native: `${BUNDLE_ID}:/${OAUTH_REDIRECT_PATH}`,
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

  const signInAndroid = async (): Promise<boolean> => {
    const gsi = getGoogleSignin();
    if (!gsi) return false;
    try {
      gsi.GoogleSignin.configure({
        webClientId: WEB_CLIENT_ID,
        offlineAccess: true,
        scopes: SCOPES,
      });
      await gsi.GoogleSignin.hasPlayServices();
      await gsi.GoogleSignin.signIn();
      const tokens = await gsi.GoogleSignin.getTokens();
      if (!tokens.accessToken) return false;

      await SecureStore.setItemAsync(
        SECURE_STORE_KEYS.ACCESS_TOKEN,
        tokens.accessToken,
      );
      return true;
    } catch (error: unknown) {
      // SAFETY: the Google Sign-In SDK rejects with its native error object,
      // which carries a string `code` identifying the failure reason.
      const err = error as { code?: string };
      if (err.code === gsi.statusCodes.SIGN_IN_CANCELLED) return false;
      if (err.code === gsi.statusCodes.IN_PROGRESS) return false;
      throw error;
    }
  };

  const signInIOS = async (): Promise<boolean> => {
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

  const signIn = isAndroid ? signInAndroid : signInIOS;

  const signOut = async () => {
    if (isAndroid) {
      const gsi = getGoogleSignin();
      if (gsi) {
        try {
          await gsi.GoogleSignin.signOut();
        } catch {
          // Best-effort — token deletion below proceeds regardless.
        }
      }
    }
    await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN);
    await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
    await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.TOKEN_EXPIRY);
  };

  const isConnected = async (): Promise<boolean> => {
    if (isAndroid) {
      const gsi = getGoogleSignin();
      if (gsi) return gsi.GoogleSignin.getCurrentUser() !== null;
      return false;
    }
    const token = await SecureStore.getItemAsync(
      SECURE_STORE_KEYS.REFRESH_TOKEN,
    );
    return !!token;
  };

  return { signIn, signOut, getValidAccessToken, isConnected, request };
}
