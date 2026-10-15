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
