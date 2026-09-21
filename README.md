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


## v6.7 — Envío por Resend API

Se reemplazó el envío SMTP por Resend vía HTTPS para evitar el bloqueo de puertos SMTP de Railway.

Variables necesarias en Railway:
- `RESEND_API_KEY`: la API key creada en Resend.
- `RESEND_FROM`: opcional. Para demo puede ser `Acreditaciones IDV <onboarding@resend.dev>`.

Para la primera demostración con `onboarding@resend.dev`, prueba enviando la acreditación
al mismo correo con el que creaste la cuenta de Resend. Para enviar a cualquier correo
de prensa, verifica un dominio propio en Resend y cambia `RESEND_FROM`.

Las antiguas variables SMTP pueden quedarse en Railway; esta versión ya no las usa.


## v6.8 — Archivo separado de partidos / eventos

La pestaña `Partidos / eventos` ahora se divide en dos vistas:

- `Partidos / eventos`: muestra únicamente eventos vigentes (`draft`, `open` y `closed`).
- `Archivados`: contiene únicamente eventos con estado `archived`.

Al pulsar `Archivar`, el evento desaparece inmediatamente de la vista principal y pasa a
`Archivados`, evitando que la pantalla se acumule con partidos anteriores.

Los eventos archivados conservan:
- todas sus solicitudes;
- acreditaciones;
- asistencias;
- movimientos de chalecos;
- Listado de seguridad Excel;
- Asistencia Excel.

También se añadió `Restaurar`: devuelve un evento archivado a la lista principal en estado
`closed`, para evitar abrir acreditaciones accidentalmente.


## v6.8.1 — Solicitudes de eventos archivados ocultas

Se corrigió el panel `Solicitudes` para que no siga mostrando acreditaciones
pertenecientes a partidos archivados.

Comportamiento:
- Evento vigente (open / closed): sus solicitudes aparecen en `Solicitudes`.
- Evento archivado: sus solicitudes dejan de aparecer en el panel operativo.
- Los datos NO se eliminan.
- Los reportes Excel del evento archivado siguen disponibles desde `Archivados`.
- Si el evento se restaura, sus solicitudes vuelven a aparecer automáticamente.


## v6.9 — Seguridad Fase 1

Esta versión endurece el backend antes de uso público real.

### Protecciones añadidas
- Sin contraseñas ni `JWT_SECRET` inseguros por defecto en producción.
- `JWT_SECRET` obligatorio de mínimo 32 caracteres.
- Contraseña administrativa obligatoria de mínimo 12 caracteres.
- Rate limiting contra fuerza bruta en el login.
- Límites de frecuencia para registros y consultas públicas.
- Cookies administrativas `HttpOnly`, `Secure` en producción y `SameSite=Strict`.
- Sesiones administrativas registradas en base de datos y revocadas al cerrar sesión.
- Sesión administrativa reducida a 8 horas.
- Comprobación de origen para operaciones administrativas (defensa CSRF).
- Cabeceras HTTP de seguridad con Helmet.
- Panel y API administrativa con `Cache-Control: no-store`.
- Códigos públicos generados con criptografía segura y más largos.
- Validación de email, documento y longitudes del formulario.
- Validación estricta de las firmas PNG.
- Protección contra fórmulas maliciosas en CSV/Excel.
- Registro de auditoría de login, eventos, aprobaciones, eliminaciones, asistencia y chalecos.
- Endpoint administrativo `/api/admin/audit?limit=100` para revisar actividad.
- Las solicitudes de eventos archivados se excluyen también desde el backend.

### Antes de desplegar
En Railway confirma:
- `NODE_ENV=production`
- `JWT_SECRET`: 32 caracteres o más, aleatorio y único.
- `ADMIN_EMAIL`: correo administrativo.
- `ADMIN_PASSWORD`: 12 caracteres o más, única.
- `PUBLIC_URL`: URL pública correcta.
- `DATA_DIR=/data` si estás usando volumen persistente.

La aplicación no iniciará en producción si faltan las credenciales críticas o son demasiado débiles.


## v6.10 — Competición y flujo automático Libertadores

Primer cambio solicitado.

### Crear partido
Se añadió el campo `Competición`:
- Detectar automáticamente por el título
- CONMEBOL Libertadores
- Copa Ecuador
- Otra competición

El modo automático detecta títulos que contengan `Libertadores` o `Copa Ecuador`.
Para un título como `IDV vs Flamengo`, selecciona `CONMEBOL Libertadores` una sola vez y
desde ese momento el comportamiento es automático.

### Evento Libertadores
Antes de entrar al formulario:
- se muestra un aviso informativo;
- se aclara que enviar datos no garantiza la aprobación;
- se pide revisar el correo para conocer el estatus;
- se muestra el Manual de Clubes Libertadores 2026;
- el usuario debe confirmar que leyó la información para continuar.

Al aprobar una acreditación, el correo agrega automáticamente el enlace oficial al Manual de Clubes.

### Copa Ecuador / otras
No se muestra el aviso de Libertadores y el correo no incluye el manual.

Manual:
https://www.conmebol.com/documentos/nrh-manual-de-clubes-conmebol-libertadores-2026/


## v6.11 — Medios de comunicación + Copa Sudamericana

### Competición
Se añadió `CONMEBOL Sudamericana` al selector de partidos y a la detección automática
cuando el título contiene la palabra `Sudamericana`.

El Manual de Clubes configurado sigue siendo exclusivamente el de CONMEBOL Libertadores 2026,
por lo que Sudamericana no recibe el manual de Libertadores.

### Menú principal
`Prensa escrita` ahora se llama `Medio de comunicación`.
La descripción contempla:
- Medio digital
- Prensa escrita
- Radio
- TV
- Camarógrafo

Los iconos fueron reemplazados por SVG más claros:
- Medio de comunicación: icono de medio/noticias
- Fotógrafos: cámara fotográfica

### Formulario de medios
`Tipo de acreditación` ahora es obligatorio y permite:
- MEDIO DIGITAL
- PRENSA ESCRITA
- RADIO
- TV
- CAMARÓGRAFO

Si se selecciona CAMARÓGRAFO aparece una advertencia:
`Esta acreditación es válida únicamente para la sala de rueda de prensa.
No habilita ingreso a cancha ni a otras zonas de cobertura.`

La restricción también aparece en:
- correo de aprobación;
- estado de la solicitud;
- verificación QR;
- panel administrativo;
- Excel de seguridad y asistencia.


## v6.12 — Nacionalidad + nuevo orden de formularios

Se reorganizaron los formularios de `Medio de comunicación` y `Fotógrafos` con este orden:

1. Nombres / Apellidos
2. Medio de comunicación / Cargo o función
3. Cédula o Pasaporte / Nacionalidad o país
4. Correo / Teléfono
5. Tipo de acreditación
6. Cobertura
7. Observaciones

### Nacionalidad
Se añadió un selector obligatorio con 250 países/nacionalidades.
Ecuador aparece primero por conveniencia y el resto se muestra en orden alfabético.

El dato de nacionalidad se guarda en la base de datos y también aparece en:
- panel administrativo;
- correo de aprobación;
- consulta de estado;
- verificación QR;
- Excel de seguridad;
- Excel de asistencia;
- exportaciones CSV.
