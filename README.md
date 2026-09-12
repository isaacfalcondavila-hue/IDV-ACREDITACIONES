# IDV Acreditaciones v5.1

Versión basada en el flujo real tipo Google Forms:

1. IDV crea un partido/evento.
2. IDV abre acreditaciones.
3. Periodistas y fotógrafos entran al enlace público.
4. Envían una solicitud.
5. La solicitud queda PENDIENTE.
6. IDV revisa desde el panel.
7. IDV aprueba o rechaza.
8. Si aprueba, se genera automáticamente un QR válido.
9. La persona consulta su estado con su código.
10. El día del partido, el QR abre la ficha de verificación.
11. IDV puede marcar la credencial como ENTREGADA.

## Ejecutar

Requiere Node.js 22 LTS.

```powershell
npm.cmd install
npm.cmd start
```

Abrir:

- Formulario público: http://localhost:3000
- Administración: http://localhost:3000/admin.html

Credenciales iniciales:
- Correo: prensa@idv.ec
- Contraseña: IDV2026!

## Primera prueba recomendada

1. Entra a `/admin.html`.
2. Crea `IDV vs Flamengo`.
3. Pulsa `Abrir`.
4. Vuelve a la portada.
5. Envía una solicitud.
6. Guarda el código que aparece.
7. En administración, aprueba la solicitud.
8. Abre `/estado.html?codigo=TU-CODIGO`.
9. Verás el QR.
10. Abre el QR o el enlace de verificación.

## Base de datos

Se guarda en:

`data/idv-acreditaciones.db`

Si vienes de la versión v3, esta versión usa un esquema distinto. Se recomienda usar esta carpeta como proyecto nuevo.

## Publicación

Para que el QR funcione desde otros celulares, define `PUBLIC_URL` con la URL pública real del sistema y despliega en un servidor con almacenamiento persistente.

## Próximas mejoras

- Envío automático de correo al aprobar/rechazar.
- Exportación Excel/CSV.
- Adjuntar credencial de prensa o documento.
- Filtros por medio.
- Contadores y dashboard.
- Auditoría de cambios.
- Límite global de acreditaciones por evento.
- Fechas de apertura/cierre automáticas.


## Corrección v4.1
- Corrige un conflicto de JavaScript con el identificador `open` que impedía mostrar el formulario público aunque el evento estuviera abierto.


## Nuevo en v5: control de chalecos de fotógrafos

Cuando el personal IDV escanea el QR de un fotógrafo desde un teléfono donde ya inició sesión en `/admin.html`,
la ficha de verificación muestra controles internos.

### Entrega
1. Escanear QR.
2. Verificar que el fotógrafo está aprobado.
3. Marcar la credencial física como entregada.
4. Ingresar número de chaleco.
5. Confirmar si se retuvo la credencial/documento.
6. El fotógrafo firma con el dedo en pantalla.
7. Registrar entrega.

El sistema impide asignar un chaleco que ya esté en uso.

### Devolución
1. Escanear nuevamente el mismo QR.
2. La página recuerda automáticamente qué chaleco tiene esa persona.
3. Confirmar el número devuelto.
4. Capturar firma de devolución.
5. Si el número no coincide, el sistema bloquea la devolución y muestra el número correcto.
6. Confirmar devolución.
7. Si se retuvo una credencial/documento, aparece el recordatorio para devolverla.

### Panel Chalecos
En Administración aparece una pestaña **Chalecos** con:
- pendientes de devolución;
- chalecos devueltos;
- fotógrafo y medio;
- número;
- hora de entrega/devolución;
- control de credencial retenida.

## Listado para seguridad

Cada evento tiene un botón **Descargar lista seguridad CSV**.
Incluye únicamente solicitudes aprobadas o con credencial entregada, con:
- tipo;
- nombre;
- documento;
- medio;
- función;
- asignación;
- estado.

El CSV se abre directamente en Excel y puede imprimirse o compartirse internamente.

## Cierre automático

Si el evento tiene una fecha límite y esa fecha ya pasó, la web pública deja de aceptar solicitudes y el evento se cierra automáticamente al consultar el formulario.

## Importante para el día del partido

El teléfono que usará el personal de acreditaciones debe iniciar sesión una vez en:
`/admin.html`

Después, al escanear los QR con ese mismo navegador, la ficha mostrará también los controles internos de credencial y chaleco.
Un teléfono que no tenga sesión de administrador solamente verá la información pública de verificación.


## Corrección v5.1 — Panel de chalecos
- Actualización automática cada 5 segundos mientras la pestaña Chalecos está abierta.
- Botón Actualizar manual.
- Selector de evento más robusto (sin depender de variables globales del navegador).
- Contadores de pendientes, devueltos y credenciales retenidas.
- Detalle completo por movimiento.
- Vista de firma de recepción y firma de devolución.
- Mensaje visible de sincronización/error para detectar problemas de servidor.
