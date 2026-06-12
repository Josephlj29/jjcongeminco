"use client";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import type { EChartsOption } from "echarts";
import { useMemo } from "react";

// Dynamic import with ssr:false — required for Cloudflare Workers compatibility
const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

const PALETTE_LIGHT = [
  "hsl(22, 90%, 50%)",
  "hsl(192, 44%, 40%)",
  "hsl(220, 14%, 50%)",
  "hsl(38, 92%, 50%)",
  "hsl(210, 30%, 55%)",
];
const PALETTE_DARK = [
  "hsl(24, 92%, 56%)",
  "hsl(192, 44%, 50%)",
  "hsl(220, 14%, 62%)",
  "hsl(38, 92%, 56%)",
  "hsl(210, 36%, 62%)",
];

interface EChartProps {
  option: EChartsOption;
  className?: string;
  height?: number;
}

export function EChart({ option, className, height = 300 }: EChartProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const mergedOption = useMemo<EChartsOption>(() => {
    const palette = isDark ? PALETTE_DARK : PALETTE_LIGHT;
    const textColor = isDark ? "hsl(220, 14%, 92%)" : "hsl(220, 26%, 14%)";
    const gridLineColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

    return {
      color: palette,
      textStyle: { color: textColor, fontFamily: "var(--font-geist-sans, sans-serif)" },
      tooltip: {
        trigger: "axis",
        backgroundColor: isDark ? "hsl(220, 24%, 16%)" : "hsl(0, 0%, 100%)",
        borderColor: isDark ? "hsl(220, 14%, 28%)" : "hsl(220, 13%, 91%)",
        textStyle: { color: textColor },
      },
      legend: {
        textStyle: { color: textColor },
        bottom: 0,
      },
      grid: {
        top: 16,
        right: 16,
        bottom: 40,
        left: 16,
        containLabel: true,
      },
      xAxis: {
        axisLine: { lineStyle: { color: gridLineColor } },
        axisTick: { show: false },
        axisLabel: { color: textColor },
        splitLine: { lineStyle: { color: gridLineColor } },
      },
      yAxis: {
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: textColor },
        splitLine: { lineStyle: { color: gridLineColor } },
      },
      ...option,
    };
  }, [option, isDark]);

  return (
    <div className={className} style={{ width: "100%", height }}>
      <ReactECharts
        option={mergedOption}
        style={{ width: "100%", height: "100%" }}
        notMerge
        lazyUpdate
      />
    </div>
  );
}
