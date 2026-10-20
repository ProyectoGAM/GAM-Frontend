# Propuesta visual: editor de alimentación v2

Generada con la herramienta integrada imagegen. La imagen muestra valores ilustrativos.

Decisión confirmada por el usuario: el modo automático toma la última etapa aplicable a la edad actual del lote, conforme al contrato de la API. La ración y la cantidad se muestran sin permitir edición. Esta decisión no requiere modificar la imagen, cuyos valores del plan son ilustrativos.

## Prompt utilizado

Use case: ui-mockup.
Create ONE polished high-fidelity Spanish UI design review image for the existing GAM poultry-management application, showing redesign of the modal "Cambiar ración y cantidad". This is a concrete implementable Ionic-style form design, not a marketing poster. Landscape presentation board, high resolution with perfectly legible Spanish text, flat straight-on UI, generous spacing. Match existing light-theme GAM colors precisely: canvas #eef2f6, surface #ffffff, secondary surface #f7f9fc, navy headings/primary #17365d, body #334255, muted #5d6e80, decorative borders #dce3ea, control borders #8091a2, selected-soft #dce8f4, warning ink #8a5a00 on #fff2d6. Clean sans-serif UI typography. No invented logos, gradients, decorative illustrations, glass effects, perspective or device chrome.

Composition: an organized board with THREE columns, clear small captions outside the UI:
LEFT narrow column: full mobile version of manual form, tall, approximately 390px mobile proportions.
CENTER wider column: desktop manual form on top, and three concise tooltip examples below it.
RIGHT wider column: desktop automatic form on top, confirmation dialog below it.
All frames large enough for legible text. The title of the board is simply "Alimentación · Cambiar ración y cantidad". Keep the scope entirely this modal and its related states; no chart/history/dashboard.

COMMON FORM STRUCTURE:
White modal, subtle border and shadow, top toolbar pale #f7f9fc. Title exactly "Cambiar ración y cantidad" with a small circled i information icon beside the title, and "Cerrar" at right. Body context "Lote LOT-FEED-TEST". Mode selector label "Modo de alimentación".
Mode selector consists of TWO equal-width button-shaped choices with clearly SQUARE checkbox marks inside, only ONE selected at a time. Exact labels "Modo manual" and "Modo Automático". Selected option navy with white text and checked square; unselected option white with control border and empty square. They are mutually exclusive; never show both checked. Large touch targets.

MANUAL FORM in left mobile and center desktop:
Current mode context small "Modo actual: Automático". Mode manual selected, Modo Automático unselected.
Field labels EXACTLY "Ración" followed by circled i icon; "Cantidad (kg)" followed by circled i icon. Never use "Nueva" or "Nuevo" anywhere.
Recipe dropdown default option EXACTLY "Conservar la ración actual (Pollitos bb 1)" with visible down-chevron.
Quantity is a free text numeric input, NOT a dropdown. Its placeholder EXACTLY "Conservar cantidad actual (20 kg)". A separate fixed suffix segment INSIDE the input on its RIGHT prominently reads "kg", separated by a fine vertical divider. This suffix is visual and never editable. Allow full placeholder to fit without truncation, using appropriate layout/font size.
No helper paragraphs or colored warning notice beneath title or beneath fields: they were moved to information tooltips.
Footer primary navy full-width button exactly "Aplicar cambio".
Mobile uses single-column fields and fixed accessible bottom action bar with safe-area spacing. Desktop retains same flow in a wider modal with comfortable padding. No need for a redundant Cancel button because Cerrar is available in header.

AUTOMATIC FORM in upper RIGHT:
Same exact title, context, labels and control placement.
Current mode context "Modo actual: Manual". Modo manual unselected; Modo Automático selected with square check.
A small source caption "Plan de manejo vigente".
Ración field shows "Pollitos bb 1", disabled with subtle gray fill and lock icon; NO editable dropdown affordance.
Cantidad (kg) shows "20", disabled with gray fill and lock icon and same separate fixed "kg" suffix inside field.
Small source annotation "Valores definidos por el plan" is allowed, but not the long general help paragraph.
Footer "Aplicar cambio".
These are illustrative plan values. DO NOT claim a particular age, stage number, latest future stage, or stage selection policy in the image.

TOOLTIPS below center manual form:
Show three white bordered popovers with small pointer and circled i matching the three icons on form, captions outside popovers "Información general", "Ración", and "Cantidad (kg)". These are expanded help examples SEPARATE from the normal form, not permanently displayed helper blocks.
GENERAL exact tooltip copy: "El cambio aplica desde hoy y pasa la alimentación a modo manual. La cantidad diaria queda fija hasta un nuevo cambio; no se ajusta con la edad ni con la cantidad de aves."
RACIÓN exact tooltip copy: "Solo recetas activas con stock positivo en la UP del lote. Conservá la ración actual para modificar únicamente la cantidad."
CANTIDAD exact tooltip copy: "Ingresá kilogramos con hasta tres decimales. 0,001 kg equivale a 1 g. Conservá la cantidad actual para modificar únicamente la ración."
All information icon triggers represent tap/click accessible popovers on mobile, not hover-only help.

CONFIRMATION in lower RIGHT:
External state caption exactly "Solo Automático → Manual".
White dialog with small amber warning triangle on pale warning circle.
Title exactly "¿Activar el modo manual?"
Small summary line "Pollitos bb 1 · 20 kg/día".
Body exact: "La cantidad diaria quedará fija en 20 kg. No se ajustará con la edad ni con la cantidad de aves. Para retomar los ajustes del plan y no actualizar la cantidad a mano, deberás volver al modo automático."
Two actions, secondary outline "Seguir en automático", primary navy "Confirmar modo manual". Wrap the buttons into a tidy vertical stack if needed to keep full Spanish labels readable.
Below this dialog OUTSIDE the application frame one small design note exactly "Manual → Manual y Manual → Automático: sin confirmación."
Confirmation is only shown after clicking Aplicar cambio when original persisted mode is Automático and chosen mode is manual. Do NOT show confirmation on any other transition.

Important: exact accents and Spanish copy; no lorem ipsum, no extra controls, no text clipping, no deleting actions. Maintain clean hierarchy. The long notice must exist ONLY in the tooltip example and the transition warning in its confirmation dialog; the main forms must stay compact. Values Pollitos bb 1 and 20 kg are illustrative, not fetched live.
