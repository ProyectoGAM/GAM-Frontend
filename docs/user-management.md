# Gestión de usuarios

El módulo lazy `features/users` reemplaza la pantalla independiente de gestión de accesos. Se accede desde **Usuarios** en el panel administrativo. Sus cuatro rutas son `/administracion/usuarios`, `/crear`, `/dispositivos` y `/roles` bajo ese mismo prefijo. `/gestion-accesos` redirige al listado; las antiguas rutas internas `usuarios/usuarios` y `usuarios/nuevo-usuario` conservan redirecciones. Home ya no duplica la gestión.

## Contratos utilizados

### Vinculación por unidad productiva

La pestaña **Dispositivos** implementa el [diseño de vinculación](designs/vincular-dispositivo.md).
Carga todas las páginas de `production-units` para resolver nombres; solo permite elegir
UP activas y no toma la selección global del shell como autorización ni como asignación.
`POST shared-devices/codes` envía `name` y `up_id` después de confirmar la contraseña.
La confirmación identifica equipo y UP; la tarjeta del código conserva ese contexto,
lo agrupa visualmente en dos bloques y utiliza el vencimiento real del servidor.
Los errores de unidades y equipos tienen reintentos independientes y no se presentan
como listados vacíos. Las vinculaciones antiguas sin UP invitan a vincular nuevamente.

Desvincular explica que revoca el equipo y todas sus sesiones. Cambiar de UP requiere
desvincular y generar otro código. El listado informa la UP y distingue vinculado,
desvinculado y vencido; no presenta esos estados como conectividad en tiempo real.

El equipo canjea código y nombre sin selector de UP. Acepta el código agrupado o en
minúsculas, normalizándolo antes del envío. La lista de personas carga todas las páginas
autorizadas por el backend; después de elegir una persona se muestra su formulario de PIN.
La API pública de estado solo entrega `up_id`, por lo que el equipo muestra ese identificador;
Administración resuelve el nombre mediante su catálogo autorizado. No se inventa un nombre.

`AuthStore` adapta el `rol` singular del servidor a la representación de roles que ya consume
el frontend, manteniendo las claves de permisos recibidas. Las cuentas PIN admiten correo
nulo. El catálogo y la asignación de rol único se describen abajo; los controles de
permisos de otros módulos conservan su alcance de integración independiente.

`core/native/app-resume.service.ts` encapsula la reanudación nativa y el retorno de una
pestaña web oculta. Al reanudar se limpia inmediatamente la identidad del empleado,
se finaliza su sesión y se verifica la vinculación para volver al selector. Se ignoran
respuestas anteriores de PIN y directorio; un fallo de carga de personas mantiene el
equipo y permite actualizar la lista. No se agregan plugins ni almacenamiento de secretos.

### Cuentas y roles

El [apartado de roles y permisos](roles-and-permissions.md) implementa listado,
alta, edición de datos, selección por módulo, Agregar todos, revisión, guardado
con versión y eliminación. Consume `roles` y `permisos` con el catálogo real.
Administrador y Sin rol son de lectura; Empleado y Repartidor son configurables
pero protegidos de eliminación. Los contadores incluyen cuentas deshabilitadas.
La revisión de permisos no exige una contraseña adicional: esos endpoints requieren
sesión personal de Admin. Las pantallas de cuentas mantienen su confirmación por acción.

Las cuentas eligen un solo rol del catálogo paginado y envían `rol_id`. Se admiten
roles personalizados y cuentas deshabilitadas, sin habilitarlas por cambiar su rol.
Sin rol informa pérdida de acceso y cierre de sesiones; Admin no se puede asignar
a una cuenta de modalidad PIN.

Crear usuario ofrece acceso personal por correo y contraseña o acceso por PIN en
un equipo compartido. El segundo requiere un PIN de cuatro dígitos y una UP
activa del catálogo paginado. El resumen muestra modalidad, rol y UP si aplica.
Cambiar de modalidad descarta los campos de acceso y conserva el nombre y el rol
si es compatible. La confirmación usa la contraseña del administrador y muestra
la modalidad elegida antes de enviar el alta.

El historial enlaza a `/administracion/usuarios/:userId`, que abre esa cuenta en
la gestión existente mediante el directorio paginado. Volver regresa al listado.
No agrega permisos ni cambia las confirmaciones de las operaciones.

- `GET users?page=N`: listado paginado; acepta el envoltorio `data: []` y `data: {data: [], meta?}`. Sin `last_page`, permite avanzar hasta una página vacía sin inventar totales. Buscar y filtrar estado se limita explícitamente a la página cargada.
- `POST users` siempre envía `name` y un único `rol_id`. Para acceso personal agrega
  `email`, `password` y `password_confirmation`. Para acceso compartido agrega
  `email: null`, `pin`, `pin_confirmation` y `up_id`.
- `PATCH users/{id}/status`, `PUT usuarios/{id}/rol` con `rol_id`, `PUT users/{id}/password`, `DELETE users/{id}/sessions`.
- `PUT users/{id}/pin`, `DELETE users/{id}/pin`, `POST users/{id}/pin/unlock`. El PIN conserva los ceros iniciales. Con la modalidad informada por el contrato nuevo, solo se ofrece para cuentas PIN habilitadas sin rol administrativo.
- `GET shared-devices`, `POST shared-devices/codes` con `name` y `up_id`, `DELETE shared-devices/{id}/pairing`.

Cada cambio de cuenta abre un diálogo con su acción y destinatario. La contraseña solicitada es la del administrador que opera. `AuthStore.confirmPassword()` usa `auth/web/confirm-password` con cookies en web y `auth/confirm-password` en nativo. Una respuesta `401 INVALID_CREDENTIALS` únicamente en esos endpoints mantiene la sesión y el diálogo; los demás errores de sesión siguen limpiando identidad. No se conserva un desbloqueo global de la UI. Se vuelve a verificar por acción y se comprueba que usuario/sesión no hayan cambiado antes de enviar el comando. No se permite modificar los propios roles ni deshabilitar la cuenta propia desde este flujo.

La contraseña de confirmación se borra del formulario al enviar o cancelar. Los borradores de credenciales y códigos se eliminan al destruir la página o cambiar identidad. El código de vinculación solo vive en memoria de esa página y se oculta según `expires_at` del servidor. Ningún secreto se escribe en storage ni en la URL. No hay reintentos automáticos de mutaciones.

## Pendientes de integración y verificación

La UI identifica las siguientes limitaciones, sin inventar datos ni simular guardados:

- Editar la UP de una cuenta PIN existente. El backend restringe las cuentas PIN a la UP de su dispositivo y sesión. El listado administrativo de dispositivos es global y muestra la UP de cada equipo.
- Migrar los controles funcionales antiguos de otros módulos a las claves `can_*`. El editor de roles ya consume esas claves directamente desde el catálogo.
- Actualización de nombre/correo y estados del PIN (configurado/bloqueado). No se deducen de roles o de permisos efectivos del usuario.
- Exigir contraseña reciente del lado servidor en **todos** los comandos de usuarios. Actualmente el backend solo aplica esa exigencia a generar código y revocar dispositivo. El diálogo frontend no basta para impedir llamadas directas hechas con cookies robadas. Hace falta validación en servidor, con alcance y vigencia acordados; una verificación atada a la acción también evitaría reutilización entre pestañas.
- Alinear en el backend la bandera `editable` de Sin rol con su Policy. El frontend ya lo bloquea explícitamente y presenta conflictos de versión y la protección del último administrador.
- Búsqueda y filtros globales, y metadatos completos de paginación para `users`.

## Validación

La entrega de vinculación por UP del 03/11/2026 aprobó lint, una suite completa
de **1.336 pruebas**, build de producción, auditoría de producción sin vulnerabilidades
y `npx cap sync` para Android/iOS, siempre dentro de Docker. Tras completar las
protecciones frente a respuestas tardías, pasaron las **74 pruebas** de regresión
de usuarios, autenticación y Acceso rápido, y se repitió lint. Estas cantidades se
solapan y no se suman. La ejecución inicial había tenido un timeout aislado en
Acceso rápido; su prueba pasó tanto en la suite completa posterior como en regresión.

El navegador contra el backend local verificó la carga de UP activas, selección,
confirmación de nombre/UP, cancelación sin mutación, dispositivos históricos sin UP,
temas claro/oscuro, teléfono a 320/360 px y escritorio a 1280 px. Los controles
principales midieron 48 px y no se detectó desbordamiento horizontal ni errores
JavaScript en la revisión final. La vista pública de vinculación también se revisó
en navegador. No se emitieron ni revocaron credenciales de dispositivo como parte
de esa revisión; el canje y el acceso con PIN se verificaron con pruebas automatizadas.
La reanudación se prueba con eventos controlados: queda pendiente comprobar teclado,
áreas del sistema y ciclo de vida en Android/iOS físicos.

Pruebas de contratos HTTP, confirmación por acción, cancelación/contraseña incorrecta, duplicados en vuelo, cambio de identidad, PIN con ceros iniciales, expiración/limpieza del código, errores sin reintento, placeholders de permisos y navegación. La comprobación visual usa el navegador integrado, teléfono y escritorio, temas claro y oscuro. No se cambian cuentas o credenciales reales para probar la interfaz.
