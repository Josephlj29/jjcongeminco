"use client";

import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import { useMemo } from "react";

interface DatoTipoDocumento {
  tipo: string;
  valor: number;
}

interface GraficoPorTipoDocumentoProps {
  datos: DatoTipoDocumento[];
  className?: string;
  height?: number;
}

export function GraficoPorTipoDocumento({ datos, className, height = 300 }: GraficoPorTipoDocumentoProps) {
  const option = useMemo<EChartsOption>(() => ({
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { show: false },
    xAxis: {
      type: "category",
      data: datos.map((d) => d.tipo),
    },
    yAxis: { type: "value" },
    series: [
      {
        name: "Valor",
        type: "bar",
        data: datos.map((d) => d.valor),
        barMaxWidth: 48,
      },
    ],
  }), [datos]);

  return <EChart option={option} className={className} height={height} />;
}
