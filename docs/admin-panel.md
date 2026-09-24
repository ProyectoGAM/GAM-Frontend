# Panel administrativo

## Navegación y rutas

`src/app/features/admin/admin-navigation.ts` es el catálogo de presentación: mantiene en orden los diez grupos y sus 25 entradas. Cada entrada declara un `slug` estable de URL frontend y su etiqueta. Las rutas principales tienen la forma `/administracion/<id-grupo>/<slug>`. Esos slugs no son endpoints de API y no dependen del contrato backend. El shell usa el mismo catálogo para construir enlaces y `visibleAdminNavigation()` para ocultar grupos sin permiso. La ruta raíz y el enlace de marca usan `firstVisibleAdminPath()` para entrar a la primera entrada autorizada; si no hay grupos visibles se muestra acceso denegado. La prueba de navegación valida orden, visibilidad, cantidad y destino inicial.

Los IDs de grupo, la normalización del rol y el mapa de permisos viven en `src/app/core/auth/access-policy.ts`. ADMIN siempre accede a los diez grupos. Los slugs son decisiones de navegación del frontend; se mantienen estables para enlaces guardados y documentación.

## Roles del backend y seguridad

El contrato frontend declara `AuthUser.roles: string[]` en `src/app/core/auth/auth.types.ts`. El backend entrega el usuario en `user` durante login personal/PIN y en `data` para `GET /api/v1/me` (cliente: `AuthApi.me()`; endpoint relativo `me`). Los campos de identidad son `name` y `email`; `roles` conserva los nombres literales devueltos por backend.

La política actualmente recorta espacios y convierte a minúsculas los strings de roles para reconocer `admin` (el rol existente). ADMIN tiene acceso a todos los grupos. `GROUP_ROLE_GRANTS` contiene una entrada vacía para cada ID de grupo: roles distintos de ADMIN no reciben acceso por inferencia. Cuando backend acuerde los roles por grupo, se incorporan sus nombres literales en esa tabla y pruebas de política. El backend sigue siendo la autoridad final para proteger datos y operaciones.

La navegación solo expresa visibilidad. `adminPanelGuard`, `adminGroupGuard` y `adminGuard` protegen las rutas; una sesión guest va a `/auth`, una sesión autenticada sin rol recibe la pantalla `/acceso-denegado`. Los endpoints backend siguen validando usuario, sesión, permisos y operación en cada petición. Ocultar enlaces nunca sustituye la autorización del servidor.

## Convertir un placeholder en un módulo

De las 25 entradas, `ubicaciones/unidades-productivas` carga de forma lazy el feature `production-units` desde `src/app/features/production-units/`; las otras 24 cargan `AdminPlaceholderPage`, que muestra literalmente “Módulo pendiente de implementación”. Para implementar una de las entradas pendientes:

1. Crear el feature dueño bajo `src/app/features/<feature>/` con su `<feature>.routes.ts`, páginas y servicios; mantener lazy loading.
2. `admin.routes.ts` usa `map` para generar una ruta padre por grupo y una lista de rutas hijas por entrada. Para convertir `usuarios/usuarios`, cambia únicamente el item con slug `usuarios` dentro de `group.items.map(...)` para emitir `{ path: item.slug, loadChildren: () => import('../users/users.routes').then((m) => m.userRoutes) }`; los demás hijos del mismo padre continúan usando `AdminPlaceholderPage`. Otra opción es declarar una ruta hija específica antes de las rutas placeholder de ese padre. El feature sigue cargándose lazy.
3. Conserva `canActivate: [authGuard, adminGroupGuard]` y `data.group` en el padre, junto con `data.title` y `data.groupLabel` en cada hija. Así, el módulo nuevo conserva autorización de grupo y contexto visual.
4. Mantén alineados el ID/slug y el item en `admin-navigation.ts`. Si el backend entrega roles por grupo, agrega únicamente los nombres confirmados a `GROUP_ROLE_GRANTS` y cubre ADMIN, el rol autorizado y un rol no autorizado.
5. El feature consume `ApiClient` a través de su servicio y declara estados de carga, error, vacío y éxito. No agregues otra entrada sin actualizar la lista acordada de 25 módulos.

## Gestión heredada y autenticación

La pantalla funcional de usuarios y dispositivos sigue disponible en `/gestion-accesos`, protegida por `authGuard` y `adminGuard`; Home muestra su acceso en un enlace aparte para no sumarlo a las 25 entradas. El shell y Home cierran sesión y navegan a `/auth`. Si la sesión expira mientras el shell está abierto, el shell observa el estado de `AuthStore` y vuelve al login.

El login visual sigue `Demos/design-a` y `Demos/shared/auth.css`: escena azul marino, panel claro y composición adaptable. Mantiene el login real, CSRF/cookies web, PAT nativo, pairing compartido, selector y PIN. No se incluyen credenciales ni usuarios ficticios del prototipo.
