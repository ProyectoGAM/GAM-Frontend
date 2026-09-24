# GAM — especificación de colores

## Estado y alcance

Esta especificación es obligatoria para toda interfaz nueva o modificada en web, Android e iOS. `src/theme/variables.scss` es la fuente ejecutable de los valores; este documento define su significado y reglas de uso. Si cambia un valor o se agrega un token, se actualizan ambos archivos en el mismo cambio.

El tema inicial sigue `prefers-color-scheme` del sistema hasta que la persona elige un tema en el panel administrativo. La elección se guarda como preferencia no secreta en `localStorage` con la clave versionada `gam.theme.preference.v1`. El cambio aplica o quita `ion-palette-dark` en `<html>`; `src/global.scss` usa Ionic `dark.class.css` y los tokens GAM comparten el mismo selector. El servicio define `color-scheme` para los controles nativos. Sin una preferencia guardada, los cambios posteriores del sistema se reflejan mientras la aplicación está abierta.

## Comparación con el panel actual

El panel administrativo actual usa un lienzo claro (`#eef2f6`), barra superior casi blanca (`#f7f9fc`) y navegación azul (`#17365d`). El boceto de Unidades productivas conserva esos valores como base del tema claro y propone extender el tema oscuro a lienzo, superficies, texto y bordes. Varias pantallas actuales todavía tienen colores literales en sus SCSS; esta especificación no las convierte por sí sola. Cada pantalla que se modifique debe migrar sus colores al contrato de abajo.

## Paletas semánticas

| Token CSS | Uso | Claro | Oscuro |
| --- | --- | --- | --- |
| `--gam-color-canvas` | Fondo de páginas y área de trabajo | `#eef2f6` | `#121d29` |
| `--gam-color-surface` | Tarjetas, formularios y paneles | `#ffffff` | `#1d2b3b` |
| `--gam-color-surface-alt` | Barra superior y superficies secundarias | `#f7f9fc` | `#1a2939` |
| `--gam-color-heading` | Títulos y nombres destacados | `#17365d` | `#e5eef7` |
| `--gam-color-text` | Texto principal | `#334255` | `#d4e1ec` |
| `--gam-color-text-muted` | Texto secundario que sigue siendo legible | `#5d6e80` | `#a9bfd2` |
| `--gam-color-border` | Separadores y bordes decorativos de tarjetas | `#dce3ea` | `#405367` |
| `--gam-color-control-border` | Borde necesario para reconocer campos y controles | `#8091a2` | `#68839d` |
| `--gam-color-primary` | Acción principal y enlaces destacados | `#17365d` | `#aecded` |
| `--gam-color-on-primary` | Texto e iconos sobre acción principal | `#ffffff` | `#122436` |
| `--gam-color-primary-soft` | Selección y énfasis de baja intensidad | `#dce8f4` | `#29445f` |
| `--gam-color-focus` | Indicador de foco visible | `#3375b3` | `#91b7dc` |
| `--gam-color-nav` | Fondo de navegación administrativa | `#17365d` | `#10253e` |
| `--gam-color-nav-hover` | Navegación al pasar o abrir grupo | `#23476d` | `#1f3b57` |
| `--gam-color-nav-active` | Entrada de navegación activa | `#2c5279` | `#2a4b69` |
| `--gam-color-nav-text` | Texto principal de navegación | `#e5eef7` | `#e5eef7` |
| `--gam-color-nav-muted` | Texto secundario de navegación | `#b8cce0` | `#b8cce0` |
| `--gam-color-nav-focus` | Indicador de foco visible sobre navegación | `#91b7dc` | `#91b7dc` |
| `--gam-color-success` | Texto/icono de éxito | `#176b45` | `#9be5bd` |
| `--gam-color-success-soft` | Fondo de mensaje de éxito | `#e6f5ec` | `#183a2c` |
| `--gam-color-warning` | Texto/icono de advertencia | `#8a5a00` | `#f4cc7a` |
| `--gam-color-warning-soft` | Fondo de advertencia | `#fff2d6` | `#44351d` |
| `--gam-color-danger` | Texto/icono de error o acción destructiva | `#a93239` | `#ffb3b8` |
| `--gam-color-danger-soft` | Fondo de error | `#fdebed` | `#4c2930` |

## Reglas para toda interfaz futura

1. Usar tokens `--gam-color-*` según su función, incluidos los estilos de componentes Ionic mediante sus propiedades `--background`, `--color`, `--border-color`, etc. No copiar hexadecimales, `rgb()`, `hsl()` ni nombres de color a SCSS/HTML de componentes. Los valores literales viven solamente en `src/theme/variables.scss`.
2. Usar `--gam-color-text`, `--gam-color-heading` y `--gam-color-text-muted` sobre `surface`, `surface-alt` o `canvas`; usar `--gam-color-on-primary` sobre `primary`. No intercambiar pares de primer plano y fondo.
3. Usar los pares `success`/`success-soft`, `warning`/`warning-soft` y `danger`/`danger-soft` para estados. Añadir texto o icono además del color para comunicar el estado.
4. No crear paletas paralelas dentro de un feature. Si falta un rol visual, agregar un token semántico para ambos temas y documentarlo aquí. Para transparencias, derivar de un token con `color-mix()`; `transparent`, `currentColor` e `inherit` están permitidos.
5. Revisar la pantalla en claro y oscuro, en teléfono y escritorio. Texto normal debe alcanzar al menos 4.5:1; texto grande, iconos informativos, bordes necesarios para reconocer controles y foco, al menos 3:1. El borde decorativo de tarjetas no sustituye a `--gam-color-control-border` en un campo.
6. Al modificar una pantalla heredada con colores literales, reemplazar los colores de la parte intervenida por tokens. No es necesario migrar pantallas ajenas al cambio.

Ejemplo de aplicación en un componente Ionic:

```scss
.unit-card {
  background: var(--gam-color-surface);
  border: 1px solid var(--gam-color-border);
  color: var(--gam-color-text);
}

ion-button.primary-action {
  --background: var(--gam-color-primary);
  --color: var(--gam-color-on-primary);
}
```

## Contraste de referencia

Los pares base se revisaron con WCAG: texto principal sobre superficie supera 10:1 en ambos temas; texto secundario sobre `canvas` supera 4.5:1; acción principal con su texto supera 9:1. Los pares de mensajes de éxito, advertencia y error superan 5:1. El borde de control supera 3:1 frente a las superficies de ambos temas. Cualquier nuevo par debe verificarse antes de incorporarlo.
