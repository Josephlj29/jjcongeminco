"use client";

/**
 * hooks/useBorradorFormulario.ts
 *
 * Guarda lo que se está cargando en un formulario para que NO se pierda si el
 * navegador cierra la pestaña. El caso real: en obra se llena un requerimiento
 * desde el celular, el operario cambia de app para atender una llamada o sacar
 * una foto, y el navegador descarta la pestaña en segundo plano para liberar
 * memoria. Al volver, el formulario estaba vacío.
 *
 * Decisiones de diseño (el porqué, que es lo que no se ve en el código):
 *
 *  - localStorage y no sessionStorage: sessionStorage muere junto con la
 *    pestaña, que es exactamente el escenario que queremos sobrevivir.
 *
 *  - Se guarda en `visibilitychange` (pestaña oculta) y `pagehide`, no en
 *    `beforeunload`: en Android/iOS `beforeunload` NO dispara cuando el sistema
 *    mata la pestaña en segundo plano. Ocultarse es el último evento confiable.
 *
 *  - Clave por usuario: en un equipo compartido, el borrador de uno no puede
 *    aparecerle a otro.
 *
 *  - Clave por versión: si mañana cambia la forma del formulario, se sube la
 *    versión y los borradores viejos se ignoran solos, en vez de restaurar un
 *    objeto con campos que ya no existen.
 *
 *  - Vigencia de 7 días: un borrador de hace un mes es ruido, no un rescate.
 *
 *  - Solo en ALTA, nunca en edición: restaurar un borrador viejo encima de un
 *    registro real haría que se pise data buena con data vieja.
 *
 *  - Todo acceso va en try/catch: en modo incógnito, con la cuota llena o con
 *    el almacenamiento bloqueado por política, `localStorage` LANZA. El
 *    formulario tiene que seguir andando igual, solo que sin red de contención.
 *
 * Además de los valores de react-hook-form se puede guardar estado que vive
 * fuera del form (`extra`): el alta de una orden de mantenimiento, por ejemplo,
 * mantiene los trabajos y las líneas de repuestos en useState, y sin eso el
 * borrador rescataría solo la cabecera, que es la parte que menos cuesta cargar.
 *
 * LIMITACIÓN CONOCIDA: no se guardan las fotos. Son objetos `File` con URLs
 * temporales que no sobreviven al cierre de la pestaña y no entran en
 * localStorage. Se recupera todo el texto; las fotos se vuelven a adjuntar.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DefaultValues,
  FieldValues,
  UseFormGetValues,
  UseFormReset,
  UseFormWatch,
} from "react-hook-form";
import { serializarEstable } from "@/lib/serializar";

const PREFIJO = "congeminco:borrador";
/** Espera tras la última tecla antes de guardar (no escribimos en cada letra). */
const RETARDO_GUARDADO_MS = 600;
/** Un borrador más viejo que esto se descarta al leerlo. */
const VIGENCIA_MS = 7 * 24 * 60 * 60 * 1000;

/** Lo que realmente se serializa: valores + metadatos para poder invalidarlo. */
interface SobreBorrador<T extends FieldValues, E> {
  version: number;
  guardadoEn: number;
  valores: DefaultValues<T>;
  extra?: E;
}

export interface Borrador {
  /** true si al entrar se recuperó un borrador (para avisarle al usuario). */
  restaurado: boolean;
  /** Cuándo se había guardado lo recuperado. */
  guardadoEn: Date | null;
  /** Borra el borrador y deja el formulario en blanco ("Limpiar todo"). */
  descartar: () => void;
  /** Borra solo el borrador guardado; no toca el formulario (post-guardado). */
  olvidar: () => void;
}

export function useBorradorFormulario<T extends FieldValues, E = undefined>({
  clave,
  version,
  activo,
  idUsuario,
  watch,
  getValues,
  reset,
  valoresIniciales,
  extra,
  onRestaurarExtra,
  estaVacio,
}: {
  /** Identifica el formulario. Ej: "requerimiento", "orden-mantenimiento". */
  clave: string;
  /** Subir este número invalida los borradores guardados con la forma anterior. */
  version: number;
  /** false en edición o mientras el formulario no está disponible. */
  activo: boolean;
  /** Sin usuario no se guarda nada: la clave quedaría compartida. */
  idUsuario: string | undefined;
  watch: UseFormWatch<T>;
  getValues: UseFormGetValues<T>;
  reset: UseFormReset<T>;
  /** Función (no objeto) porque puede depender del día: ej. la fecha de hoy.
      Es parcial (DefaultValues) porque un formulario recién abierto tiene campos
      sin elegir todavía. */
  valoresIniciales: () => DefaultValues<T>;
  /** Estado serializable que vive fuera de react-hook-form y también se guarda. */
  extra?: E;
  /** Cómo devolver ese estado al formulario al restaurar. */
  onRestaurarExtra?: (extra: E) => void;
  /** Reemplaza la detección de "formulario intacto". Necesario cuando lo que
      importa vive en `extra` y no en los campos del form. */
  estaVacio?: () => boolean;
}): Borrador {
  const [restaurado, setRestaurado] = useState(false);
  const [guardadoEn, setGuardadoEn] = useState<Date | null>(null);

  // Refs para no re-suscribir el watch en cada render: las funciones que vienen
  // por props cambian de identidad, pero el efecto de guardado debe montarse una
  // sola vez por formulario.
  const yaRestaurado = useRef(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inicialesRef = useRef(valoresIniciales);
  inicialesRef.current = valoresIniciales;
  const getValuesRef = useRef(getValues);
  getValuesRef.current = getValues;
  const extraRef = useRef(extra);
  extraRef.current = extra;
  const restaurarExtraRef = useRef(onRestaurarExtra);
  restaurarExtraRef.current = onRestaurarExtra;
  const estaVacioRef = useRef(estaVacio);
  estaVacioRef.current = estaVacio;

  const clavePersistencia =
    activo && idUsuario ? `${PREFIJO}:v${version}:${clave}:${idUsuario}` : null;

  /** Escribe el borrador. Si el formulario está como recién abierto, lo borra:
      un borrador vacío no rescata nada y solo dispara el aviso al volver. */
  const guardar = useCallback(() => {
    if (!clavePersistencia) return;
    try {
      const valores = getValuesRef.current();
      const vacio = estaVacioRef.current
        ? estaVacioRef.current()
        : serializarEstable(valores) === serializarEstable(inicialesRef.current());
      if (vacio) {
        window.localStorage.removeItem(clavePersistencia);
        return;
      }
      const sobre: SobreBorrador<T, E> = {
        version,
        guardadoEn: Date.now(),
        valores: valores as DefaultValues<T>,
        extra: extraRef.current,
      };
      window.localStorage.setItem(clavePersistencia, JSON.stringify(sobre));
    } catch {
      // Incógnito, cuota llena o almacenamiento bloqueado: seguimos sin red.
    }
  }, [clavePersistencia, version]);

  const olvidar = useCallback(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    setRestaurado(false);
    setGuardadoEn(null);
    if (!clavePersistencia) return;
    try {
      window.localStorage.removeItem(clavePersistencia);
    } catch {
      /* ver nota de guardar() */
    }
  }, [clavePersistencia]);

  const descartar = useCallback(() => {
    olvidar();
    reset(inicialesRef.current());
  }, [olvidar, reset]);

  /* Restaurar: una vez por activación. En un diálogo que se abre y cierra, al
     cerrarse se rearma para que la próxima apertura vuelva a recuperar. */
  useEffect(() => {
    if (!clavePersistencia) {
      yaRestaurado.current = false;
      return;
    }
    if (yaRestaurado.current) return;
    yaRestaurado.current = true;
    try {
      const crudo = window.localStorage.getItem(clavePersistencia);
      if (!crudo) return;
      const sobre = JSON.parse(crudo) as SobreBorrador<T, E>;
      // Vencido o de otra forma del formulario: se descarta sin restaurar.
      if (sobre.version !== version || Date.now() - sobre.guardadoEn > VIGENCIA_MS) {
        window.localStorage.removeItem(clavePersistencia);
        return;
      }
      reset(sobre.valores);
      if (sobre.extra !== undefined) restaurarExtraRef.current?.(sobre.extra);
      setGuardadoEn(new Date(sobre.guardadoEn));
      setRestaurado(true);
    } catch {
      // JSON corrupto: mejor arrancar limpio que romper el formulario.
      try {
        window.localStorage.removeItem(clavePersistencia);
      } catch {
        /* ver nota de guardar() */
      }
    }
  }, [clavePersistencia, version, reset]);

  /* Guardado con retardo mientras se escribe. */
  useEffect(() => {
    if (!clavePersistencia) return;
    const suscripcion = watch(() => {
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(guardar, RETARDO_GUARDADO_MS);
    });
    return () => {
      suscripcion.unsubscribe();
      // Guardado pendiente al cerrar/desmontar: se vuelca ya, contra la clave que
      // seguía activa (la que capturó este `guardar`), no contra la siguiente.
      if (temporizador.current) {
        clearTimeout(temporizador.current);
        temporizador.current = null;
        guardar();
      }
    };
  }, [clavePersistencia, watch, guardar]);

  /* El estado de fuera del form no pasa por `watch`, así que necesita su propio
     disparador. Se compara serializado para no reagendar en cada render. */
  const huellaExtra = extra === undefined ? "" : serializarEstable(extra);
  useEffect(() => {
    if (!clavePersistencia || !huellaExtra) return;
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(guardar, RETARDO_GUARDADO_MS);
  }, [clavePersistencia, huellaExtra, guardar]);

  /* Guardado inmediato al ocultarse la pestaña: acá es donde se salva la data
     cuando el sistema operativo mata el navegador en segundo plano. */
  useEffect(() => {
    if (!clavePersistencia) return;
    const alOcultar = () => {
      if (document.visibilityState === "hidden") guardar();
    };
    document.addEventListener("visibilitychange", alOcultar);
    window.addEventListener("pagehide", guardar);
    return () => {
      document.removeEventListener("visibilitychange", alOcultar);
      window.removeEventListener("pagehide", guardar);
    };
  }, [clavePersistencia, guardar]);

  return { restaurado, guardadoEn, descartar, olvidar };
}
