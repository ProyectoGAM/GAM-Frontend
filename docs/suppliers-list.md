# Listado de proveedores

La pantalla de Proveedores usa una grilla de tarjetas compactas: nombre, estado,
dirección y localidad, con acciones de editar y activar/desactivar. En teléfono
se muestra una columna; el espacio disponible determina las columnas adicionales.
Los controles conservan áreas táctiles de al menos 44 px y tokens GAM en ambos temas.
El estado activo usa verde y el inactivo, texto y fondo rojizos suaves.

Nuevo proveedor y Editar abren un modal sobre el listado, sin cambiar la URL.
El formulario compartido conserva los datos de localidad al editar y los errores
del servidor junto a los campos. Cancelar, ×, Escape o el fondo cierran y descartan
el borrador; durante el guardado no se permite cerrar ni enviar dos veces. Tras
guardar, se cierra el modal y se refresca la página actual con los mismos filtros.
Ionic contiene el foco en el modal y lo devuelve al botón de origen al cerrarlo.
Las URLs anteriores de creación/edición reutilizan el mismo formulario.

La primera consulta envía `status=active` a `SuppliersApi`. El filtro permite
consultar activos, inactivos o todos; Buscar aplica los filtros y vuelve a la
primera página. Restablecer limpia la búsqueda y vuelve a activos. El contador usa
el total del API con los filtros aplicados, no la cantidad de tarjetas de la página.

Se conservan la paginación del servidor y la confirmación para cambiar el estado.
Si una página queda fuera del rango al desactivar un proveedor, se consulta la
última página disponible con los mismos filtros. No se modifican contratos ni permisos.
