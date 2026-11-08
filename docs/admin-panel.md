# Panel administrativo

## Navegación y rutas

`src/app/features/admin/admin-navigation.ts` define el orden, la etiqueta y el slug de cada entrada. Las rutas principales tienen la forma `/administracion/<id-grupo>/<slug>`. El shell filtra las entradas por permiso y muestra los grupos que tienen al menos una entrada visible. La ruta raíz y el enlace de marca usan `firstVisibleAdminPath()` para abrir la primera entrada autorizada.

Los IDs de grupo y las reglas por entrada viven en `src/app/core/auth/access-policy.ts`. Admin puede abrir todos los grupos. Acceso rápido está disponible para toda sesión autenticada y cada operación valida sus permisos específicos.

## Roles del backend y seguridad

El backend entrega el usuario en `user` durante el ingreso personal o por PIN y en `data` al consultar `GET /api/v1/me`. El frontend toma el rol de `rol.clave` y las autorizaciones de `permissions`.

Las reglas del menú usan las claves `can_*` del catálogo del backend. `permission-keys.ts` conserva la equivalencia con los nombres anteriores durante la transición de los controles que todavía los usan. Cada equivalencia corresponde al mismo permiso antes y después del renombrado.

Los guards del panel, del grupo y de sus rutas hijas aplican las mismas reglas de acceso. Una sesión anónima va a `/auth` y un acceso sin permiso va a `/acceso-denegado`. El servidor valida usuario, sesión y permisos en cada operación.

## Convertir un placeholder en un módulo

Las entradas pendientes usan `AdminPlaceholderPage`. Para conectar una de esas entradas:

1. Conecta las rutas del feature mediante carga diferida en `admin.routes.ts`.
2. Conserva `data.group` y los guards de grupo y rutas hijas.
3. Mantén el slug y agrega a la política los permisos confirmados por el backend. Verifica el acceso con Admin, una cuenta con permiso y una cuenta sin permiso.

## Resumen operativo

`/administracion/resumen` abre la vista Global en cuentas personales. El filtro superior permite consultar una unidad productiva en el mismo bloque de indicadores. Las sesiones con PIN consultan el alcance de su unidad. Los indicadores históricos comparten un período inclusivo en America/Montevideo. Las aves vivas, las alertas abiertas y el stock de raciones reflejan el momento de consulta.

El valor de mercadería entregada tiene alcance empresa. Los gastos se muestran por moneda y el resultado neto queda por validar. El stock de raciones y los lotes por galpón se muestran para una UP concreta.

## Configuración de alertas

La ruta `/administracion/alertas-notificaciones/configuracion-de-alertas` permite a Admin y a las cuentas con `can_manage_alert_thresholds` configurar las alertas de Lotes y Planes de manejo. El selector de la pantalla comparte la unidad activa del panel. Las cuentas con un rol personalizado necesitan además permiso para consultar unidades productivas. Cada regla se guarda por separado y el servidor aplica los cambios en su próxima evaluación.

Vehículos tiene alcance general y aparece aun sin seleccionar una UP. Sus tres alertas permiten editar la anticipación de intervenciones, planes preventivos y documentos, incluidos los kilómetros de los planes. Instalaciones usa la UP seleccionada y permite ajustar el aviso por exceso de capacidad antes de la adultez y el exceso mínimo de aves. Ambos módulos consumen el catálogo `configuracion-alertas`, permiten habilitar cada aviso y elegir urgencia automática o fija, y envían por PATCH únicamente los campos modificados.

## Gestión heredada y autenticación

La gestión de usuarios y dispositivos está integrada en `/administracion/usuarios`, con las subpestañas Usuarios, Crear, Dispositivos y Roles. `/gestion-accesos` redirige al módulo. La pantalla Home fue eliminada: `/home` es únicamente una redirección a `/administracion`, cuyos guards conservan la autenticación y autorización. El padre de Usuarios conserva `authGuard` y `adminGroupGuard`; el servicio y la página pertenecen a `features/users`. Los contratos disponibles y pendientes se detallan en [Gestión de usuarios](user-management.md). El shell cierra sesión y navega a `/auth`. Si la sesión expira mientras el shell está abierto, el shell observa el estado de `AuthStore` y vuelve al login.

Después de iniciar sesión o continuar una sesión compartida, las cuentas con acceso a algún módulo entran al panel; las cuentas con rol de reparto sin acceso al panel entran al modo repartidor. Las cuentas sin secciones habilitadas reciben acceso restringido, donde pueden cerrar sesión sin volver a intentar entrar al mismo panel. En Repartidor, el enlace a otras vistas solo aparece cuando la cuenta tiene acceso al panel.

El login visual sigue `Demos/design-a` y `Demos/shared/auth.css`: escena azul marino, panel claro y composición adaptable. Mantiene el login real, CSRF/cookies web, PAT nativo, pairing compartido, selector y PIN. No se incluyen credenciales ni usuarios ficticios del prototipo.
