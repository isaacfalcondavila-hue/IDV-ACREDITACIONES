# IDV Acreditaciones v6

Esta versión rehace el módulo de chalecos y simplifica el despliegue en GitHub/Railway.

## Cambio estructural importante

Los archivos frontend ahora están directamente en la raíz del proyecto:

- index.html
- admin.html
- estado.html
- verificar.html
- styles.css
- server.js
- package.json

Ya NO existe la carpeta `public`.

El servidor entrega explícitamente esos archivos, evitando que GitHub/Railway terminen usando una copia vieja ubicada en otra carpeta.

## Control de chalecos v6

`GET /api/admin/vests` ahora devuelve un objeto de diagnóstico con `totalAll`, `totalForEvent`, `serverTime` y `rows`.

El panel Administración > Chalecos muestra pendientes, devueltos, credenciales retenidas, tabla completa, firmas y un bloque de diagnóstico del servidor.

## Railway

Mantén: `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PUBLIC_URL`.

Para persistencia real se añadió `DATA_DIR`. Recomendado: volumen en `/data` y variable `DATA_DIR=/data`.

## Prueba

1. Crea/abre evento.
2. Registra y aprueba fotógrafo.
3. Escanea QR con sesión IDV.
4. Entrega chaleco y firma.
5. Abre Administración > Chalecos.
6. Selecciona evento.
7. El panel indica cuántos movimientos existen en servidor y cuántos pertenecen al evento.


## v6.1 — Menú separado de Prensa / Fotógrafos

La portada pública ya no muestra el formulario directamente.

Ahora presenta dos accesos grandes:

- **Prensa escrita** → `/prensa.html`
- **Fotógrafos** → `/fotografos.html`

Cada formulario lleva el tipo de acreditación bloqueado desde el servidor/interfaz, por lo que el solicitante ya no puede equivocarse seleccionando la categoría.

Todo el flujo posterior se mantiene:
solicitud → revisión IDV → aprobación → QR → entrega de credencial → control de chaleco para fotógrafos.
