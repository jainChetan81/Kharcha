import Svg, { Circle, Line, Polygon, Text as SvgText } from "react-native-svg";

type RadarChartProps = {
  data: number[];
  labels: string[];
  size?: number;
  maxValue?: number;
  gridLevels?: number;
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
  gridColor?: string;
  labelColor?: string;
  labelFontSize?: number;
};

export function RadarChart({
  data,
  labels,
  size = 240,
  maxValue,
  gridLevels = 4,
  fillColor = "#7c3aed",
  fillOpacity = 0.3,
  strokeColor = "#7c3aed",
  strokeWidth = 2,
  gridColor = "#2a2a2a",
  labelColor = "#888888",
  labelFontSize = 11,
}: RadarChartProps) {
  const n = data.length;
  if (n < 3) return null;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 30;
  const max = maxValue ?? Math.max(...data) * 1.15;
  const angleStep = (2 * Math.PI) / n;

  function polarToXY(angle: number, r: number) {
    return {
      x: cx + r * Math.sin(angle),
      y: cy - r * Math.cos(angle),
    };
  }

  const gridPolygons = Array.from({ length: gridLevels }, (_, level) => {
    const r = (radius * (level + 1)) / gridLevels;
    const points = Array.from({ length: n }, (_, i) => {
      const p = polarToXY(i * angleStep, r);
      return `${p.x},${p.y}`;
    }).join(" ");
    return (
      <Polygon
        key={`grid-${level}`}
        points={points}
        fill="transparent"
        stroke={gridColor}
        strokeWidth={0.5}
      />
    );
  });

  const axes = Array.from({ length: n }, (_, i) => {
    const p = polarToXY(i * angleStep, radius);
    return (
      <Line
        key={`axis-${i}`}
        x1={cx}
        y1={cy}
        x2={p.x}
        y2={p.y}
        stroke={gridColor}
        strokeWidth={0.5}
      />
    );
  });

  const dataPoints = data.map((value, i) => {
    const r = max > 0 ? (value / max) * radius : 0;
    return polarToXY(i * angleStep, r);
  });
  const dataPolygon = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  const labelElements = labels.map((label, i) => {
    const labelRadius = radius + 16;
    const p = polarToXY(i * angleStep, labelRadius);
    const truncated = label.length > 12 ? `${label.slice(0, 11)}…` : label;
    return (
      <SvgText
        key={`label-${i}`}
        x={p.x}
        y={p.y}
        fontSize={labelFontSize}
        fill={labelColor}
        textAnchor="middle"
        alignmentBaseline="central"
      >
        {truncated}
      </SvgText>
    );
  });

  const dots = dataPoints.map((p, i) => (
    <Circle key={`dot-${i}`} cx={p.x} cy={p.y} r={3} fill={strokeColor} />
  ));

  return (
    <Svg width={size} height={size}>
      {gridPolygons}
      {axes}
      <Polygon
        points={dataPolygon}
        fill={fillColor}
        fillOpacity={fillOpacity}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
      />
      {dots}
      {labelElements}
    </Svg>
  );
}
