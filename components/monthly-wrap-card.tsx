import { format, parseISO, subMonths } from "date-fns";
import { useEffect, useRef } from "react";
import { Animated, Modal, Pressable } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useCurrency } from "@/hooks/use-currency";
import { useInsightsData } from "@/hooks/use-insights-data";
import { WrapStats } from "./wrap-stats";

type Props = {
  yearMonth: string;
  visible: boolean;
  onDismiss: () => void;
};

export function MonthlyWrapCard({ yearMonth, visible, onDismiss }: Props) {
  const { format: fmt } = useCurrency();
  const monthDate = parseISO(`${yearMonth}-01`);
  const monthLabel = format(monthDate, "MMMM yyyy");
  const prevMonthLabel = format(subMonths(monthDate, 1), "MMMM");
  const prevMonth = format(subMonths(monthDate, 1), "yyyy-MM");
  const data = useInsightsData(yearMonth, prevMonth);

  const backdrop = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (!visible) return;
    Animated.parallel([
      Animated.timing(backdrop, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 7,
        tension: 70,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, backdrop, scale]);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onDismiss}
    >
      <Animated.View
        className="flex-1 items-center justify-center bg-black/60 px-6"
        style={{ opacity: backdrop }}
      >
        <Pressable
          className="absolute inset-0"
          onPress={onDismiss}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <Animated.View
          className="w-full rounded-2xl border border-border bg-card p-6"
          style={{ transform: [{ scale }] }}
        >
          <WrapStats
            data={data}
            fmt={fmt}
            monthLabel={monthLabel}
            prevMonthLabel={prevMonthLabel}
          />
          <Button className="mt-6" onPress={onDismiss}>
            <Text>Got it</Text>
          </Button>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
