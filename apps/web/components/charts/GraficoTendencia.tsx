"use client";

import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import { useMemo } from "react";

interface DatoTendencia {
  fecha: string;
  entradas: number;
  salidas: number;
}

interface GraficoTendenciaProps {
  datos: DatoTendencia[];
  className?: string;
  height?: number;
}

export function GraficoTendencia({ datos, className, height = 300 }: GraficoTendenciaProps) {
  const option = useMemo<EChartsOption>(() => ({
    xAxis: {
      type: "category",
      data: datos.map((d) => d.fecha),
      boundaryGap: false,
    },
    yAxis: { type: "value" },
    series: [
      {
        name: "Entradas",
        type: "line",
        smooth: true,
        areaStyle: { opacity: 0.15 },
        data: datos.map((d) => d.entradas),
      },
      {
        name: "Salidas",
        type: "line",
        smooth: true,
        areaStyle: { opacity: 0.15 },
        data: datos.map((d) => d.salidas),
      },
    ],
  }), [datos]);

  return <EChart option={option} className={className} height={height} />;
}
