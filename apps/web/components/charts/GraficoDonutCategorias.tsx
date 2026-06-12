"use client";

import type { EChartsOption } from "echarts";
import { useTheme } from "next-themes";
import { EChart } from "./EChart";
import { useMemo } from "react";

interface DatoDonut {
  nombre: string;
  valor: number;
}

interface GraficoDonutCategoriasProps {
  datos: DatoDonut[];
  className?: string;
  height?: number;
}

export function GraficoDonutCategorias({ datos, className, height = 300 }: GraficoDonutCategoriasProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const total = useMemo(() => datos.reduce((sum, d) => sum + d.valor, 0), [datos]);

  const option = useMemo<EChartsOption>(() => {
    const textColor = isDark ? "hsl(220, 14%, 92%)" : "hsl(220, 26%, 14%)";
    return {
      tooltip: { trigger: "item" },
      legend: { show: false },
      series: [
        {
          type: "pie",
          radius: ["45%", "70%"],
          center: ["50%", "50%"],
          data: datos.map((d) => ({ name: d.nombre, value: d.valor })),
          label: { show: false },
        },
      ],
      graphic: [
        {
          type: "text",
          left: "center",
          top: "middle",
          style: {
            text: `S/ ${total.toLocaleString("es-PE", { minimumFractionDigits: 0 })}`,
            fontSize: 14,
            fontWeight: "bold",
            fill: textColor,
          },
        },
      ],
    };
  }, [datos, total, isDark]);

  return <EChart option={option} className={className} height={height} />;
}
