# Propuesta visual: editor de alimentación v3

Imagen: `feeding-editor-v3.png`. Edición con la herramienta integrada imagegen de `feeding-editor-v2.png`.

Selector confirmado: grupo de radio buttons excluyentes con aspecto de botones; automático celeste, manual amarillo tenue. Una sola selección, indicada con círculo relleno y borde destacado. Se conservan los tooltips, campos y confirmación de la v2. Automático usa la etapa aplicable a la edad actual del lote según la API. Valores ilustrativos.

## Prompt utilizado

Use case: precise-object-edit / UI mockup revision.
Edit the provided image (Image 1 is the edit target) with one focused change: replace the mode checkbox selector with mutually exclusive RADIO BUTTONS and apply the user's mode colors.

Preserve the complete existing Spanish design board: same dimensions and composition, mobile form at left, desktop manual form at center, desktop automatic form at upper right, all tooltips, confirmation dialog, all text and values, spacing, field states, all other icons and primary action buttons. Keep the GAM light theme. No new sections or controls.

Change ONLY the two "Modo manual" / "Modo Automático" option cards in ALL THREE FORM VIEWS:
- Each pair is one radio group: exactly ONE selected. Use a CIRCULAR outline ring with a smaller filled circular DOT for selected, empty circular ring for unselected. Absolutely NO square checkbox, check mark or tick.
- Both options retain their equal-width, rounded rectangular button/card appearance and full clickable touch area.
- Manual identity: soft pale yellow background #fff2d6 with legible dark ochre text #8a5a00. When selected, emphasize it with a crisp 2px ochre border and filled ochre circular radio dot. When unselected, retain a very light pale yellow background, subtle control border, and an empty radio circle.
- Automatic identity: light sky blue/celeste background #dce8f4 with navy text #17365d. When selected, emphasize it with a crisp 2px navy border and filled navy circular radio dot. When unselected, retain a very light sky blue background, subtle control border, and empty radio circle.
- Selected choices must use these LIGHT color fills with DARK text, not navy fills and white text. Make the selected outline and dot unambiguous so selection does not rely only on the hue.
- In the MOBILE MANUAL form and CENTER DESKTOP MANUAL form select "Modo manual" (yellow, filled radio dot); leave "Modo Automático" unselected (blue, empty ring).
- In the RIGHT DESKTOP AUTOMATIC form select "Modo Automático" (celeste, filled radio dot); leave "Modo manual" unselected (pale yellow, empty ring).
- Keep exact labels: "Modo manual", "Modo Automático".
- All "Aplicar cambio" and confirmation action buttons elsewhere remain original navy styling.
- Automatic fields remain disabled with lock icons; confirmation remains only for automatic to manual; preserve help popovers and all wording unchanged.
Render sharp clean UI typography and flat solid fills, faithful to the original image.
