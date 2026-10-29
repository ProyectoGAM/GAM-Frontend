# Propuesta: finalizar lote

Imagen: [finalizar-lote-modal.png](finalizar-lote-modal.png).

Diseño generado con la herramienta integrada `image_gen`. Implementado en el diálogo
de estado al seleccionar Finalizado; adaptado a móvil y a los tokens de ambos temas.

La jerarquía se centra en el cierre: advertencia roja sobre la reapertura, identidad del lote, resumen de aves antes y después, motivo obligatorio y confirmación explícita. El checkbox marcado representa el estado listo para confirmar dentro del boceto; el flujo real debe iniciarlo desmarcado.

## Prompt final

```text
Use case: ui-mockup.
Asset type: high-fidelity Spanish web application modal design proposal for GAM poultry management.
Primary request: redesign the existing lot finalization modal so it feels polished, deliberate and clearly communicates the serious consequences before closing a flock. This is a new design concept, not an implementation screenshot. Produce ONE sharp, realistic, front-facing interface image, landscape approximately 1536x1152. A single large, perfectly legible centered modal fills most of the image, around 700px wide, with generous margins. A restrained GAM admin dashboard is visible behind a dark navy translucent scrim: navy left sidebar with GAM and Lotes, subtle flock detail content behind. Keep backdrop quiet and out of focus; all actual modal text razor sharp.
Style: polished shippable product UI, clean Inter-like sans-serif, rounded 16px white modal, refined thin borders, restrained shadow, disciplined 24px spacing, strong typographic hierarchy. Serious, calm and professional, never playful. No illustrations of birds, no skulls, no photos, no decorative gradients.
Existing GAM semantic palette: navy headings #17365d, primary text #334255, muted text #5d6e80, white surfaces, canvas #eef2f6, borders #dce3ea. For finalization danger use deep red #a93239 and pale red #fdebed, with ample white space. Use the danger red prominently for the warning, outlined caution triangle, and solid destructive action. Avoid the old yellow warning treatment. Use navy for neutral context, not for the destructive CTA.
Modal layout, top to bottom:
1. At top left a substantial red outlined caution triangle inside a pale red rounded square. Beside it a small uppercase red eyebrow "CIERRE DEL LOTE", followed by a large navy heading "Finalizar lote". A small accessible close X in top right.
2. Supporting text: "Revisá las consecuencias antes de confirmar."
3. A compact neutral bordered context card with small label "Lote a finalizar" and bold value "SANIDAD-PRUEBAS". An "Activo" text badge at the right, subdued rather than bright green.
4. A prominent pale red warning block with a thin red border and a restrained red left accent; small outlined lock icon beside bold red title "El lote no podrá reabrirse". Below, exact copy "Esta acción cerrará el lote y registrará el egreso de las aves remanentes." This is the most visually serious section, not merely a small footnote.
5. A clean two-column impact summary integrated underneath with a subtle arrow between the numbers: label "Aves actuales", large "500"; arrow; label "Aves al finalizar", large "0". Below in smaller muted type: "Se registrará el egreso de 500 aves." Make this summary very clear and avoid implying mortality or deletion of history.
6. Label "Motivo de finalización" with "(obligatorio)" in muted text; a comfortable multiline textarea containing "Fin del ciclo productivo". Small helper "Hasta 500 caracteres."
7. A deliberate confirmation row inside its own lightly bordered rounded card, large CHECKED checkbox at left, exact copy "Entiendo que el lote quedará cerrado y con 0 aves." Use readable wrapping and touch-sized control. It is shown checked solely to demonstrate the enabled final action in this design concept.
8. A footer separated by a thin divider, spacious horizontal actions: outlined neutral navy button "Volver" on the left and solid deep red button with white label "Finalizar lote" and a small lock icon on the right. Both same 48px height. The red action should feel intentional and clearly destructive, not a generic submit.
Constraints: all text exactly in natural Spanish as provided; no gibberish or extra marketing copy. Align everything meticulously, ensure the full modal including footer fits within the image without scrolling or cropping. No external annotations, no device hardware, no alternative states, no extra confirmation step, no watermarks. The modal is the only focal point.
```
