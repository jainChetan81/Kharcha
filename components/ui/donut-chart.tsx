import type { ReactNode } from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";

type Segment = { value: number; color: string };

type DonutChartProps = {
  data: Segment[];
  radius?: number;
  innerRadius?: number;
  backgroundColor?: string;
  strokeSeparator?: string;
  strokeSeparatorWidth?: number;
  centerLabel?: ReactNode;
};

export function DonutChart({
  data,
  radius = 90,
  innerRadius = 62,
  backgroundColor = "#0a0a0a",
  strokeSeparator = "#0a0a0a",
  strokeSeparatorWidth = 2,
  centerLabel,
}: DonutChartProps) {
  const size = radius * 2;
  const cx = radius;
  const cy = radius;
  const strokeWidth = radius - innerRadius;
  const chartRadius = innerRadius + strokeWidth / 2;
  const circumference = 2 * Math.PI * chartRadius;

  const total = data.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) {
    return (
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <Svg width={size} height={size}>
          <Circle
            cx={cx}
            cy={cy}
            r={chartRadius}
            stroke={backgroundColor}
            strokeWidth={strokeWidth}
            fill="none"
          />
        </Svg>
        {centerLabel && (
          <View
            style={{
              position: "absolute",
              width: innerRadius * 2,
              height: innerRadius * 2,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {centerLabel}
          </View>
        )}
      </View>
    );
  }

  let offset = 0;
  const arcs = data.map((segment, i) => {
    const pct = segment.value / total;
    const dashLength = pct * circumference;
    const gapForSeparator =
      data.length > 1 ? strokeSeparatorWidth : 0;
    const arc = (
      <Circle
        key={`arc-${i}`}
        cx={cx}
        cy={cy}
        r={chartRadius}
        stroke={segment.color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={`${Math.max(dashLength - gapForSeparator, 0)} ${circumference}`}
        strokeDashoffset={-offset}
        strokeLinecap="butt"
        rotation={-90}
        origin={`${cx}, ${cy}`}
      />
    );
    offset += dashLength;
    return arc;
  });

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Circle
          cx={cx}
          cy={cy}
          r={chartRadius}
          stroke={strokeSeparator}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {arcs}
      </Svg>
      {centerLabel && (
        <View
          style={{
            position: "absolute",
            width: innerRadius * 2,
            height: innerRadius * 2,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {centerLabel}
        </View>
      )}
    </View>
  );
}
