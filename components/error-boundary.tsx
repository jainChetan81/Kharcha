import { router } from "expo-router";
import { AlertTriangle } from "lucide-react-native";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { SCREENS } from "@/lib/constants";
import { ERROR_TYPE, logFirebaseError } from "@/lib/firebase";

export function ScreenError({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center bg-background px-8">
      <Icon as={AlertTriangle} className="mb-4 size-12 text-negative-text" />
      <Text className="mb-2 text-base font-bold text-foreground">
        Something went wrong
      </Text>
      <Text className="mb-6 text-center text-sm text-muted-foreground">
        {error.message}
      </Text>
      <Pressable
        onPress={retry}
        className="mb-3 w-full items-center rounded-2xl bg-primary py-3"
      >
        <Text className="text-sm font-semibold text-primary-foreground">
          Try Again
        </Text>
      </Pressable>
      <Pressable
        onPress={() => router.replace(SCREENS.HOME)}
        className="w-full items-center rounded-2xl border border-border py-3"
      >
        <Text className="text-sm font-medium text-muted-foreground">
          Go Home
        </Text>
      </Pressable>
    </View>
  );
}

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
  onDismiss?: () => void;
  name?: string;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ComponentErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    logFirebaseError(error, {
      error_type: ERROR_TYPE.UI,
      boundary: this.props.name ?? "unknown",
    });
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <View className="items-center justify-center px-6 py-8">
          <Icon as={AlertTriangle} className="mb-2 size-8 text-negative-text" />
          <Text className="mb-1 text-sm font-semibold text-foreground">
            Something went wrong
          </Text>
          <Text className="mb-4 text-center text-xs text-muted-foreground">
            {this.state.error.message}
          </Text>
          <View className="flex-row gap-3">
            {this.props.onDismiss && (
              <Pressable
                onPress={this.props.onDismiss}
                className="rounded-xl border border-border px-4 py-2"
              >
                <Text className="text-xs font-medium text-muted-foreground">
                  Dismiss
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={this.reset}
              className="rounded-xl bg-primary px-4 py-2"
            >
              <Text className="text-xs font-semibold text-primary-foreground">
                Retry
              </Text>
            </Pressable>
          </View>
        </View>
      );
    }
    return this.props.children;
  }
}
