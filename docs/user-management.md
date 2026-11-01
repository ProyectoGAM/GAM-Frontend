# Gestión de usuarios

El módulo lazy `features/users` reemplaza la pantalla independiente de gestión de accesos. Se accede desde **Usuarios** en el panel administrativo. Sus cuatro rutas son `/administracion/usuarios`, `/crear`, `/dispositivos` y `/roles` bajo ese mismo prefijo. `/gestion-accesos` redirige al listado; las antiguas rutas internas `usuarios/usuarios` y `usuarios/nuevo-usuario` conservan redirecciones. Home ya no duplica la gestión.

## Contratos utilizados

El historial enlaza a `/administracion/usuarios/:userId`, que abre esa cuenta en
la gestión existente mediante el directorio paginado. Volver regresa al listado.
No agrega permisos ni cambia las confirmaciones de las operaciones.

- `GET users?page=N`: listado paginado; acepta el envoltorio `data: []` y `data: {data: [], meta?}`. Sin `last_page`, permite avanzar hasta una página vacía sin inventar totales. Buscar y filtrar estado se limita explícitamente a la página cargada.
- `POST users`: nombre, correo, contraseña inicial y confirmación, y un rol de los tres identificadores admitidos (`admin`, `employee`, `delivery`).
- `PATCH users/{id}/status`, `PUT users/{id}/roles`, `PUT users/{id}/password`, `DELETE users/{id}/sessions`.
- `PUT users/{id}/pin`, `DELETE users/{id}/pin`, `POST users/{id}/pin/unlock`. El PIN conserva los ceros iniciales. Solo se ofrece para cuentas habilitadas sin rol administrativo.
- `GET shared-devices`, `POST shared-devices/codes`, `DELETE shared-devices/{id}/pairing`.

Cada cambio abre un diálogo con su acción y destinatario. La contraseña solicitada es la del administrador que opera. `AuthStore.confirmPassword()` usa `auth/web/confirm-password` con cookies en web y `auth/confirm-password` en nativo. Una respuesta `401 INVALID_CREDENTIALS` únicamente en esos endpoints mantiene la sesión y el diálogo; los demás errores de sesión siguen limpiando identidad. No se conserva un desbloqueo global de la UI. Se vuelve a verificar por acción y se comprueba que usuario/sesión no hayan cambiado antes de enviar el comando. No se permite modificar los propios roles ni deshabilitar la cuenta propia desde este flujo.

La contraseña de confirmación se borra del formulario al enviar o cancelar. Los borradores de credenciales y códigos se eliminan al destruir la página o cambiar identidad. El código de vinculación solo vive en memoria de esa página y se oculta según `expires_at` del servidor. Ningún secreto se escribe en storage ni en la URL. No hay reintentos automáticos de mutaciones.

## Por implementar en backend

La UI identifica las siguientes limitaciones, sin inventar datos ni simular guardados:

- Pertenencia de usuarios/dispositivos a una UP y aislamiento de consulta/operaciones por UP. El listado actual es global; el selector de UP del shell no lo filtra.
- CRUD de roles personalizados, catálogo de permisos por rol, atributos y actualización. Las casillas del editor están deshabilitadas. `LOTS` y `ALLOW_EDIT` son ejemplos de estructura, no permisos anunciados como existentes. Los roles actuales pueden asignarse desde una cuenta.
- Actualización de nombre/correo y estados del PIN (configurado/bloqueado). No se deducen de roles o de permisos efectivos del usuario.
- Exigir contraseña reciente del lado servidor en **todos** los comandos de usuarios. Actualmente el backend solo aplica esa exigencia a generar código y revocar dispositivo. El diálogo frontend no basta para impedir llamadas directas hechas con cookies robadas. Hace falta validación en servidor, con alcance y vigencia acordados; una verificación atada a la acción también evitaría reutilización entre pestañas.
- Protección transaccional del último administrador, control de concurrencia e idempotencia de comandos. La restricción sobre la cuenta propia es una ayuda de interfaz, no una garantía del servidor.
- Búsqueda y filtros globales, y metadatos completos de paginación para `users`.

## Validación

Pruebas de contratos HTTP, confirmación por acción, cancelación/contraseña incorrecta, duplicados en vuelo, cambio de identidad, PIN con ceros iniciales, expiración/limpieza del código, errores sin reintento, placeholders de permisos y navegación. La comprobación visual usa el navegador integrado, teléfono y escritorio, temas claro y oscuro. No se cambian cuentas o credenciales reales para probar la interfaz.
