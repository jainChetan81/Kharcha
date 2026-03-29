import { formatDistanceToNow } from "date-fns";
import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import Toast from "react-native-toast-message";
import { ScreenError } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { TOAST_TYPE } from "@/lib/constants";
import { deleteConfig, getConfig, updateConfig } from "@/lib/db/config";
import { useGoogleAuth } from "@/lib/gmail/auth";
import { syncGmailTransactions } from "@/lib/gmail/sync";
import { cn, isIOS } from "@/lib/utils";

function SectionHeader({ title }: { title: string }) {
	return (
		<Text className="mb-2 mt-6 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
			{title}
		</Text>
	);
}

function InfoRow({ label, value }: { label: string; value: string }) {
	return (
		<View className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3">
			<Text className="flex-1 text-sm font-medium text-foreground">
				{label}
			</Text>
			<Text className="text-sm text-muted-foreground">{value}</Text>
		</View>
	);
}

export default function GmailSyncScreen() {
	const { signIn, signOut, isConnected, getValidAccessToken } =
		useGoogleAuth();
	const [connected, setConnected] = useState(false);
	const [email, setEmail] = useState<string | null>(null);
	const [lastSynced, setLastSynced] = useState<string | null>(null);
	const [emailsFetched, setEmailsFetched] = useState<string | null>(null);
	const [transactionsAdded, setTransactionsAdded] = useState<string | null>(
		null,
	);
	const [syncing, setSyncing] = useState(false);
	const [verifying, setVerifying] = useState(false);
	const [loading, setLoading] = useState(true);

	const loadState = useCallback(async () => {
		console.log("[GmailSync] Loading state...");
		const [isConn, synced, fetched, added] = await Promise.all([
			isConnected(),
			getConfig("gmail_last_synced_at"),
			getConfig("gmail_emails_fetched"),
			getConfig("gmail_transactions_added"),
		]);
		console.log("[GmailSync] connected:", isConn, "lastSynced:", synced, "fetched:", fetched, "added:", added);
		setConnected(isConn);
		setLastSynced(synced);
		setEmailsFetched(fetched);
		setTransactionsAdded(added);
		setLoading(false);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: loadState is stable via useCallback
	useEffect(() => {
		loadState();
	}, [loadState]);

	async function handleConnect() {
		console.log("[GmailSync] Connect button pressed");
		try {
			const success = await signIn();
			console.log("[GmailSync] signIn result:", success);
			if (success) {
				setConnected(true);
				await updateConfig("gmail_connected", "true");
				Toast.show({ type: TOAST_TYPE.SUCCESS, text1: "Gmail connected" });
			} else {
				Toast.show({
					type: TOAST_TYPE.ERROR,
					text1: "Could not connect",
					text2: "Sign in was cancelled or failed",
				});
			}
		} catch (err) {
			console.log("[GmailSync] Connect error:", err);
			Toast.show({
				type: TOAST_TYPE.ERROR,
				text1: "Connection failed",
				text2: String(err),
			});
		}
	}

	async function handleVerify() {
		console.log("[GmailSync] Verify button pressed");
		setVerifying(true);
		try {
			const token = await getValidAccessToken();
			console.log("[GmailSync] Got access token:", token ? `${token.slice(0, 20)}...` : "null");
			if (!token) {
				Toast.show({
					type: TOAST_TYPE.ERROR,
					text1: "Connection failed",
					text2: "No valid access token — try reconnecting",
				});
				return;
			}
			console.log("[GmailSync] Fetching 1 email to verify...");
			const res = await fetch(
				"https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1",
				{ headers: { Authorization: `Bearer ${token}` } },
			);
			console.log("[GmailSync] Verify API status:", res.status);
			if (!res.ok) {
				const err = await res.json();
				console.log("[GmailSync] Verify API error:", JSON.stringify(err));
				Toast.show({
					type: TOAST_TYPE.ERROR,
					text1: "Connection failed",
					text2: err.error?.message ?? "Try reconnecting",
				});
				return;
			}

			// also fetch profile to get email
			const profileRes = await fetch(
				"https://gmail.googleapis.com/gmail/v1/users/me/profile",
				{ headers: { Authorization: `Bearer ${token}` } },
			);
			if (profileRes.ok) {
				const profile = await profileRes.json();
				console.log("[GmailSync] Verified email:", profile.emailAddress);
				setEmail(profile.emailAddress);
			}

			Toast.show({ type: TOAST_TYPE.SUCCESS, text1: "Connection verified" });
		} catch (err) {
			console.log("[GmailSync] Verify error:", err);
			Toast.show({
				type: TOAST_TYPE.ERROR,
				text1: "Connection failed",
				text2: "Try reconnecting",
			});
		} finally {
			setVerifying(false);
		}
	}

	async function handleSync() {
		console.log("[GmailSync] Sync button pressed");
		setSyncing(true);
		try {
			const result = await syncGmailTransactions();
			console.log("[GmailSync] Sync result:", JSON.stringify(result));

			const newFetched = String(
				(Number(emailsFetched ?? "0")) + result.added + result.skipped + result.failed,
			);
			const newAdded = String(
				(Number(transactionsAdded ?? "0")) + result.added,
			);

			await Promise.all([
				updateConfig("gmail_emails_fetched", newFetched),
				updateConfig("gmail_transactions_added", newAdded),
			]);

			const synced = await getConfig("gmail_last_synced_at");
			setLastSynced(synced);
			setEmailsFetched(newFetched);
			setTransactionsAdded(newAdded);

			Toast.show({
				type: TOAST_TYPE.SUCCESS,
				text1: `${result.added} transaction${result.added !== 1 ? "s" : ""} added`,
				text2:
					result.skipped > 0
						? `${result.skipped} duplicates skipped`
						: undefined,
			});
		} catch (err) {
			console.log("[GmailSync] Sync error:", err);
			Toast.show({
				type: TOAST_TYPE.ERROR,
				text1: "Sync failed",
				text2: String(err),
			});
		} finally {
			setSyncing(false);
		}
	}

	async function handleDisconnect() {
		console.log("[GmailSync] Disconnect button pressed");
		await signOut();
		await Promise.all([
			deleteConfig("gmail_connected"),
			deleteConfig("gmail_last_synced_at"),
			deleteConfig("gmail_emails_fetched"),
			deleteConfig("gmail_transactions_added"),
		]);
		setConnected(false);
		setEmail(null);
		setLastSynced(null);
		setEmailsFetched(null);
		setTransactionsAdded(null);
		Toast.show({ type: TOAST_TYPE.SUCCESS, text1: "Gmail disconnected" });
	}

	return (
		<View className="flex-1 bg-background">
			<View
				className={cn(
					"flex-row items-center bg-background px-6 pb-4",
					isIOS ? "pt-[60px]" : "pt-12",
				)}
			>
				<Pressable
					onPress={() => router.back()}
					className="flex-row items-center py-1"
				>
					<Icon as={ChevronLeft} className="mr-1 size-6 text-foreground" />
					<Text className="text-lg font-bold text-foreground">Gmail Sync</Text>
				</Pressable>
			</View>

			{loading ? (
				<View className="flex-1 items-center justify-center">
					<ActivityIndicator size="large" color="#7c3aed" />
				</View>
			) : (
				<ScrollView
					showsVerticalScrollIndicator={false}
					contentContainerStyle={{ paddingBottom: 40 }}
				>
					{/* STATUS */}
					<SectionHeader title="Status" />
					<View className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3">
						<View
							className={cn(
								"mr-3 h-2.5 w-2.5 rounded-full",
								connected ? "bg-positive" : "bg-negative",
							)}
						/>
						<Text className="flex-1 text-sm font-medium text-foreground">
							{connected ? "Connected" : "Not Connected"}
						</Text>
						{email && (
							<Text className="text-sm text-muted-foreground">{email}</Text>
						)}
					</View>

					{/* NOT CONNECTED */}
					{!connected && (
						<>
							<View className="mx-5 mt-4">
								<Button
									className="h-14 rounded-2xl bg-primary"
									onPress={handleConnect}
								>
									<Text className="text-base font-semibold text-primary-foreground">
										Connect with Google
									</Text>
								</Button>
							</View>
						</>
					)}

					{/* CONNECTED — INFO */}
					{connected && (
						<>
							<SectionHeader title="Info" />
							<InfoRow
								label="Last Synced"
								value={
									lastSynced
										? `${formatDistanceToNow(new Date(lastSynced))} ago`
										: "Never"
								}
							/>
							<InfoRow
								label="Emails Fetched"
								value={emailsFetched ?? "0"}
							/>
							<InfoRow
								label="Transactions Added"
								value={transactionsAdded ?? "0"}
							/>

							{/* ACTIONS */}
							<SectionHeader title="Actions" />
							<View className="mx-5 mb-2">
								<Button
									variant="outline"
									className="h-12 rounded-xl border-[#2a2a2a]"
									onPress={handleVerify}
									disabled={verifying}
								>
									{verifying ? (
										<ActivityIndicator
											size="small"
											color="#7c3aed"
											className="mr-2"
										/>
									) : null}
									<Text className="text-sm font-medium text-foreground">
										{verifying ? "Verifying..." : "Verify Connection"}
									</Text>
								</Button>
							</View>
							<View className="mx-5 mb-2">
								<Button
									className="h-14 rounded-2xl bg-primary"
									onPress={handleSync}
									disabled={syncing}
								>
									{syncing ? (
										<ActivityIndicator
											size="small"
											color="#ffffff"
											className="mr-2"
										/>
									) : null}
									<Text className="text-base font-semibold text-primary-foreground">
										{syncing ? "Syncing..." : "Sync Now"}
									</Text>
								</Button>
							</View>
							<Pressable
								onPress={handleDisconnect}
								className="mx-5 mt-2 items-center py-3"
							>
								<Text className="text-sm font-medium text-negative">
									Disconnect
								</Text>
							</Pressable>
						</>
					)}
				</ScrollView>
			)}
		</View>
	);
}

export const ErrorBoundary = ScreenError;
