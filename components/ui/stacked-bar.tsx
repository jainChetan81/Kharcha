import { View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { COLORS } from "@/lib/constants";

export function StackedBar({
  segments,
  total,
  height = 8,
  gap = 2,
}: {
  segments: { value: number; color: string }[];
  total?: number;
  height?: number;
  gap?: number;
}) {
  const segmentSum = segments.reduce((sum, s) => sum + s.value, 0);
  const denominator = total ?? segmentSum;

  if (denominator <= 0) {
    return (
      <View
        className="w-full overflow-hidden rounded-full bg-muted"
        style={{ height }}
      />
    );
  }

  return (
    <View
      className="w-full overflow-hidden rounded-full bg-muted"
      style={{ height }}
    >
      <Svg width="100%" height={height}>
        {renderSegments(segments, denominator, height, gap)}
      </Svg>
    </View>
  );
}

function renderSegments(
  segments: { value: number; color: string }[],
  denominator: number,
  height: number,
  gap: number,
) {
  let offsetPct = 0;
  const rects = [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const widthPct = (segment.value / denominator) * 100;
    const isLast = i === segments.length - 1;
    const effectiveWidthPct = isLast ? widthPct : Math.max(widthPct - gap, 0);
    rects.push(
      <Rect
        key={`${segment.color}-${i}`}
        x={`${offsetPct}%`}
        y={0}
        width={`${effectiveWidthPct}%`}
        height={height}
        fill={segment.color || COLORS.PRIMARY}
      />,
    );
    offsetPct += widthPct;
  }
  return rects;
}
