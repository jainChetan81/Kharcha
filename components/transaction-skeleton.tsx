import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";

export function TransactionSkeleton({ count = 10 }: { count?: number }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading transactions"
    >
      {Array.from({ length: count }).map((_, i) => (
        <Animated.View
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows are static
          key={i}
          style={{ opacity }}
          className="mb-2 flex-row items-center rounded-xl bg-card p-3"
        >
          <View className="mr-3 size-10 rounded-full bg-muted" />
          <View className="flex-1">
            <View className="h-3.5 w-3/5 rounded bg-muted" />
            <View className="mt-1.5 h-3 w-2/5 rounded bg-muted" />
          </View>
          <View className="h-3.5 w-16 rounded bg-muted" />
        </Animated.View>
      ))}
    </View>
  );
}
