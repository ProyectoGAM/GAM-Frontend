# Posición del lote en su plan de manejo

El regreso conserva el origen: el enlace desde el detalle del lote incluye
`from=flock` y el plan ofrece «Volver al lote», usando el ID de su ruta.
Desde «Planes por lote» (incluido el acceso por identificador), o al abrir una
URL sin ese origen, ofrece «Volver a planes por lote». El parámetro persiste al
recargar y solo admite ese valor conocido; nunca se usa como URL de redirección.
Ambos recorridos funcionan también si no hay plan o falla la consulta.
Si el lote se abrió desde un galpón, el plan conserva `lotFrom`, `unitId` y
`houseId` al regresar, para mantener después el regreso a ese galpón.

El detalle del plan muestra día y semana actuales a partir de `baseline_date`,
con día 1 en la fecha de ingreso y semanas inclusivas de siete días. El calendario
usa America/Montevideo y se actualiza cada minuto mientras la pantalla está
abierta. No utiliza la zona horaria del dispositivo ni resta horas locales.

Se resaltan **todas** las actividades previstas que coincidan con ese momento:

- Día: coincide exactamente con `start_day`.
- Semana: abarca sus siete días.
- Tramo: incluye ambas semanas límite; un tramo abierto sigue hasta fin de ciclo.
- Recurrencia: coincide con cada intervalo desde `start_day`, hasta `end_day` o
  el último día de `end_week`, inclusive.
- Sin fecha: permanece sin resaltar.
- Ración: se mantiene la etapa más reciente que ya comenzó, hasta la siguiente
  etapa de ración prevista, como confirmó el usuario. No se evalúa el estado
  presente o futuro de la receta para representar lo aplicado.

No hay una selección única ni se toma solo la primera coincidencia. Cada
coincidencia lleva borde, fondo y texto «Prevista ahora»; no depende solo del
color. Las actividades condicionales conservan su condición. La consulta sigue
el calendario aunque la alimentación esté en manual y no registra ejecuciones,
cumplimientos ni cambios de alimentación.

Las tarjetas de todas las coincidencias aparecen dentro de «Posición actual
en el plan», debajo del día, semana y cantidad de actividades actuales. Así
pueden consultarse sin buscarlas en el plan completo. Conservan su número
original, receta, cantidad por ave, condición y notas. El listado completo
permanece debajo; plantillas no filtra sus actividades. Se retiró el párrafo
explicativo extenso de ese resumen.

El resaltado se limita a la revisión vigente. Al consultar revisiones anteriores
se muestra su carácter histórico sin marcar actividades actuales. Un lote
finalizado no tiene actividades actuales resaltadas. Un estado de lote no
disponible no impide consultar el plan, pero evita atribuir una posición actual.

Los estilos usan `primary`/`primary-soft` y los tokens de texto de ambos temas.
El texto normal sobre el fondo resaltado usa `text` para mantener el contraste
(8,24:1 en claro). Plantillas conserva el componente de actividades sin ninguna
selección de progreso.

Validación: lint, 606 pruebas en 91 archivos y build aprobados dentro de Docker.
El resumen con tarjetas actuales se revisó en LOT-FEED-TEST en escritorio y
390 × 844, claro y oscuro; muestra la actividad 03, receta y 80 g/ave/día.
Las pruebas verifican dos tarjetas solapadas en el resumen, exclusión de las
otras actividades y conservación de sus números 02 y 03.
Se verificaron ambos recorridos de regreso con LOT-FEED-TEST, también después
de recargar el plan; las pruebas cubren el origen y su actualización.
Las pruebas incluyen múltiples coincidencias simultáneas, límites de semanas,
recurrencias, raciones persistentes, zona horaria, revisión histórica y lote
finalizado o no disponible. Se revisó LOT-FEED-TEST en escritorio y 390 × 844,
claro y oscuro: día 9, semana 2 y etapa de crecimiento resaltada. Ese plan tiene
una sola coincidencia en la fecha de revisión; el solapamiento se verifica con
dos actividades renderizadas en las pruebas de página. No se modificaron
planes, permisos ni configuración de alimentación. El build conserva los
avisos SCSS/CommonJS existentes.
