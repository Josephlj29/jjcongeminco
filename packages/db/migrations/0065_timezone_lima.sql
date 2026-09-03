/*
	Base de Datos: Inventario JJ Congeminco (Supabase / PostgreSQL)
	Objeto: configuracion de la base (TimeZone)
	Tipo de Cambio: ALTER DATABASE - el dia calendario del servidor pasa a ser hora Lima
	Autor: Equipo Desarrollo
	Fecha: 2026-09-03
	Descripcion: BUG DE UN DIA. La sesion corria en UTC y Lima es UTC-5, asi que
	             entre las 19:00 y 23:59 hora Lima el servidor ya creia que era el
	             dia siguiente. Consecuencias detectadas:

	               - to_char(CURRENT_DATE,'YYYY-MM-DD') se usa en ~20 puntos para el
	                 "FechaDocumento" de los documentos que generan las funciones
	                 (consumo de repuestos de OT, salida por atencion de
	                 requerimiento, entrada por compra directa, reversa por rechazo):
	                 todos quedaban fechados al dia siguiente.
	               - El N° de orden de mantenimiento (PREFIJO-DDMMYYYY-PLACA-NN,
	                 migracion 0050) se arma desde la fecha: salia con el dia
	                 equivocado.

	             Fix: fijar el TimeZone de la base en 'America/Lima'. Con eso
	             CURRENT_DATE y NOW() razonan en hora Peru y se corrigen TODAS las
	             funciones de una vez, sin editar ninguna y sin migrar datos.

	             IMPORTANTE — por que esto NO altera lo almacenado:
	             las columnas TIMESTAMPTZ (FechaCreacion, FechaMovimiento, etc.)
	             guardan un INSTANTE ABSOLUTO (UTC internamente). Cambiar el TimeZone
	             de la sesion solo afecta como se INTERPRETAN y RENDERIZAN las fechas,
	             nunca el instante guardado. No se convierte ningun dato a hora local:
	             hacerlo seria un error (se perderia el instante real). Las columnas
	             DATE tampoco se tocan.

	             Efecto colateral deseado: los timestamptz se serializan con offset
	             -05, asi que el agrupado por dia del dashboard
	             (FechaMovimiento.split("T")[0]) pasa a agrupar por dia Lima.

	             Verificado antes de aplicar: ningun rol (anon, authenticated,
	             service_role, authenticator, postgres) tiene TimeZone en
	             pg_db_role_setting, por lo que no hay override que pise esto.

	             Requiere RECONEXION: es un setting de base, aplica a sesiones nuevas.
*/

ALTER DATABASE "postgres" SET "TimeZone" = 'America/Lima';
