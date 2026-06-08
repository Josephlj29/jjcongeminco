/**
 * app/api/importaciones/productos/route.ts
 *
 * POST /api/importaciones/productos
 *
 * Acepta multipart/form-data con campo "archivo" (CSV) o body text/csv.
 * Columnas CSV esperadas: Sku, Nombre, IdCategoria, IdUnidadMedida, StockMinimo, CodigoBarra?
 *
 * Solo accesible por rol admin.
 * Usa supabaseAdmin (service-role) para bypassear RLS en inserción masiva.
 * Registra el resultado en inv.T_Importacion usando el cliente del usuario (auditoría).
 *
 * NOTA: multipart parsing en Cloudflare Workers difiere de Node.js.
 * El runtime "nodejs" es OBLIGATORIO aquí por supabaseAdmin y formData parsing.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { autenticarRequest, respuestaError } from "@/lib/api-auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { CrearProductoSchema } from "@congeminco/shared";

interface FilaCSV {
  Sku: string;
  Nombre: string;
  IdCategoria: string;
  IdUnidadMedida: string;
  StockMinimo?: string;
  CodigoBarra?: string;
}

/** Parsea un CSV simple (sin comillas compuestas, separador coma). */
function parsearCSV(texto: string): FilaCSV[] {
  const lineas = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lineas.length < 2) return [];

  const cabecera = lineas[0].split(",").map((h) => h.trim());
  const filas: FilaCSV[] = [];

  for (let i = 1; i < lineas.length; i++) {
    const linea = lineas[i].trim();
    if (!linea) continue;

    const valores = linea.split(",").map((v) => v.trim());
    const fila: Record<string, string> = {};
    cabecera.forEach((col, idx) => {
      fila[col] = valores[idx] ?? "";
    });
    filas.push(fila as unknown as FilaCSV);
  }

  return filas;
}

export async function POST(request: NextRequest) {
  const { usuario, error } = await autenticarRequest();
  if (error) return error;

  // Solo admin puede importar masivamente
  if (usuario.rol !== "admin") {
    return respuestaError("Solo administradores pueden importar productos.", 403);
  }

  let csvTexto: string | null = null;
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return respuestaError("No se pudo procesar el formulario multipart.", 400);
    }
    const archivo = formData.get("archivo");
    if (!archivo || !(archivo instanceof Blob)) {
      return respuestaError("Se esperaba un campo 'archivo' con el CSV.", 400);
    }
    csvTexto = await archivo.text();
  } else if (
    contentType.includes("text/csv") ||
    contentType.includes("text/plain")
  ) {
    csvTexto = await request.text();
  }

  if (!csvTexto || !csvTexto.trim()) {
    return respuestaError(
      "No se recibió contenido CSV. Enviá multipart/form-data o text/csv.",
      400
    );
  }

  const filas = parsearCSV(csvTexto);
  const cantidadFilas = filas.length;
  const logErrores: Array<{ fila: number; error: string }> = [];
  const productosValidos: Array<object> = [];

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const parsed = CrearProductoSchema.safeParse({
      Sku: fila.Sku,
      Nombre: fila.Nombre,
      IdCategoria: fila.IdCategoria,
      IdUnidadMedida: fila.IdUnidadMedida,
      StockMinimo: fila.StockMinimo ? Number(fila.StockMinimo) : 0,
      CodigoBarra: fila.CodigoBarra || undefined,
      Atributos: {},
    });

    if (!parsed.success) {
      logErrores.push({
        fila: i + 2, // +1 por índice, +1 por la cabecera
        error: parsed.error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join("; "),
      });
      continue;
    }

    productosValidos.push({
      Sku: parsed.data.Sku,
      Nombre: parsed.data.Nombre,
      IdCategoria: parsed.data.IdCategoria,
      IdUnidadMedida: parsed.data.IdUnidadMedida,
      StockMinimo: parsed.data.StockMinimo,
      CodigoBarra: parsed.data.CodigoBarra ?? null,
      Atributos: parsed.data.Atributos,
    });
  }

  let cantidadCorrectas = 0;

  if (productosValidos.length > 0) {
    // Inserción masiva con service-role (bypasea RLS para operación admin)
    const supabaseAdmin = crearClienteAdmin();
    const { data: insertados, error: insertError } = await supabaseAdmin
      .schema("inv")
      .from("T_Producto")
      .insert(productosValidos)
      .select();

    if (insertError) {
      logErrores.push({ fila: -1, error: `Error de BD: ${insertError.message}` });
    } else {
      cantidadCorrectas = insertados?.length ?? 0;
    }
  }

  // Registrar auditoría con el cliente del usuario (respeta RLS de T_Importacion)
  const supabase = await crearClienteServidor();
  await supabase
    .schema("inv")
    .from("T_Importacion")
    .insert({
      NombreArchivo: "importacion-productos.csv",
      Objetivo: "productos",
      CantidadFilas: cantidadFilas,
      CantidadCorrectas: cantidadCorrectas,
      LogErrores: logErrores,
      Situacion:
        logErrores.length === 0
          ? "exitoso"
          : cantidadCorrectas > 0
            ? "parcial"
            : "fallido",
    });

  return NextResponse.json({
    cantidadFilas,
    cantidadCorrectas,
    cantidadErrores: logErrores.length,
    errores: logErrores,
  });
}
