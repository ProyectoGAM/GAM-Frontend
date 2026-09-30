# ADR 007 - Multi-login and shared-device sessions

## Estado

Aceptado e implementado.

## Decisión

Se conserva una pantalla de acceso personal como entrada predeterminada. La web usa cookies HttpOnly con CSRF y el cliente nativo usa PAT Bearer. Una instalación compartida se vincula con un código de un solo uso y una credencial de dispositivo independiente.

El estado de autenticación vive en core/auth como señales. La UI no lee tokens ni plugins: AuthStore coordina AuthApi y CredentialStorage. El interceptor adjunta credenciales únicamente a la API configurada.

## Seguridad y ciclo de vida

- El modo local no es autorización.
- La web no usa localStorage para secretos.
- El PIN se envía como string exacto de cuatro caracteres.
- Al iniciar o reanudar el modo compartido se verifica el dispositivo y se muestra el selector.
- Terminar la sesión limpia el empleado y conserva la vinculación.
- Un error de sesión de empleado no borra automáticamente la credencial del dispositivo.

## Alternativas descartadas

- Un único PAT para web y móvil: mezclaba revocación, CSRF y almacenamiento.
- Recuperar automáticamente el último empleado: permitía que una cookie o un estado local pareciera presencia humana.
- Un booleano shared en localStorage como autorización: no es una evidencia del backend.
- Un estado global externo: signals y servicios pequeños cubren esta entrega sin una dependencia adicional.

## Consecuencias

Se requieren pruebas de navegador real para cookies, CSRF, recarga, pestañas e inactividad. La API debe conservar los headers de contexto y el backend sigue siendo la única autoridad.
