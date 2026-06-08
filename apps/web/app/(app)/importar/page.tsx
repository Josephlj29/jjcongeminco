"use client";

/**
 * app/(app)/importar/page.tsx — Importación masiva de productos
 *
 * Sube un CSV vía multipart al endpoint /api/importaciones/productos.
 * Solo accesible por rol admin (el backend valida, pero la UI también avisa).
 */
import { useRef, useState } from "react";
import { Upload, FileText, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ResultadoImportacion {
  cantidadFilas: number;
  cantidadCorrectas: number;
  cantidadErrores: number;
  errores: Array<{ fila: number; error: string }>;
}

export default function ImportarPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [archivoSeleccionado, setArchivoSeleccionado] = useState<File | null>(
    null
  );
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [importando, setImportando] = useState(false);

  const handleArchivoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setArchivoSeleccionado(file);
    setResultado(null);
  };

  const handleImportar = async () => {
    if (!archivoSeleccionado) return;
    setImportando(true);

    try {
      const formData = new FormData();
      formData.append("archivo", archivoSeleccionado);

      const res = await fetch("/api/importaciones/productos", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `Error HTTP ${res.status}`);
      }

      const data = (await res.json()) as ResultadoImportacion;
      setResultado(data);

      if (data.cantidadErrores === 0) {
        toast.success(
          `${data.cantidadCorrectas} producto(s) importados correctamente`
        );
      } else {
        toast.warning(
          `${data.cantidadCorrectas} importados, ${data.cantidadErrores} con errores`
        );
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImportando(false);
    }
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Importar productos
        </h1>
        <p className="text-muted-foreground">
          Subí un archivo CSV para cargar productos en masa. Solo disponible para
          administradores.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Seleccionar archivo CSV</CardTitle>
          <CardDescription>
            El archivo debe tener las columnas: Sku, Nombre, IdCategoria,
            IdUnidadMedida, StockMinimo (opcional: CodigoBarra).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Zona de carga */}
          <div
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 px-6 py-10 cursor-pointer hover:border-muted-foreground/50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {archivoSeleccionado ? (
                <span className="flex items-center gap-2 font-medium text-foreground">
                  <FileText className="h-4 w-4" />
                  {archivoSeleccionado.name}
                </span>
              ) : (
                "Hacé clic para seleccionar un archivo .csv"
              )}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleArchivoChange}
            />
          </div>

          <Button
            onClick={handleImportar}
            disabled={!archivoSeleccionado || importando}
            className="w-full"
          >
            {importando ? "Importando..." : "Importar productos"}
          </Button>
        </CardContent>
      </Card>

      {/* Resultado */}
      {resultado && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {resultado.cantidadErrores === 0 ? (
                <CheckCircle className="h-5 w-5 text-emerald-500" />
              ) : (
                <XCircle className="h-5 w-5 text-amber-500" />
              )}
              Resultado de la importación
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Badge variant="default">
                {resultado.cantidadCorrectas} insertados
              </Badge>
              {resultado.cantidadErrores > 0 && (
                <Badge variant="warning">
                  {resultado.cantidadErrores} errores
                </Badge>
              )}
            </div>

            {resultado.errores.length > 0 && (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Fila</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resultado.errores.map((err, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">
                          {err.fila}
                        </TableCell>
                        <TableCell className="text-xs text-destructive">
                          {err.error}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
