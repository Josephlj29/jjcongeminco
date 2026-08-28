"use client";

import type { EChartsOption } from "echarts";
import { useMemo } from "react";
import { EChart } from "@/components/charts/EChart";

interface SparklineProps {
  datos: number[];
  height?: number;
  className?: string;
}

/** Mini línea sin ejes ni tooltip para el KPI hero (serie única, chart-1). */
export function Sparkline({ datos, height = 44, className }: SparklineProps) {
  const option = useMemo<EChartsOption>(
    () => ({
      grid: { top: 4, right: 4, bottom: 4, left: 4, containLabel: false },
      tooltip: { show: false },
      xAxis: {
        type: "category",
        show: false,
        boundaryGap: false,
        data: datos.map((_, i) => i),
      },
      yAxis: { type: "value", show: false, min: 0 },
      series: [
        {
          type: "line",
          data: datos,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2, color: "hsl(var(--chart-1))" },
          areaStyle: { opacity: 0.15, color: "hsl(var(--chart-1))" },
        },
      ],
    }),
    [datos],
  );

  if (!datos.length) return null;
  return <EChart option={option} className={className} height={height} />;
}
