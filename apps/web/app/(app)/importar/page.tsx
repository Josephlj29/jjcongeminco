"use client";

/**
 * app/(app)/importar/page.tsx — Importación masiva desde Excel (.xlsx)
 *
 * Dos objetivos en pestañas:
 *   - Productos: crea/actualiza catálogo (códigos naturales + tipos de equipo).
 *   - Saldos:    existencia inicial o recuento (ajuste por diferencia).
 *
 * El .xlsx se parsea en el cliente (SheetJS) y se envía como JSON. La validación
 * de negocio y la escritura atómica las hace la BD; acá mostramos el reporte por
 * fila. Solo admin (el backend lo exige; la UI también gatea).
 */
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  Download,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { puede, type RoleCode, type ReporteImportacion } from "@congeminco/shared";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCategorias,
  useUnidades,
  useUbicaciones,
} from "@/hooks/useCatalogo";
import { useTiposEquipo } from "@/hooks/useTiposEquipo";
import {
  leerFilasExcel,
  descargarPlantillaExcel,
  celdaABool,
  celdaANumero,
  celdaALista,
} from "@/lib/xlsx-cliente";

function useRolActual() {
  return useQuery({
    queryKey: ["yo"],
    queryFn: async () => {
      const res = await fetch("/api/yo");
      if (!res.ok) throw new Error("Sin sesión");
      return res.json() as Promise<{ rol: RoleCode }>;
    },
  });
}

/* ---------- piezas compartidas ---------- */

function ZonaArchivo({
  archivo,
  onSelect,
}: {
  archivo: File | null;
  onSelect: (f: File | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 px-6 py-10 cursor-pointer hover:border-muted-foreground/50 transition-colors"
      onClick={() => ref.current?.click()}
    >
      {archivo ? (
        <span className="flex items-center gap-2 font-medium text-foreground">
          <FileSpreadsheet className="h-4 w-4" />
          {archivo.name}
        </span>
      ) : (
        <>
          <Upload className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Haz clic para seleccionar un archivo .xlsx
          </p>
        </>
      )}
      <input
        ref={ref}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

function ResultadoCard({ reporte }: { reporte: ReporteImportacion }) {
  const ok = reporte.cantidadErrores === 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {ok ? (
            <CheckCircle className="h-5 w-5 text-emerald-500" />
          ) : (
            <XCircle className="h-5 w-5 text-amber-500" />
          )}
          Resultado
        </CardTitle>
        <CardDescription>
          {ok
            ? "Todo se aplicó correctamente."
            : "No se aplicó nada: es todo-o-nada. Corrige los errores y vuelve a subir."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{reporte.cantidadFilas} filas</Badge>
          {reporte.creados > 0 && (
            <Badge variant="success">{reporte.creados} creados</Badge>
          )}
          {reporte.actualizados > 0 && (
            <Badge variant="default">{reporte.actualizados} actualizados</Badge>
          )}
          {reporte.cantidadErrores > 0 && (
            <Badge variant="destructive">
              {reporte.cantidadErrores} errores
            </Badge>
          )}
        </div>

        {reporte.errores.length > 0 && (
          <div className="rounded-md border max-h-96 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Fila</TableHead>
                  <TableHead className="w-36">Columna</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reporte.errores.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{e.fila}</TableCell>
                    <TableCell className="text-xs">{e.columna}</TableCell>
                    <TableCell className="text-xs text-destructive">
                      {e.error}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Lista compacta de códigos válidos de un catálogo (ayuda al armar el Excel). */
function CodigosAyuda({
  titulo,
  codigos,
}: {
  titulo: string;
  codigos: string[];
}) {
  if (!codigos.length) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      <div className="flex flex-wrap gap-1">
        {codigos.map((c) => (
          <Badge key={c} variant="outline" className="font-mono text-[10px]">
            {c}
          </Badge>
        ))}
      </div>
    </div>
  );
}

/* ---------- pestaña: productos ---------- */

function TabProductos() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [modo, setModo] = useState<"crear" | "upsert">("crear");
  const [reporte, setReporte] = useState<ReporteImportacion | null>(null);
  const [cargando, setCargando] = useState(false);

  const { data: categorias } = useCategorias();
  const { data: unidades } = useUnidades();
  const { data: tipos } = useTiposEquipo();

  const plantilla = () =>
    descargarPlantillaExcel(
      "plantilla-productos",
      [
        "Sku",
        "Nombre",
        "CodigoCategoria",
        "CodigoUnidad",
        "EsGeneral",
        "TiposEquipo",
        "StockMinimo",
        "CodigoBarra",
        "CodigoProductoProveedor",
      ],
      [
        {
          Sku: "ACE-001",
          Nombre: "Aceite 15W40 x1L",
          CodigoCategoria: "CAT-ACEITE",
          CodigoUnidad: "LT",
          EsGeneral: "no",
          TiposEquipo: "CAMION;GRUA",
          StockMinimo: 10,
          CodigoBarra: "",
          CodigoProductoProveedor: "",
        },
        {
          Sku: "GRA-001",
          Nombre: "Grasa multipropósito",
          CodigoCategoria: "CAT-GRASA",
          CodigoUnidad: "KG",
          EsGeneral: "sí",
          TiposEquipo: "",
          StockMinimo: 5,
          CodigoBarra: "",
          CodigoProductoProveedor: "",
        },
      ]
    );

  const importar = async () => {
    if (!archivo) return;
    setCargando(true);
    setReporte(null);
    try {
      const filas = await leerFilasExcel(archivo);
      if (!filas.length) {
        toast.error("El archivo no tiene filas.");
        return;
      }
      const Filas = filas.map((r, i) => ({
        Fila: i + 2, // +1 índice, +1 encabezado
        Sku: String(r.Sku ?? "").trim(),
        Nombre: String(r.Nombre ?? "").trim(),
        CodigoCategoria: String(r.CodigoCategoria ?? "").trim(),
        CodigoUnidad: String(r.CodigoUnidad ?? "").trim(),
        EsGeneral: celdaABool(r.EsGeneral),
        TiposEquipo: celdaALista(r.TiposEquipo),
        StockMinimo: celdaANumero(r.StockMinimo) ?? undefined,
        CodigoBarra: String(r.CodigoBarra ?? "").trim() || undefined,
        CodigoProductoProveedor:
          String(r.CodigoProductoProveedor ?? "").trim() || undefined,
      }));

      const res = await fetch("/api/importaciones/productos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Modo: modo, Filas, NombreArchivo: archivo.name }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Error HTTP ${res.status}`);
      }
      const data = (await res.json()) as ReporteImportacion;
      setReporte(data);
      if (data.cantidadErrores === 0) {
        toast.success(
          `${data.creados} creados, ${data.actualizados} actualizados.`
        );
      } else {
        toast.warning(
          `${data.cantidadErrores} errores — no se aplicó nada.`
        );
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Importar productos</CardTitle>
          <CardDescription>
            Columnas: Sku, Nombre, CodigoCategoria, CodigoUnidad, EsGeneral
            (sí/no), TiposEquipo (códigos separados por “;”), StockMinimo,
            CodigoBarra, CodigoProductoProveedor. Un producto es general
            <strong> o </strong> tiene ≥1 tipo de equipo, nunca ambos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="space-y-1">
              <Label>Si el SKU ya existe</Label>
              <Select
                value={modo}
                onValueChange={(v) => setModo(v as "crear" | "upsert")}
              >
                <SelectTrigger className="sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="crear">
                    Solo crear (salta los existentes)
                  </SelectItem>
                  <SelectItem value="upsert">
                    Crear y actualizar existentes
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={plantilla}>
              <Download className="mr-1 h-3.5 w-3.5" />
              Descargar plantilla
            </Button>
          </div>

          <ZonaArchivo archivo={archivo} onSelect={(f) => {
            setArchivo(f);
            setReporte(null);
          }} />

          <Button
            onClick={importar}
            disabled={!archivo || cargando}
            className="w-full"
          >
            {cargando ? "Importando..." : "Importar productos"}
          </Button>

          <div className="grid gap-3 sm:grid-cols-3 pt-2">
            <CodigosAyuda
              titulo="Categorías"
              codigos={(categorias ?? []).map((c) => c.Codigo)}
            />
            <CodigosAyuda
              titulo="Unidades"
              codigos={(unidades ?? []).map((u) => u.Codigo)}
            />
            <CodigosAyuda
              titulo="Tipos de equipo"
              codigos={(tipos ?? []).map((t) => t.Codigo)}
            />
          </div>
        </CardContent>
      </Card>

      {reporte && <ResultadoCard reporte={reporte} />}
    </div>
  );
}

/* ---------- pestaña: saldos ---------- */

function TabSaldos() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [modo, setModo] = useState<"inicial" | "recuento">("inicial");
  const [fecha, setFecha] = useState("");
  const [reporte, setReporte] = useState<ReporteImportacion | null>(null);
  const [cargando, setCargando] = useState(false);

  const { data: ubicaciones } = useUbicaciones();

  const plantilla = () =>
    descargarPlantillaExcel(
      "plantilla-saldos",
      ["CodigoUbicacion", "Sku", "Cantidad", "CostoUnitario"],
      [
        { CodigoUbicacion: "AREQUIPA", Sku: "ACE-001", Cantidad: 100, CostoUnitario: 25.5 },
        { CodigoUbicacion: "AREQUIPA", Sku: "GRA-001", Cantidad: 40, CostoUnitario: 18 },
      ]
    );

  const importar = async () => {
    if (!archivo) return;
    if (!fecha) {
      toast.error("Indica la fecha de corte del inventario.");
      return;
    }
    setCargando(true);
    setReporte(null);
    try {
      const filas = await leerFilasExcel(archivo);
      if (!filas.length) {
        toast.error("El archivo no tiene filas.");
        return;
      }
      const Filas = filas.map((r, i) => ({
        Fila: i + 2,
        CodigoUbicacion: String(r.CodigoUbicacion ?? "").trim(),
        Sku: String(r.Sku ?? "").trim(),
        Cantidad: celdaANumero(r.Cantidad),
        CostoUnitario:
          r.CostoUnitario === "" || r.CostoUnitario == null
            ? undefined
            : celdaANumero(r.CostoUnitario),
      }));

      const res = await fetch("/api/importaciones/saldos-iniciales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Modo: modo,
          FechaDocumento: fecha,
          Filas,
          NombreArchivo: archivo.name,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Error HTTP ${res.status}`);
      }
      const data = (await res.json()) as ReporteImportacion;
      setReporte(data);
      if (data.cantidadErrores === 0) {
        toast.success(
          `${data.cantidadCorrectas} líneas aplicadas en ${data.creados} documento(s).`
        );
      } else {
        toast.warning(`${data.cantidadErrores} errores — no se aplicó nada.`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Importar saldos</CardTitle>
          <CardDescription>
            Columnas: CodigoUbicacion, Sku, Cantidad, CostoUnitario
            (recomendado para valorizar). Los SKU y ubicaciones deben existir.
            <strong> Inicial</strong> crea existencias desde cero;{" "}
            <strong>recuento</strong> ajusta contra el saldo vigente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="space-y-1">
              <Label>Modo</Label>
              <Select
                value={modo}
                onValueChange={(v) => setModo(v as "inicial" | "recuento")}
              >
                <SelectTrigger className="sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inicial">
                    Existencia inicial (desde cero)
                  </SelectItem>
                  <SelectItem value="recuento">
                    Recuento (ajusta diferencia)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Fecha de corte</Label>
              <Input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="sm:w-44"
              />
            </div>
            <Button variant="outline" size="sm" onClick={plantilla}>
              <Download className="mr-1 h-3.5 w-3.5" />
              Descargar plantilla
            </Button>
          </div>

          <ZonaArchivo archivo={archivo} onSelect={(f) => {
            setArchivo(f);
            setReporte(null);
          }} />

          <Button
            onClick={importar}
            disabled={!archivo || cargando}
            className="w-full"
          >
            {cargando ? "Importando..." : "Importar saldos"}
          </Button>

          <div className="pt-2">
            <CodigosAyuda
              titulo="Ubicaciones"
              codigos={(ubicaciones ?? []).map((u) => u.Codigo)}
            />
          </div>
        </CardContent>
      </Card>

      {reporte && <ResultadoCard reporte={reporte} />}
    </div>
  );
}

/* ---------- página ---------- */

export default function ImportarPage() {
  const { data: yo } = useRolActual();
  const esAdmin = puede(yo?.rol ?? null, "catalogoAdmin");

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Importar</h1>
        <p className="text-muted-foreground">
          Carga masiva desde Excel (.xlsx). Validación todo-o-nada: si una fila
          falla, no se aplica nada y verás el detalle por fila.
        </p>
      </div>

      {yo && !esAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Sin acceso
            </CardTitle>
            <CardDescription>
              La importación masiva está reservada a administradores.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Tabs defaultValue="productos" className="space-y-6">
          <TabsList>
            <TabsTrigger value="productos">Productos</TabsTrigger>
            <TabsTrigger value="saldos">Saldos</TabsTrigger>
          </TabsList>
          <TabsContent value="productos">
            <TabProductos />
          </TabsContent>
          <TabsContent value="saldos">
            <TabSaldos />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
