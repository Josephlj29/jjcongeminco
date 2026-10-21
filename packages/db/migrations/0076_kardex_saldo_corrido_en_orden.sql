/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: inv.V_MovimientoStock_Kardex (REPLACE)
	Tipo de Cambio: REPLACE - el saldo corrido sigue el orden de lectura
	Autor: Equipo Desarrollo
	Fecha: 2026-10-21
	Descripcion: La ventana del saldo corrido desempataba por m."Id", que es un
	             UUID v4: ALEATORIO. Mientras cada producto tuvo un movimiento por
	             dia nadie lo noto, pero con dos o mas movimientos en la MISMA
	             fecha contable el acumulado se calculaba en un orden al azar.

	             Caso real (FILTRO-015, tres salidas de 1 el 06/10): la columna
	             Saldo mostraba 10 -> 7 -> 8 -> 9 -> 6. El saldo SUBIA entre
	             salidas. El total final siempre fue correcto, porque la suma no
	             depende del orden; lo que estaba mal era el camino, que es
	             justamente lo que se lee en un kardex para auditar.

	             Al 2026-10-21 habia 33 movimientos con el saldo fuera de orden,
	             sobre 29 productos.

	             El desempate ahora es la FECHA REAL DE CARGA del documento
	             (FechaCreacion, expuesta como FechaRegistro en 0075) y recien
	             despues el Id, que solo rompe empates exactos de forma estable.
	             Ese es el orden en que el usuario lee el kardex: primero el dia
	             contable, y dentro del dia, el orden en que se registraron.

	             No cambia ningun saldo almacenado: T_SaldoStock se calcula por
	             trigger sumando movimientos y es independiente del orden.
*/
CREATE OR REPLACE VIEW "inv"."V_MovimientoStock_Kardex"
WITH (security_invoker = true) AS
	SELECT
		m."Id" AS "IdMovimientoStock"
		,m."IdProducto"
		,p."Sku"
		,p."Nombre" AS "NombreProducto"
		,m."IdUbicacion"
		,u."Nombre" AS "NombreUbicacion"
		,m."FechaMovimiento"
		,d."TipoDocumento"
		,d."NumeroDocumento"
		,d."Comprobante"
		,m."Direccion"
		,m."Cantidad"
		,m."Direccion"::NUMERIC * m."Cantidad" AS "CantidadConSigno"
		,SUM(m."Direccion"::NUMERIC * m."Cantidad") OVER (
			PARTITION BY m."IdProducto", m."IdUbicacion"
			ORDER BY m."FechaMovimiento", d."FechaCreacion", m."Id"
			ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
		) AS "SaldoCorrido"
		,d."FechaCreacion" AS "FechaRegistro"
		,"seg"."FnNombreUsuario"(d."UsuarioCreacion") AS "RegistradoPor"
	FROM "inv"."T_MovimientoStock" m
	JOIN "inv"."T_Producto" p ON p."Id" = m."IdProducto"
	JOIN "inv"."T_Ubicacion" u ON u."Id" = m."IdUbicacion"
	JOIN "inv"."T_DocumentoInventario" d ON d."Id" = m."IdDocumentoInventario";

COMMENT ON VIEW "inv"."V_MovimientoStock_Kardex" IS 'Kardex por producto/ubicacion: cada movimiento con su fecha contable (FechaMovimiento), su fecha real de carga (FechaRegistro) y quien la hizo (RegistradoPor). El SaldoCorrido acumula en el mismo orden en que se lee: fecha contable, luego orden de carga.';
