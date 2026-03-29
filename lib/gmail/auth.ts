import * as Google from "expo-auth-session/providers/google";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "";
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

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

	console.log("[Gmail] Stored tokens — access:", !!accessToken, "refresh:", !!refreshToken, "expiry:", expiry);

	if (!accessToken) return null;

	if (expiry && Date.now() < parseInt(expiry, 10) - 60000) {
		console.log("[Gmail] Access token still valid");
		return accessToken;
	}

	if (!refreshToken) {
		console.log("[Gmail] No refresh token, cannot refresh");
		return null;
	}

	console.log("[Gmail] Token expired, refreshing...");
	const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: WEB_CLIENT_ID,
			refresh_token: refreshToken,
			grant_type: "refresh_token",
		}).toString(),
	});

	const refreshed = await refreshResponse.json();
	console.log("[Gmail] Refresh result:", refreshed.error ?? "success");
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
	const [request, _response, promptAsync] = Google.useAuthRequest({
		iosClientId: IOS_CLIENT_ID,
		webClientId: WEB_CLIENT_ID,
		scopes: SCOPES,
		extraParams: { access_type: "offline", prompt: "consent" },
	});

	const signIn = async () => {
		console.log("[Gmail] signIn called");
		console.log("[Gmail] iOS CLIENT_ID:", IOS_CLIENT_ID ? `${IOS_CLIENT_ID.slice(0, 20)}...` : "MISSING");
		console.log("[Gmail] Web CLIENT_ID:", WEB_CLIENT_ID ? `${WEB_CLIENT_ID.slice(0, 20)}...` : "MISSING");
		console.log("[Gmail] redirectUri:", request?.redirectUri);
		console.log("[Gmail] request ready:", !!request);
		const result = await promptAsync();
		console.log("[Gmail] promptAsync result:", JSON.stringify(result, null, 2));
		if (result.type !== "success") return false;

		const { code } = result.params;
		console.log("[Gmail] Got auth code, exchanging for tokens...");

		// exchange code for tokens using web client ID
		const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				code,
				client_id: WEB_CLIENT_ID,
				grant_type: "authorization_code",
				redirect_uri: request?.redirectUri ?? "",
				code_verifier: request?.codeVerifier ?? "",
			}).toString(),
		});

		const tokens = await tokenResponse.json();
		console.log("[Gmail] Token exchange result:", tokens.error ?? "success");

		if (!tokens.access_token) {
			console.log("[Gmail] No access token in response:", JSON.stringify(tokens));
			return false;
		}

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

		console.log("[Gmail] Tokens stored successfully");
		return true;
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
