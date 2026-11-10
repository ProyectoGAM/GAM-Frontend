# Errores al guardar plantillas de manejo

Al fallar la creación de un borrador o el guardado de una nueva versión, el
editor desplaza la vista y lleva el foco al aviso «No se guardó la plantilla».
Se hace después del render, también al repetir el mismo error, para mantener
el mensaje visible con la barra superior. El aviso tiene nombre, descripción,
rol de alerta y foco visible.

Los errores de campos conservan sus mensajes junto al control. «Revisar primer
campo con error» abre la primera actividad afectada y enfoca el primer control
inválido. Las actividades afectadas muestran borde y texto «Revisar actividad:
contiene errores» incluso cerradas. Junto a las acciones de guardado aparece
otro aviso con «Ver error», que regresa al mensaje principal.

El comportamiento incluye validación local, respuesta 422, conflictos de
versión, falta de permisos, desconexión y fallos inesperados. Se conserva el
borrador local y el tratamiento existente de conflictos e idempotencia.
No se cambian contratos, permisos ni dependencias.

Validación dentro de Docker: lint, suite completa de 591 pruebas y build.
Después del ajuste final del desplazamiento se repitieron lint, las siete
pruebas del editor y build. Las pruebas verifican foco, repetición del error,
acceso al campo, actividad cerrada, conservación del borrador, errores sin
campo y conflicto de versiones. En navegador se comprobó el envío incompleto
desde el final de un formulario con tres actividades, el acceso al primer
campo y «Ver error», en escritorio y 390 × 844, claro y oscuro, sin
desbordamiento horizontal ni errores JavaScript. No se crearon registros.

## Confirmación de publicación

En el detalle del borrador, **Publicar versión** abre una modal centrada con la
versión y el aviso de que los nuevos lotes podrán usarla mientras los planes ya
asignados conservan su copia. El título recibe foco y la modal permite cancelar,
usar Escape o tocar el fondo antes de confirmar. Ionic mantiene el foco dentro
y lo devuelve al cerrar. Durante el envío se bloquean confirmación y cierre.

Los errores de publicación se muestran dentro de la modal y permiten reintentar
con la misma clave de idempotencia. Un conflicto de versión cierra la modal y
presenta los cambios para revisar la versión actual antes de publicar de nuevo.
Se conservan el contrato, los permisos y las confirmaciones de activar/desactivar.

La revisión en navegador comprobó apertura, Cancelar, Escape y retorno del foco,
con 320 y 1280 px en claro y oscuro, sin desbordamientos. No se publicó ninguna
versión durante esta comprobación. Las pruebas cubren además publicación exitosa,
doble envío, cierre bloqueado, error de conexión, reintento y conflicto de versión.
