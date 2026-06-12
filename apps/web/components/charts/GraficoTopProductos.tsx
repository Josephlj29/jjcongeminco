"use client";

import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import { useMemo } from "react";

interface DatoProducto {
  nombre: string;
  cantidad: number;
}

interface GraficoTopProductosProps {
  datos: DatoProducto[];
  className?: string;
  height?: number;
}

export function GraficoTopProductos({ datos, className, height = 300 }: GraficoTopProductosProps) {
  const option = useMemo<EChartsOption>(() => ({
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { show: false },
    grid: { top: 8, right: 16, bottom: 8, left: 8, containLabel: true },
    xAxis: { type: "value" },
    yAxis: {
      type: "category",
      data: datos.map((d) => d.nombre),
      axisLabel: {
        width: 120,
        overflow: "truncate",
      },
    },
    series: [
      {
        name: "Cantidad",
        type: "bar",
        data: datos.map((d) => d.cantidad),
        barMaxWidth: 32,
      },
    ],
  }), [datos]);

  return <EChart option={option} className={className} height={height} />;
}
