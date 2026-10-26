# API Integration

La gestión de cuentas y dispositivos usa `features/users/services/users.service.ts` y las rutas existentes de autenticación para confirmar contraseña. Ver [Gestión de usuarios](user-management.md) para contratos, paginación y pendientes de UP, roles/permisos y exigencia de contraseña reciente en servidor.

## 1. Contract-first

Laravel API contracts are authoritative.

La elaboración desde plantas de ración usa el catálogo, cálculo y registro de
`feed-recipes.yaml`; ver [`feed-manufacture.md`](feed-manufacture.md) para el
recorrido, las unidades exactas y la recuperación idempotente de pendientes.

La consulta de raciones y sus mínimos por receta y UP usa ese mismo contrato.
Ver [`feed-stock.md`](feed-stock.md) para filtros, estados, permisos y unidades.

The frontend must not guess undocumented fields, states or error semantics.

La pantalla de alimentación de lotes consume `flock-feeding.yaml` y
`feed-recipes.yaml`, con consumos diarios y rectificaciones. Ver
[`flock-feeding.md`](flock-feeding.md) para endpoints, unidades, paginación,
selección de recetas por UP y el nombre del responsable pendiente del backend.

Las cards de lotes comparten el resumen de ingreso, estado, agrupación y aves.
La mortalidad vigente se consulta de forma independiente y paginada; ver
[`flock-cards.md`](flock-cards.md) para carga progresiva y permisos.

El detalle del plan de manejo resalta todas las actividades previstas que
coinciden con el día o semana actuales. Ver
[`management-plan-progress.md`](management-plan-progress.md) para calendario,
solapamientos y distinción entre planificación y ejecución.

## 2. Standard dependency flow

```text
Page / Component
      ↓
Feature Service
      ↓
ApiClient
      ↓
HttpClient
      ↓
Laravel API
```

Pages normally inject feature services, not `ApiClient` directly.

Feature services inject `ApiClient`.

## 3. ApiClient

Canonical location:

```text
src/app/core/api/api-client.ts
```

Purpose:

Provide one generic HTTP abstraction over Angular `HttpClient`.

Responsibilities:

- API base URL
- GET
- POST
- PUT
- PATCH
- DELETE
- headers
- query parameters
- HttpContext
- withCredentials
- URL normalization

It must remain feature-agnostic.

## 4. API options

Recommended generic type:

```ts
export type ApiOptions = {
  params?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string>;
  context?: HttpContext;
  withCredentials?: boolean;
  baseUrl?: string;
};
```

This keeps feature services independent from manually building `HttpParams`.

## 5. API_CONFIG

Use a configuration InjectionToken.

Recommended location:

```text
src/app/core/config/api.config.ts
```

Concept:

```ts
export interface ApiConfig {
  baseUrl: string;
}

export const API_CONFIG =
  new InjectionToken<ApiConfig>('API_CONFIG');
```

## 6. Environment boundary

The preferred configuration chain is:

```text
environment
    ↓
app.config.ts
    ↓
API_CONFIG
    ↓
ApiClient
```

Feature pages/services should not import:

```text
environment
environment.apiUrl
```

This keeps environment concerns at the composition root.

## 7. Feature service example

```ts
@Injectable({ providedIn: 'root' })
export class ProductionService {
  private readonly api = inject(ApiClient);

  getAll(): Observable<ProductionResponse> {
    return this.api.get<ProductionResponse>('productions');
  }

  getById(id: number): Observable<Production> {
    return this.api.get<Production>(`productions/${id}`);
  }
}
```

Feature services use relative API paths.

## 8. Authentication

ApiClient must remain generic.

Do not:

- store tokens in ApiClient
- add auth business rules to ApiClient
- determine permissions inside ApiClient

Authorization headers belong in an interceptor or auth infrastructure.

## 9. DTOs

DTOs live inside the owning feature's `interfaces/`.

Examples:

```text
interfaces/
  production.ts
  production-request.ts
  production-response.ts
```

Do not create a separate global DTO hierarchy by default.

## 10. Types

Finite aliases and unions belong in the feature's `types/`.

Example:

```text
types/
  production-status.type.ts
  production-filter.type.ts
```

## 11. URLs

Never do this in a page or feature service:

```ts
`${environment.apiUrl}/productions`
```

Instead:

```ts
this.api.get('productions');
```

## 12. Errors

Use interceptors/global mapping for generic transport concerns when useful.

Keep feature-specific error behavior inside the feature service/page.

Preserve backend validation information when needed for forms.

## 13. Pagination

Pagination response shapes are explicitly typed in the feature.

Do not infer pagination only from array size.

## 14. Dates

Use ISO-8601 values from the API.

Avoid locale-dependent parsing.

## 15. Units and money

Contracts must be explicit when unit/currency ambiguity is possible.

Do not derive domain units from visual labels.

## Authentication contract

The configured base path is /api/v1. Browser requests use withCredentials and Laravel Sanctum CSRF; native requests use Bearer for the active PAT, X-Shared-Device-Token for the device and X-GAM-Session for the employee context. The interceptor rejects external origins for secret headers.

Errors preserve the backend problem code. 401 for the employee clears only employee state when the device is still valid; SHARED_DEVICE_UNAUTHORIZED clears the device credential; 419 and 429 remain actionable errors and do not trigger indiscriminate logout.

## Reportes: recorridos de consulta y creación

Las opciones poco evidentes tienen un icono de información con una explicación y ejemplos cotidianos: modo de pesada, origen registrado/estimado, unidad base, mínimo de stock, promedio ponderado, aves representadas, columnas, resúmenes, agrupaciones, período, orden, condiciones de inclusión/exclusión y guardado/exportación. Los modos, las clases de movimiento y las unidades se muestran con nombres en español, conservando los valores originales del contrato HTTP.

La ayuda se abre con hover, foco de teclado o toque; permite mover el puntero al texto para leerlo, y se cierra con Escape, otro toque o una pulsación fuera. Se vincula al botón con `aria-describedby`. Usa popovers nativos para evitar recortes por las tablas/formularios y una presentación en línea cuando esa API no está disponible. Sigue los criterios de contenido [visible al pasar el puntero o enfocar de WAI](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html). Las ayudas de campos están fuera de las etiquetas de casillas para que abrirlas no cambie la selección.

La verificación incluyó 32 pruebas de reporting, lint y build aprobados. Chrome contra el sistema real comprobó hover, permanencia al mover el puntero al texto, teclado/Escape, consulta Grupal conservando su valor API, ayuda del promedio ponderado sin alterar casillas, mínimo de stock y toque en teléfono claro/oscuro sin desbordamientos ni excepciones JavaScript.

Los temas y los diez tipos de reporte usan iconos de Ionicons coherentes entre la portada, sus subpáginas y el creador. Consulta, guardado, descarga, compartición, edición y navegación combinan icono con texto. Los iconos son decorativos (`aria-hidden`) y no sustituyen los nombres accesibles ni los colores semánticos del sistema.

Se verificó en Chrome el dibujo SVG de los cuatro temas y los diez tipos, la consulta real desde ambos recorridos, el creador y la presentación móvil en claro/oscuro sin desbordamientos. Las 19 pruebas de reporting, lint y build de producción pasaron después de incorporar los iconos.

La entrada `/administracion/reportes/reportes` muestra cuatro necesidades: producción/lotes, alimentación/cuidados, inventario/salida de huevos y repartos. Cada tema tiene su subpágina `temas/:topic`, y cada reporte su consulta en `ver/:sourceKey`. El catálogo autorizado del backend determina qué opciones están disponibles; la página inicial no ejecuta consultas ni carga archivos o configuraciones.

`guardados` reúne las consultas frecuentes y `archivos` las descargas. Un enlace a un reporte guardado usa `?guardado=:id` y recupera su configuración directamente desde el API, también después de recargar. Se puede editar, guardar cambios, guardar como otro reporte o eliminar con confirmación. Eliminar una configuración no elimina registros de la granja.

`crear` organiza la personalización en cuatro pasos: tema, datos, período y resultado. El usuario elige entre cada registro y totales/promedios; las columnas y los datos de resumen se marcan con casillas. El orden de columnas se puede cambiar y se muestra antes de consultar. Volver entre pasos conserva las elecciones. Los filtros específicos, exclusiones y orden se muestran al solicitarlos. Se rechazan selecciones vacías antes de avanzar; el backend mantiene la validación autoritativa y agrega unidades cuando corresponde.

Cuando la fuente ofrece `production_unit_id`, Reportes utiliza el mismo `AdminUnitContextService` del dashboard. El filtro muestra el nombre de la UP seleccionada, incluso sin hechos registrados para esa fuente, y sólo se cambia desde el selector general. Una UP específica se envía como igualdad por ID numérico; “Todas las UP” elimina esa condición. Antes de la primera consulta se espera a que el dashboard termine de cargar su selección.

Cambiar de UP cancela consultas anteriores, descarta resultados y enlaces visibles del contexto anterior, limpia galpón/lote y vuelve a la primera página. Conserva las columnas, el período aplicado y el tipo de reporte. Si el usuario está editando un paso del creador, permanece allí. Las consultas estándar, los reportes guardados y el borrador de navegación se adaptan a la UP actual; una configuración guardada no impone otra selección. Guardado y exportación usan ese mismo filtro, mientras que los archivos ya generados conservan su instantánea original. Las fuentes sin ese filtro mantienen su contrato; no se inventa una relación con UP. Este comportamiento es contexto de navegación, no una restricción nueva de autorización por unidad.

La sincronización se verificó con 27 pruebas de reporting aprobadas, lint y build. El recorrido real en Chrome comprobó selección previa, unidad sin datos, cambio automático entre El Ombú y Santa Clara, limpieza de galpón/lote, “Todas las UP”, descarga de Excel con la UP aplicada, apertura de un guardado de otra UP y uso del mismo contexto en el creador. Las configuraciones temporales se eliminaron al finalizar.

Al pasar de una consulta al creador, el estado de navegación conserva las elecciones del usuario actual; al cambiar de identidad se descarta ese borrador. No se agregan tokens ni URLs firmadas al estado de navegación. Las configuraciones reutilizables se guardan en el servidor. El creador sigue las recomendaciones de [formularios por pasos de WAI](https://www.w3.org/WAI/tutorials/forms/multi-page/): muestra el progreso, mantiene los datos y enfoca la pregunta del nuevo paso.

Excel/PDF se preparan con el servicio y polling existentes. En el resultado se muestra el archivo solicitado; el historial completo queda en Reportes exportados. La portada destaca Mis reportes guardados y Reportes exportados con accesos grandes, iconos y colores primario/secundario definidos para ambos temas. La compartición informa el vencimiento y que cualquier persona con el enlace puede abrir la instantánea. El cambio de organización conserva ApiClient, Sanctum/CSRF, los permisos por fuente y el wrapper de descarga web/nativa.

“Compartir con un enlace” abre una ventana centrada sobre el reporte, con fondo oscurecido, el enlace temporal y su vencimiento. Copiar enlace escribe al portapapeles; Compartir abre las opciones del dispositivo/navegador. Un botón accesible con icono de portapapeles junto a la URL también copia, sin abrir opciones de compartir. En navegadores sin soporte para compartir, ese botón se deshabilita y se explica cómo copiar y enviar el enlace. Las confirmaciones y los errores aparecen dentro de la ventana. La copia nativa usa el [plugin Clipboard 8.0.1](https://capacitorjs.com/docs/apis/clipboard), encapsulado en `core/native`; Android/iOS requieren sincronizar y reconstruir la aplicación al desplegar este cambio.

El selector ofrece 30 minutos, 1, 6, 12 y 24 horas, 7 días y 30 días, con 30 minutos de inicio. Envía `expires_in` en minutos y muestra el vencimiento real devuelto por el API. Cambiar duración genera otro enlace sin cerrar la ventana; mientras espera, impide copiar/compartir la URL anterior. Si falla, restaura el plazo y el enlace anterior e informa el error. Los enlaces ya enviados conservan su vencimiento. El API prolonga la disponibilidad del archivo y devuelve `file_expires_at` para actualizar el historial. El temporizador de descarte respeta el límite de 32 bits del navegador, reprogramando la espera de enlaces largos.

`ReportShareDialogComponent` utiliza el [diálogo modal nativo](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog), con foco inicial en Copiar enlace, navegación de teclado contenida, cierre con Escape y devolución del foco al botón de origen. Al vencer el enlace, cambiar de identidad o cambiar el contexto del reporte, se descarta la ventana y su URL; cerrar también descarta respuestas pendientes. No se alteran las URLs ni la configuración de entorno.

La validación de esta corrección incluyó 490 pruebas en la suite completa y 35 pruebas de reporting después del ajuste de foco. Chrome contra Docker Compose comprobó la ventana centrada para PDF/Excel, copia al portapapeles, apertura del enlace sin sesión, cierre con botón/Escape y devolución del foco. El portapapeles se probó con la alternativa web; no se automatizó la hoja de compartir del sistema operativo. En teléfono claro/oscuro se verificó la ventana dentro de la pantalla, sin desbordamiento y con cierre por toque.

Tras separar las acciones y añadir las duraciones, pasaron las 496 pruebas del frontend (46 específicas de reporting/descargas), lint, build y la auditoría de dependencias de producción. La sincronización de Android/iOS incorpora Clipboard. El recorrido de Chrome comprobó los siete plazos contra el API real para PDF/Excel, retención del archivo, copia real desde ambos accesos y llamada independiente a compartir mediante una implementación web controlada, además de enlaces sin sesión y teléfono claro/oscuro. No se automatizó la hoja del sistema operativo ni se probó un dispositivo físico.

La verificación local del 12 de octubre de 2026 incluyó una suite completa de 473 pruebas aprobadas; tras los ajustes finales, las 19 pruebas específicas de reporting volvieron a pasar. Chrome contra Docker Compose aprobó el recorrido de consulta, casillas, resumen por galpón, guardado/edición, descarga real de Excel/PDF, enlace firmado sin sesión, biblioteca, archivos, confirmación de eliminación y teléfono en oscuro, sin excepciones JavaScript. Un recorrido adicional en teléfono claro verificó elegir tema/reporte, conservar datos al volver al tema y el atajo “Este mes”. El lint y la compilación de producción se verificaron; continúan los avisos de SCSS/CommonJS, incluyendo el tamaño del estilo de Reportes, por debajo del límite de error configurado.
