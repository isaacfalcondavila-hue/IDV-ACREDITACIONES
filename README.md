# IDV Acreditaciones v6.4

Cambios incluidos en esta versión:

1. **Cabecera con los tres escudos**
   - Independiente del Valle
   - Independiente Juniors
   - Dragonas IDV
   - Se muestran como marcas visuales en la parte superior.

2. **Color institucional ajustado**
   - Se eliminó el botón rojo principal.
   - El color de acción principal ahora es azul / negro acorde a la línea negriazul.

3. **Registro de asistencia**
   - Cuando una persona llega y se escanea / entrega la credencial, se puede marcar asistencia.
   - El panel muestra quién asistió y quién no.
   - Se añadió exportación de asistencia por evento.

4. **Control de chalecos**
   - Se mantiene operativo.

5. **Listado para Excel**
   - El CSV sale con separador compatible (`sep=;`) para abrir mejor en Excel.
   - También se corrigió el salto de línea real.

## Archivos principales
- `server.js`
- `package.json`
- `styles.css`
- `index.html`
- `prensa.html`
- `fotografos.html`
- `estado.html`
- `verificar.html`
- `admin.html`
- carpeta `logos/`

## Importante para GitHub / Railway
Sube **todos los archivos de esta carpeta**, incluyendo:
- `styles.css`
- `server.js`
- `package.json`
- la carpeta `logos`

Si en GitHub ya existe el proyecto, reemplaza el contenido anterior por este nuevo.


## v6.4.1 — Corrección evento público

Se corrigió un problema por el cual un partido marcado como **Abierto** podía no aparecer en la página pública.

### Causa
El servidor intentaba cerrar automáticamente el evento comparando `deadline` con la hora del servidor. Los campos `datetime-local` no incluyen zona horaria y Railway suele ejecutar en UTC, por lo que el evento podía cerrarse antes de lo previsto en Ecuador.

### Cambio
Ahora el evento público depende únicamente del estado administrativo:
- `open` → visible y permite registros.
- `closed` / `archived` / `draft` → no visible para registros.

La fecha límite sigue guardada como referencia, pero no cierra automáticamente el evento.


## v6.4.2 — Evento abierto visible inmediatamente

Se corrigió un segundo problema posible: la respuesta de `/api/public/event`
podía quedarse en caché mostrando `event: null` incluso después de abrir el partido
desde Administración.

Cambios:
- `/api/public/event` ahora envía `Cache-Control: no-store`.
- La portada y los formularios consultan el evento con `cache: 'no-store'`.
- Cada consulta añade un parámetro de tiempo para impedir respuestas antiguas.
- El endpoint devuelve `version: 6.4.2` y `serverTime` para facilitar diagnóstico.


## v6.5 — Excel profesional IDV

Los botones **Listado seguridad Excel** y **Asistencia Excel** ahora generan `.xlsx` reales.

Mejoras:
- Documentos/cédulas tratados como texto para que Excel no los convierta a notación científica.
- Tildes y ñ correctas.
- Fechas/hora ya formateadas y legibles.
- Anchos de columna definidos para que no aparezca `########`.
- Ajuste de texto para funciones, medios y asignaciones largas.
- Encabezado institucional negro/azul IDV.
- Filtros automáticos.
- Filas alternadas para lectura rápida.
- Panel resumen del evento.
- Listado seguridad: hojas `Listado general`, `Prensa escrita` y `Fotógrafos`.
- Asistencia: hojas `Asistencia`, `Presentes` y `No asistieron`.


## v6.5.1 — Escudos alineados

Se normalizaron los PNG de IDV, Independiente Juniors y Dragonas para que los tres tengan:
- el mismo lienzo transparente;
- la misma altura visual del escudo;
- centrado vertical y horizontal idéntico;
- una caja CSS fija de 42 × 42 px en escritorio y 30 × 30 px en móvil.

No se modificó ninguna otra función del sistema.


## v6.5.2 — Escudos proporcionados

Se corrigió el tamaño óptico del escudo de Independiente Juniors.
Aunque los tres archivos usaban la misma caja CSS, el PNG de Juniors ocupa más área dentro de su lienzo y por eso se veía considerablemente más grande.

Ahora:
- los tres escudos siguen centrados verticalmente;
- usan la misma caja;
- Juniors se reduce ópticamente al 78%;
- el ajuste también se aplica en móvil.


## v6.6 — Orden por medio + correo automático de aprobación

### Excel
Los reportes de seguridad y asistencia ahora se ordenan primero por **medio de comunicación**.
Ejemplo: todas las personas de `LA RED` aparecen juntas, después el siguiente medio, etc.
Dentro de cada medio se ordena por tipo, apellido y nombre.

### Correo de aprobación
Cuando Administración cambia una solicitud a **Aprobado**:
1. se genera/verifica su token QR;
2. la acreditación queda aprobada inmediatamente;
3. se envía un correo al email que registró el periodista/fotógrafo;
4. el correo incluye:
   - nombre;
   - partido/evento;
   - medio;
   - tipo de acreditación;
   - asignación;
   - QR incrustado;
   - botón `Ver mi acreditación y QR`;
   - enlace alternativo y código de solicitud.

Si el correo no está configurado o falla, **la aprobación NO se pierde**.
El panel avisa al administrador que la acreditación fue aprobada pero el correo no pudo enviarse.

### Variables nuevas en Railway
Configura:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM_EMAIL`
- `SMTP_FROM_NAME`

Ejemplo para Gmail:
- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=465`
- `SMTP_USER=tu-cuenta@gmail.com`
- `SMTP_PASS=contraseña de aplicación de Google`
- `SMTP_FROM_EMAIL=tu-cuenta@gmail.com`
- `SMTP_FROM_NAME=Acreditaciones IDV`

No uses la contraseña normal de Gmail. Google requiere una **contraseña de aplicación**
cuando la cuenta tiene verificación en dos pasos.
