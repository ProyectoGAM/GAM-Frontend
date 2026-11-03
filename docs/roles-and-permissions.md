# Roles y permisos

La ruta `/administracion/usuarios/roles` implementa el [diseño aprobado](designs/roles-y-permisos.md),
incluida la selección de todos los permisos asignables de un módulo.
`RolesService` mantiene el estado de la feature y usa `ApiClient`; se proporciona
por instancia del panel para descartar datos y borradores al salir o cambiar identidad.
`role-permissions.ts` concentra las reglas de selección y dependencias. No se añadieron
dependencias, capas arquitectónicas ni configuración de autenticación.

## API

La fuente es `../GAM-Backend/contracts/openapi/authentication.yaml`, contrastada con
el catálogo y las Policies del backend.

| Operación | Petición relativa a /api/v1 |
| --- | --- |
| Catálogo | `GET permisos`. Módulos, etiquetas, descripciones, `requiere` y `asignable`. |
| Listado | `GET roles` con `buscar`, `page` y `por_pagina=25`. |
| Detalle | `GET roles/{id}`. Incluye versión y usuarios asignados. |
| Crear | `POST roles` con `nombre`, `descripcion` nullable y `permisos`. |
| Editar datos | `PATCH roles/{id}` con nombre, descripción y `version`. |
| Guardar selección | `PUT roles/{id}/permisos` con todos los permisos elegidos y `version`. |
| Eliminar | `DELETE roles/{id}` con body `{version}`. |
| Asignación desde cuenta | `PUT usuarios/{id}/rol` con `rol_id`. |
| Alta de cuenta personal | `POST users` conserva nombre/correo/contraseña confirmada y envía `rol_id`. |

La clave técnica la genera el servidor. No se editan IDs, versiones, flags de
protección ni permisos individuales por usuario. Un nombre admite hasta 120
caracteres; la descripción es opcional y admite hasta 500. Una selección vacía
es válida. El alta no asigna usuarios ni emite sesiones.

## Comportamiento

La búsqueda consulta el servidor y reinicia la página; las respuestas antiguas no
sobrescriben una consulta más reciente. Los contadores provienen del API y cuentan
también usuarios deshabilitados. Las respuestas de mutación que omiten
`usuarios_count` se completan consultando el detalle, sin suponer cero.

Los permisos se muestran con nombres en español, descripción y dependencias.
El buscador local encuentra acciones o módulos y cambia a un módulo coincidente
cuando el actual no contiene resultados; conserva toda la selección. En teléfono
hay un selector de módulo; en escritorio una navegación con scroll propio acotado.
El scroll normal de la página sigue perteneciendo al `ion-content` del shell.

**Agregar todos (N)** incorpora los permisos asignables que faltan en el módulo,
conservando los de otros módulos. Si hay una búsqueda activa, se enumeran los
cambios antes de aplicarlos al borrador. Las dependencias adicionales también
requieren aceptación explícita; al retirar un permiso base se informa qué acciones
dependientes deben retirarse juntas. Se detectan catálogos incompletos, ciclos y
dependencias no asignables, sin aplicar selecciones parciales silenciosas.
**Todos agregados** queda deshabilitado. Ninguna de estas acciones guarda por sí sola.

**Revisar cambios** muestra altas, bajas y usuarios afectados antes de guardar.
Al retirar un canal se explica el cierre de sus sesiones. Guardar envía la selección
completa, no el diferencial. Nombre y descripción se guardan aparte y conservan
el borrador de permisos, utilizando la versión actualizada. No se promete una
transacción conjunta para esos dos endpoints.

Administrador y Sin rol son de lectura. Empleado y Repartidor se pueden configurar,
pero no eliminar. La eliminación de un rol personalizado exige cero asignaciones
y confirmación; el servidor comprueba nuevamente usuarios y versión.
Se respeta la Policy de Sin rol aunque el backend todavía pueda marcarlo
`editable: true`.

Un 409 de versión conserva el borrador y bloquea el guardado. **Recargar y comparar**
recupera la configuración actual; se puede adoptarla o elegir explícitamente
**Comparar mi borrador**, que prepara una revisión nueva contra la versión recibida.
No hay reenvío automático con una versión nueva. `ROLE_IN_USE` actualiza la
información sin eliminar; las operaciones de cuenta presentan `LAST_ADMIN`.
Un 403 bloquea cambios en ese detalle y refresca identidad. Un resultado incierto
bloquea reintentos de mutación hasta revisar información actual. No se reintentan
mutaciones automáticamente.

Salir con cambios de permisos o datos nuevos abre una confirmación; cancelar
conserva el borrador, incluida la edición de nombre/descripción. El guard de la
ruta cubre cambios de pestaña y navegación. Un cambio de identidad descarta
respuestas y borradores anteriores. Los diálogos nativos contienen el foco,
respetan Escape, devuelven el foco al origen y separan cuerpo desplazable de acciones.

## Asignación y alcance

Las cuentas eligen un único rol del catálogo completo, cargado con paginación.
Los nombres personalizados se presentan desde `rol.nombre`; no se limita la
selección a tres claves fijas. Cambiar el rol admite cuentas deshabilitadas sin
reactivarlas. Sin rol explica la pérdida de acceso y revocación de sesiones; una
cuenta PIN no puede recibir Admin. Se conserva la confirmación de contraseña
por acción que ya utilizaban las pantallas de cuentas.

El editor de definiciones de rol exige sesión personal de Admin y usa revisión
de cambios, sin solicitar una contraseña o PIN adicional que el contrato no exige.
Los permisos son globales y no cambian modalidad ni UP. La creación de cuentas
PIN y el editor de su UP, así como la migración de controles funcionales antiguos
de otros módulos a `can_*`, siguen siendo trabajos independientes.

## Verificación

Las pruebas cubren contratos HTTP, búsqueda/paginación, creación con permisos
vacíos, guardado con versión, conservación del borrador al editar datos, conflictos
concurrentes, eliminación, autorización, cambios de identidad, dependencias,
selección por módulo, PIN/Admin y asignación única desde el catálogo. No se
modifican roles reales para ejecutar estas pruebas.

La revisión de navegador contra el backend local comprueba listado, contadores,
23 módulos, selección de los seis permisos de alimento manteniendo el canal ya
elegido, revisión sin guardar, dependencias, cancelación y salida con cambios.
Se revisan teléfono de 320/360 px y escritorio de 1280 px, temas claro/oscuro,
controles de al menos 48 px y ausencia de desbordamiento horizontal.
El guardado y eliminación se prueban con HTTP controlado; la revisión visual no
crea roles ni altera permisos o asignaciones de la base local.

Validación en Docker: `npm run lint`, `npm run test:ci` (165 archivos y 1366
pruebas) y `npm run build` completados correctamente. La auditoría inicial
`npm audit --omit=dev` reportó cero vulnerabilidades y no se modificaron
dependencias. No se agregan plugins; `npx cap sync` copia el build para
Android/iOS. No se validan aquí dispositivos físicos, teclado nativo ni las
pantallas funcionales ajenas a esta entrega.

