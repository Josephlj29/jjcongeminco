/*
    Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
    Objeto: inv.V_Producto_StockConsolidado (REPLACE)
            inv.V_Producto_FacetaCategoria (CREATE)
    Tipo de Cambio: REPLACE + CREATE - soporte de paginacion server-side en Saldos
    Autor: Equipo Desarrollo
    Fecha: 2026-09-07
    Descripcion: La pantalla de Saldos bajaba el catalogo COMPLETO y filtraba en
                 memoria. Para paginar y ordenar en el servidor faltan dos cosas
                 que la vista no expone:

                 1) "UltimoMovimiento" = MAX del "FechaModificacion" del saldo
                    cacheado. El trigger TR_T_MovimientoStock_AplicarSaldo hace
                    upsert sobre T_SaldoStock con "FechaModificacion" = NOW() en
                    cada movimiento, asi que la columna equivale a "ultima vez
                    que el stock de este producto se movio". NULL = producto sin
                    saldo en ninguna ubicacion (nunca entro al almacen).
                    Va AL FINAL: regla de CREATE OR REPLACE VIEW (solo se pueden
                    agregar columnas, y al final).

                 2) inv.V_Producto_FacetaCategoria: los chips de categoria de la
                    pantalla se derivaban de los productos ya cargados. Sin esa
                    carga hacen falta las categorias QUE TIENEN productos (28 de
                    37 hoy) con su conteo: 28 filas de tres columnas en vez de
                    348 filas completas.

                 Sin cambios de datos ni de permisos. Las dos vistas van con
                 security_invoker para que respeten las policies de quien
                 consulta (misma decision que 0044 y 0061).
*/
CREATE OR REPLACE VIEW "inv"."V_Producto_StockConsolidado" WITH (security_invoker = true) AS
SELECT
    p."Id" AS "IdProducto",
    p."Sku",
    p."Nombre" AS "NombreProducto",
    c."Nombre" AS "NombreCategoria",
    um."Codigo" AS "CodigoUnidad",
    p."StockMinimo",
    COALESCE(SUM(s."CantidadDisponible"), 0::NUMERIC) AS "StockTotal",
    COALESCE(SUM(s."CantidadDisponible"), 0::NUMERIC) < p."StockMinimo" AS "BajoMinimo",
    p."IdCategoria",
    p."CostoPromedio",
    (
        SELECT pi."Url"
        FROM "inv"."T_ProductoImagen" pi
        WHERE pi."IdProducto" = p."Id" AND pi."Estado" = TRUE
        ORDER BY pi."EsPrincipal" DESC, pi."Orden"
        LIMIT 1
    ) AS "UrlImagenPrincipal",
    p."EsGeneral",
    p."CodigoProductoProveedor",
    MAX(s."FechaModificacion") AS "UltimoMovimiento"
FROM "inv"."T_Producto" p
    JOIN "inv"."T_Categoria" c ON c."Id" = p."IdCategoria"
    JOIN "inv"."T_UnidadMedida" um ON um."Id" = p."IdUnidadMedida"
    LEFT JOIN "inv"."T_SaldoStock" s ON s."IdProducto" = p."Id"
WHERE p."Estado" = TRUE
GROUP BY p."Id", p."Sku", p."Nombre", c."Nombre", um."Codigo", p."StockMinimo",
    p."IdCategoria", p."CostoPromedio", p."EsGeneral", p."CodigoProductoProveedor";

COMMENT ON VIEW "inv"."V_Producto_StockConsolidado" IS 'Saldo total por producto con imagen principal, alerta BajoMinimo y fecha del ultimo movimiento de stock (para ordenar por actividad reciente).';

/* ---------------------------------------------------------------------
    Categorias que tienen productos activos, con su conteo.
    Alimenta los chips de filtro de Saldos sin cargar los productos.
--------------------------------------------------------------------- */
CREATE OR REPLACE VIEW "inv"."V_Producto_FacetaCategoria" WITH (security_invoker = true) AS
SELECT
    c."Id" AS "IdCategoria",
    c."Nombre" AS "NombreCategoria",
    COUNT(*)::INT AS "Productos"
FROM "inv"."T_Producto" p
    JOIN "inv"."T_Categoria" c ON c."Id" = p."IdCategoria"
WHERE p."Estado" = TRUE AND c."Estado" = TRUE
GROUP BY c."Id", c."Nombre";

COMMENT ON VIEW "inv"."V_Producto_FacetaCategoria" IS 'Categorias con al menos un producto activo y su conteo. Para chips de filtro sin traer el catalogo.';

GRANT SELECT ON "inv"."V_Producto_FacetaCategoria" TO "authenticated";
