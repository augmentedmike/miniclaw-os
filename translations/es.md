# Traducción al español de MiniClaw (es)

> Todas las cadenas de texto visibles para el usuario extraídas del código fuente de miniclaw-os.
> Formato: `Inglés original` → `Traducción al español`
> Agrupadas por archivo fuente y categoría.

---

## Tabla de contenidos

1. [Descripciones de paquetes de plugins](#descripciones-de-paquetes-de-plugins)
2. [Descripciones de comandos CLI](#descripciones-de-comandos-cli)
3. [Descripciones de opciones y argumentos CLI](#descripciones-de-opciones-y-argumentos-cli)
4. [Mensajes de error y validación](#mensajes-de-error-y-validación)
5. [Mensajes de éxito y estado](#mensajes-de-éxito-y-estado)
6. [Web UI — Asistente de configuración](#web-ui--asistente-de-configuración)
7. [Web UI — Tablero y componentes](#web-ui--tablero-y-componentes)
8. [Web UI — Página de configuración](#web-ui--página-de-configuración)
9. [Salida de scripts de shell](#salida-de-scripts-de-shell)

---

## Descripciones de paquetes de plugins

| Plugin | Inglés | Español |
|--------|--------|---------|
| mc-authenticator | TOTP 2FA code generation — Google Authenticator compatible | Generación de códigos TOTP 2FA — compatible con Google Authenticator |
| mc-backup | Create tgz backups and prune old archives | Crear copias de seguridad tgz y eliminar archivos antiguos |
| mc-blog | Persona-driven blog writing — journal, self-reflection, storytelling from the agent's perspective | Escritura de blog impulsada por personalidad — diario, autorreflexión, narrativa desde la perspectiva del agente |
| mc-board | State-machine kanban board — the agent's prefrontal cortex | Tablero kanban con máquina de estados — la corteza prefrontal del agente |
| mc-booking | Agent-driven scheduling assistant — booking requests, approval flow, availability management | Asistente de programación impulsado por agente — solicitudes de reserva, flujo de aprobación, gestión de disponibilidad |
| mc-calendar | Apple Calendar integration via macOS EventKit — list, create, update, delete, and search events | Integración con Apple Calendar vía macOS EventKit — listar, crear, actualizar, eliminar y buscar eventos |
| mc-context | Engineered context windows for miniclaw channel sessions | Ventanas de contexto diseñadas para sesiones de canal MiniClaw |
| mc-contribute | MiniClaw contribution workflow plugin | Plugin de flujo de trabajo de contribución de MiniClaw |
| mc-designer | Visual creation studio — the agent's occipital lobe | Estudio de creación visual — el lóbulo occipital del agente |
| mc-devlog | Daily devlog — aggregates git activity, credits contributors, publishes to GitHub Discussions and blog | Registro de desarrollo diario — agrega actividad git, acredita contribuidores, publica en GitHub Discussions y blog |
| mc-docs | Document authoring and versioning plugin for MiniClaw | Plugin de redacción y versionado de documentos para MiniClaw |
| mc-email | Email integration — read, triage, archive, send via himalaya CLI | Integración de correo electrónico — leer, clasificar, archivar, enviar vía himalaya CLI |
| mc-fan | Fan engagement tools | Herramientas de interacción con fans |
| mc-github | Manage GitHub issues, PRs, releases, and Actions workflows via gh CLI. | Gestionar issues, PRs, releases y flujos de trabajo de Actions de GitHub vía gh CLI. |
| mc-guardian | Absorbs non-fatal uncaught exceptions to prevent plugin errors from crashing the gateway | Absorbe excepciones no fatales no capturadas para evitar que errores de plugins causen fallos en el gateway |
| mc-human | Ask-a-human — deliver interactive noVNC session to Michael via Telegram when AM hits captchas or login flows | Consultar a un humano — entregar sesión interactiva noVNC al usuario vía Telegram cuando el agente encuentra captchas o flujos de inicio de sesión |
| mc-jobs | Role-specific job templates and workflows for MiniClaw agents | Plantillas de trabajo y flujos específicos por rol para agentes MiniClaw |
| mc-kb | SQLite vector knowledge base — long-term semantic memory | Base de conocimiento vectorial SQLite — memoria semántica a largo plazo |
| mc-memo | Short-term working memory for agent runs — per-card scratchpad, append-only markdown files | Memoria de trabajo a corto plazo para ejecuciones del agente — bloc de notas por tarjeta, archivos markdown de solo escritura |
| mc-memory | Unified memory gateway — routes writes, searches all stores, promotes memos to KB | Gateway de memoria unificada — enruta escrituras, busca en todos los almacenes, promueve memos a la base de conocimiento |
| mc-moltbook | Moltbook social network integration for MiniClaw agents | Integración de la red social Moltbook para agentes MiniClaw |
| mc-oauth-guard | OAuth token refresh failure guard — detects retry storms, applies backoff, auto-disables failing profiles, and attempts keychain recovery | Protección contra fallos de actualización de tokens OAuth — detecta tormentas de reintentos, aplica retroceso, deshabilita automáticamente perfiles fallidos e intenta recuperación del llavero |
| mc-queue | Queue triage enforcement for miniclaw channel sessions | Aplicación de clasificación de cola para sesiones de canal MiniClaw |
| mc-realty | Real estate workflow orchestration — comp analysis, listings, showings, transactions, market reports | Orquestación de flujo de trabajo inmobiliario — análisis comparativo, listados, visitas, transacciones, informes de mercado |
| mc-reddit | Reddit API client — posts, comments, voting, subreddit moderation | Cliente API de Reddit — publicaciones, comentarios, votaciones, moderación de subreddits |
| mc-reflection | Nightly self-reflection — postmortem, lessons, and action items from the day's work | Autorreflexión nocturna — retrospectiva, lecciones y puntos de acción del trabajo del día |
| mc-research | Competitive intelligence and deep research — Perplexity queries, web search, competitor tracking, change detection, reports | Inteligencia competitiva e investigación profunda — consultas Perplexity, búsqueda web, seguimiento de competidores, detección de cambios, informes |
| mc-rolodex | Interactive contact browser UI for MiniClaw — fast, searchable access to trusted contacts | Interfaz interactiva de navegación de contactos para MiniClaw — acceso rápido y con búsqueda a contactos de confianza |
| mc-seo | SEO automation — site crawl, on-page audit with scoring, sitemap submission, outreach tracking | Automatización SEO — rastreo de sitio, auditoría de página con puntuación, envío de sitemap, seguimiento de alcance |
| mc-social | GitHub social engagement tools | Herramientas de interacción social de GitHub |
| mc-soul | Soul backup and restore — workspace snapshots | Copia de seguridad y restauración del alma — instantáneas del espacio de trabajo |
| mc-square | Square payment service — charge, refund, payment links. Zero deps, raw fetch. | Servicio de pagos Square — cobros, reembolsos, enlaces de pago. Sin dependencias, fetch nativo. |
| mc-stripe | Shared Stripe payment service — charge, refund, customer management | Servicio de pagos Stripe compartido — cobros, reembolsos, gestión de clientes |
| mc-substack | Substack publishing CLI — drafts, images, scheduling, EN/ES workflow | CLI de publicación en Substack — borradores, imágenes, programación, flujo de trabajo EN/ES |
| mc-tailscale | Tailscale management plugin — diagnostics, status, hardening wizard, Serve/Funnel wrappers, and custom domain setup. | Plugin de gestión de Tailscale — diagnósticos, estado, asistente de endurecimiento, envoltorios Serve/Funnel y configuración de dominios personalizados. |
| mc-trust | Agent identity and mutual authentication (Ed25519) | Identidad del agente y autenticación mutua (Ed25519) |
| mc-update | Check for available updates without applying them (dry run) | Verificar actualizaciones disponibles sin aplicarlas (ejecución de prueba) |
| mc-voice | Local speech-to-text via whisper.cpp | Voz a texto local vía whisper.cpp |
| mc-vending-bench | Run MiniClaw against the VendingBench 2 autonomous agent benchmark. Simulates running a vending machine business for 1 year, scored on final bank balance. | Ejecutar MiniClaw contra el benchmark de agente autónomo VendingBench 2. Simula operar un negocio de máquinas expendedoras por 1 año, puntuado por el saldo bancario final. |
| mc-vpn | Mullvad VPN management | Gestión de Mullvad VPN |
| mc-web-chat | WebSocket server for browser-based Claude Code chat. Powers the board's chat panel. | Servidor WebSocket para chat de Claude Code en el navegador. Alimenta el panel de chat del tablero. |
| mc-x | X/Twitter API v2 client — post tweets, read timelines, reply to tweets | Cliente API v2 de X/Twitter — publicar tweets, leer líneas de tiempo, responder a tweets |
| mc-youtube | Video analysis — keyframe extraction and Claude-powered video understanding | Análisis de video — extracción de fotogramas clave y comprensión de video impulsada por Claude |
| shared/errors | Shared error formatting utility for the miniclaw-os plugin ecosystem | Utilidad compartida de formateo de errores para el ecosistema de plugins miniclaw-os |
| shared/logging | Structured JSON logger for the miniclaw-os plugin ecosystem | Registrador JSON estructurado para el ecosistema de plugins miniclaw-os |

---

## Descripciones de comandos CLI

### mc-authenticator
| Inglés | Español |
|--------|---------|
| TOTP authenticator — generate 2FA codes from stored secrets | Autenticador TOTP — generar códigos 2FA a partir de secretos almacenados |
| Store a TOTP secret (raw base32 string) | Almacenar un secreto TOTP (cadena base32 sin procesar) |
| Store from otpauth:// URI (preserves issuer, algorithm, digits, period) | Almacenar desde URI otpauth:// (conserva emisor, algoritmo, dígitos, período) |
| Print current TOTP code + seconds remaining | Imprimir código TOTP actual + segundos restantes |
| Check if a code is valid (current +/- 1 window for clock drift) | Verificar si un código es válido (actual +/- 1 ventana para desviación de reloj) |
| List all stored TOTP services | Listar todos los servicios TOTP almacenados |
| Remove a TOTP service from vault | Eliminar un servicio TOTP de la bóveda |

### mc-backup
| Inglés | Español |
|--------|---------|
| Create a backup immediately and prune old archives | Crear una copia de seguridad inmediatamente y eliminar archivos antiguos |
| List all backup archives with sizes | Listar todos los archivos de respaldo con tamaños |
| Restore from a specific backup archive | Restaurar desde un archivo de respaldo específico |

### mc-blog
| Inglés | Español |
|--------|---------|
| Get the writing voice rules for blog posts | Obtener las reglas de voz de escritura para publicaciones del blog |
| Get the current arc plan — weekly/seasonal themes, voice shifts, and seed ideas | Obtener el plan de arco actual — temas semanales/estacionales, cambios de voz e ideas semilla |

### mc-board
| Inglés | Español |
|--------|---------|
| Miniclaw brain kanban board — the agent's prefrontal cortex | Tablero kanban del cerebro MiniClaw — la corteza prefrontal del agente |
| Create a new card in the backlog | Crear una nueva tarjeta en el backlog |
| Update card fields | Actualizar campos de la tarjeta |
| Move a card to a different column | Mover una tarjeta a una columna diferente |
| Show card details | Mostrar detalles de la tarjeta |
| List all cards on the board | Listar todas las tarjetas del tablero |
| Pick up a card for work | Tomar una tarjeta para trabajar |
| Release a card back to the column | Liberar una tarjeta de vuelta a la columna |
| Show active (picked-up) cards | Mostrar tarjetas activas (en progreso) |
| Get full context for a card | Obtener contexto completo de una tarjeta |
| Archive a card from any column — removes from board, compresses into rotating archive | Archivar una tarjeta de cualquier columna — la remueve del tablero y la comprime en archivo rotativo |
| Archive a project (hides it from the default list, cards are preserved) | Archivar un proyecto (lo oculta de la lista predeterminada, las tarjetas se conservan) |
| Create a new project | Crear un nuevo proyecto |
| Dump all cards in a column as a rich LLM-ready context block for triage | Exportar todas las tarjetas de una columna como un bloque de contexto enriquecido para clasificación |

### mc-booking
| Inglés | Español |
|--------|---------|
| Agent-driven scheduling assistant — booking requests, approval flow, availability management | Asistente de programación impulsado por agente — solicitudes de reserva, flujo de aprobación, gestión de disponibilidad |
| Create showing slots for a property via mc-booking + mc-calendar | Crear horarios de visita para una propiedad vía mc-booking + mc-calendar |
| Approve a pending booking request | Aprobar una solicitud de reserva pendiente |
| Cancel an appointment | Cancelar una cita |
| List all appointments | Listar todas las citas |

### mc-calendar
| Inglés | Español |
|--------|---------|
| Apple Calendar — list, create, search, and manage events | Apple Calendar — listar, crear, buscar y gestionar eventos |
| Check EventKit access and list calendars | Verificar acceso a EventKit y listar calendarios |
| List upcoming events | Listar próximos eventos |
| Create a new event | Crear un nuevo evento |
| Update an event | Actualizar un evento |
| Delete an event by UID | Eliminar un evento por UID |
| Search events by keyword | Buscar eventos por palabra clave |

### mc-contribute
| Inglés | Español |
|--------|---------|
| Contribute to MiniClaw — scaffold plugins, submit PRs, report bugs | Contribuir a MiniClaw — crear estructura de plugins, enviar PRs, reportar bugs |
| Create a contribution branch | Crear una rama de contribución |
| Check contribution status — branch, changes, open PRs | Verificar estado de contribución — rama, cambios, PRs abiertos |
| File a bug report with auto-collected diagnostics | Crear un reporte de bug con diagnósticos recopilados automáticamente |
| Submit a pull request for the current contribution branch | Enviar una solicitud de extracción para la rama de contribución actual |

### mc-designer
| Inglés | Español |
|--------|---------|
| Miniclaw Designer — visual creation studio (occipital lobe) | MiniClaw Designer — estudio de creación visual (lóbulo occipital) |
| Canvas management | Gestión de lienzos |
| Create a new canvas | Crear un nuevo lienzo |
| Delete a canvas (does not delete layer image files) | Eliminar un lienzo (no elimina los archivos de imagen de capas) |
| List all canvases | Listar todos los lienzos |
| Generate an image and add it as a new layer | Generar una imagen y agregarla como nueva capa |
| Add an existing image file as a new layer | Agregar un archivo de imagen existente como nueva capa |
| Generate an image using reference photos + a text prompt | Generar una imagen usando fotos de referencia + un indicador de texto |
| Edit an existing layer using Gemini | Editar una capa existente usando Gemini |
| Flatten all visible layers and export a PNG | Aplanar todas las capas visibles y exportar un PNG |
| List all layers in a canvas | Listar todas las capas de un lienzo |

### mc-devlog
| Inglés | Español |
|--------|---------|
| Daily devlog — aggregate git activity and publish | Registro de desarrollo diario — agregar actividad git y publicar |
| Generate and publish yesterday's devlog to all configured targets | Generar y publicar el registro de desarrollo de ayer en todos los destinos configurados |
| Dry-run: show what yesterday's devlog would look like without publishing | Ejecución de prueba: mostrar cómo se vería el registro de desarrollo de ayer sin publicar |

### mc-email
| Inglés | Español |
|--------|---------|
| Email — read, triage, archive, send via himalaya | Correo electrónico — leer, clasificar, archivar, enviar vía himalaya |
| Read inbox messages | Leer mensajes de la bandeja de entrada |
| Send an email | Enviar un correo electrónico |
| Archive a message (move to All Mail, remove from INBOX) | Archivar un mensaje (mover a Todo el correo, eliminar de la bandeja de entrada) |
| Autonomous triage: classify, reply, and archive unread inbox messages | Clasificación autónoma: clasificar, responder y archivar mensajes no leídos de la bandeja de entrada |
| Add an email address to the Do Not Contact list | Agregar una dirección de correo electrónico a la lista de No Contactar |
| Check if an email address is on the Do Not Contact list | Verificar si una dirección de correo electrónico está en la lista de No Contactar |

### mc-github
| Inglés | Español |
|--------|---------|
| Manage GitHub issues, PRs, and workflows | Gestionar issues, PRs y flujos de trabajo de GitHub |
| List open issues | Listar issues abiertos |
| Show issue details | Mostrar detalles del issue |
| List open pull requests | Listar solicitudes de extracción abiertas |
| Show pull request details | Mostrar detalles de la solicitud de extracción |

### mc-human
| Inglés | Español |
|--------|---------|
| Ask-a-human — deliver interactive session when AM hits captchas or login flows | Consultar a un humano — entregar sesión interactiva cuando el agente encuentra captchas o flujos de inicio de sesión |
| Request human help via Telegram | Solicitar ayuda humana vía Telegram |

### mc-kb
| Inglés | Español |
|--------|---------|
| SQLite vector knowledge base — long-term semantic memory | Base de conocimiento vectorial SQLite — memoria semántica a largo plazo |
| Add a new knowledge base entry | Agregar una nueva entrada a la base de conocimiento |
| Search knowledge base entries | Buscar entradas en la base de conocimiento |
| Get full entry by ID | Obtener entrada completa por ID |
| Count entries by type | Contar entradas por tipo |
| Hybrid vector+keyword search | Búsqueda híbrida vector+palabra clave |
| Check embedding daemon status | Verificar estado del daemon de embeddings |
| Bulk import: YAML frontmatter + markdown body | Importación masiva: frontmatter YAML + cuerpo markdown |

### mc-memo
| Inglés | Español |
|--------|---------|
| Append a timestamped note to the card's memo file | Agregar una nota con marca de tiempo al archivo de memo de la tarjeta |
| Read the card's memo file | Leer el archivo de memo de la tarjeta |

### mc-memory
| Inglés | Español |
|--------|---------|
| Unified memory gateway — routes writes, searches all stores, promotes memos to KB | Gateway de memoria unificada — enruta escrituras, busca en todos los almacenes, promueve memos a la base de conocimiento |
| Search across all memory stores | Buscar en todos los almacenes de memoria |
| Store a new memory entry | Almacenar una nueva entrada de memoria |

### mc-moltbook
| Inglés | Español |
|--------|---------|
| Moltbook social network for AI agents | Red social Moltbook para agentes de IA |
| Check Moltbook connection status and profile | Verificar estado de conexión y perfil de Moltbook |
| Register this agent on Moltbook | Registrar este agente en Moltbook |
| Create a new post | Crear una nueva publicación |
| Read the Moltbook feed | Leer el feed de Moltbook |
| Reply to a post | Responder a una publicación |
| List available communities (submolts) | Listar comunidades disponibles (submolts) |

### mc-realty
| Inglés | Español |
|--------|---------|
| Real estate workflow orchestration | Orquestación de flujo de trabajo inmobiliario |
| Create a property listing — board card + KB entry + description via mc-docs | Crear un listado de propiedad — tarjeta de tablero + entrada en KB + descripción vía mc-docs |
| Create an mc-board pipeline to track a real estate transaction through stages | Crear un pipeline en mc-board para rastrear una transacción inmobiliaria por etapas |
| Generate listing graphics (mc-designer) + blog post (mc-blog) + syndicate (mc-social) | Generar gráficos del listado (mc-designer) + publicación de blog (mc-blog) + sindicalización (mc-social) |
| Run ATTOM property comparison analysis | Ejecutar análisis comparativo de propiedades ATTOM |

### mc-reddit
| Inglés | Español |
|--------|---------|
| Reddit integration — browse, post, comment, and moderate | Integración con Reddit — navegar, publicar, comentar y moderar |

### mc-reflection
| Inglés | Español |
|--------|---------|
| Nightly self-reflection — postmortem, lessons, and action items from the day's work | Autorreflexión nocturna — retrospectiva, lecciones y puntos de acción del trabajo del día |
| Gather and print the day's context for reflection | Recopilar e imprimir el contexto del día para reflexión |
| Run the reflection prompt | Ejecutar el prompt de reflexión |

### mc-research
| Inglés | Español |
|--------|---------|
| Competitive intelligence and deep research | Inteligencia competitiva e investigación profunda |
| Deep research via Perplexity sonar API | Investigación profunda vía API sonar de Perplexity |
| Check SERP ranking for a keyword (DuckDuckGo, no API key needed) | Verificar ranking SERP para una palabra clave (DuckDuckGo, sin necesidad de API key) |
| Check rankings for all configured target keywords | Verificar rankings para todas las palabras clave objetivo configuradas |
| Generate a full competitive intelligence report | Generar un informe completo de inteligencia competitiva |

### mc-rolodex
| Inglés | Español |
|--------|---------|
| Contact browser — search and manage trusted contacts | Navegador de contactos — buscar y gestionar contactos de confianza |
| Search contacts by name, email, phone, domain, or tag | Buscar contactos por nombre, correo, teléfono, dominio o etiqueta |
| List all contacts | Listar todos los contactos |
| Show full contact details | Mostrar detalles completos del contacto |
| Add a new contact (JSON string or path to JSON file) | Agregar un nuevo contacto (cadena JSON o ruta a archivo JSON) |
| Update a contact (merge fields from JSON string or file) | Actualizar un contacto (fusionar campos desde cadena JSON o archivo) |
| Delete a contact | Eliminar un contacto |
| Search contacts | Buscar contactos |
| Open interactive TUI browser | Abrir navegador interactivo TUI |

### mc-seo
| Inglés | Español |
|--------|---------|
| SEO automation | Automatización SEO |
| Crawl entire site and audit every page | Rastrear todo el sitio y auditar cada página |
| Full on-page SEO audit of a single URL | Auditoría SEO completa de una sola URL |
| Submit sitemap to search engines | Enviar sitemap a motores de búsqueda |

### mc-social
| Inglés | Español |
|--------|---------|
| GitHub social engagement tools | Herramientas de interacción social de GitHub |
| Show engagement metrics summary | Mostrar resumen de métricas de interacción |

### mc-soul
| Inglés | Español |
|--------|---------|
| Soul backup and restore — workspace snapshots | Copia de seguridad y restauración del alma — instantáneas del espacio de trabajo |
| Create a named snapshot of all soul files | Crear una instantánea con nombre de todos los archivos del alma |
| Diff a snapshot against current soul files | Comparar una instantánea con los archivos del alma actuales |
| Delete a snapshot | Eliminar una instantánea |
| Restore from a snapshot | Restaurar desde una instantánea |

### mc-square
| Inglés | Español |
|--------|---------|
| Square payment service — charge, refund, payment links | Servicio de pagos Square — cobros, reembolsos, enlaces de pago |
| Create a payment (amount in dollars, e.g. 19.99) | Crear un pago (monto en dólares, ej. 19.99) |
| Full or partial refund | Reembolso total o parcial |
| Check payment status | Verificar estado del pago |
| Create a hosted checkout URL (payment link) | Crear una URL de pago alojada (enlace de pago) |
| Guided walkthrough: paste access token, vault it, verify, list locations | Guía paso a paso: pegar token de acceso, guardarlo en la bóveda, verificar, listar ubicaciones |

### mc-stripe
| Inglés | Español |
|--------|---------|
| Shared Stripe payment service — charge, refund, customer management | Servicio de pagos Stripe compartido — cobros, reembolsos, gestión de clientes |
| Customer management | Gestión de clientes |
| Create a new customer | Crear un nuevo cliente |
| Create a PaymentIntent (amount in dollars, e.g. 19.99) | Crear un PaymentIntent (monto en dólares, ej. 19.99) |
| Create a hosted checkout URL (payment link) | Crear una URL de pago alojada (enlace de pago) |
| Full or partial refund of a PaymentIntent | Reembolso total o parcial de un PaymentIntent |
| Guided walkthrough: create Stripe account, paste keys, vault them, verify | Guía paso a paso: crear cuenta Stripe, pegar claves, guardarlas en la bóveda, verificar |

### mc-substack
| Inglés | Español |
|--------|---------|
| Substack publishing — drafts, images, scheduling | Publicación en Substack — borradores, imágenes, programación |
| Store Substack session cookie (substack.sid) in vault | Almacenar cookie de sesión de Substack (substack.sid) en la bóveda |
| Create a new empty draft and print its ID | Crear un nuevo borrador vacío e imprimir su ID |
| List draft posts | Listar borradores de publicaciones |
| Show draft title, subtitle, body length | Mostrar título, subtítulo y longitud del cuerpo del borrador |
| Delete a draft/post by ID. Use --all to delete every non-published draft. | Eliminar un borrador/publicación por ID. Usar --all para eliminar todos los borradores no publicados. |
| Copy captionedImage nodes from one draft to another (no re-upload) | Copiar nodos de imagen con subtítulo de un borrador a otro (sin re-subir) |
| Insert a new paragraph into a draft. Supports **bold** inline syntax. | Insertar un nuevo párrafo en un borrador. Soporta sintaxis **negrita** en línea. |
| Find and replace text in a draft body | Buscar y reemplazar texto en el cuerpo de un borrador |

### mc-tailscale
| Inglés | Español |
|--------|---------|
| Tailscale management — diagnostics, hardening, serve/funnel, custom domains | Gestión de Tailscale — diagnósticos, endurecimiento, serve/funnel, dominios personalizados |
| Diagnose Tailscale issues: zombie processes, missing sockets, install method | Diagnosticar problemas de Tailscale: procesos zombie, sockets faltantes, método de instalación |
| Show Tailscale state, services, DNS, certificates, and peer info | Mostrar estado de Tailscale, servicios, DNS, certificados e información de pares |
| Interactive hardening wizard — applies security best practices | Asistente interactivo de endurecimiento — aplica mejores prácticas de seguridad |
| Print commands without executing them | Imprimir comandos sin ejecutarlos |
| Share a local service within the tailnet via Tailscale Serve | Compartir un servicio local dentro del tailnet vía Tailscale Serve |
| Run in background | Ejecutar en segundo plano |
| Mount at specific URL path | Montar en una ruta URL específica |
| Stop serving | Dejar de servir |
| Expose a local service to the public internet via Tailscale Funnel | Exponer un servicio local a la internet pública vía Tailscale Funnel |
| Stop funnel | Detener funnel |
| Clear all funnel config | Limpiar toda la configuración de funnel |
| Custom domain setup wizard — guides through reverse proxy, split DNS, or delegation | Asistente de configuración de dominio personalizado — guía a través de proxy inverso, DNS dividido o delegación |
| Setup method: reverse-proxy, split-dns, delegation | Método de configuración: reverse-proxy, split-dns, delegation |

### mc-trust
| Inglés | Español |
|--------|---------|
| Agent identity and mutual authentication (Ed25519) | Identidad del agente y autenticación mutua (Ed25519) |
| Generate this agent's Ed25519 identity key pair. Private key goes to vault ONLY. | Generar el par de claves de identidad Ed25519 de este agente. La clave privada solo va a la bóveda. |
| Generate a challenge to initiate a handshake with a peer. Outputs JSON. | Generar un desafío para iniciar un apretón de manos con un par. Genera JSON. |
| Verify a peer's challenge response | Verificar la respuesta al desafío de un par |

### mc-update
| Inglés | Español |
|--------|---------|
| Check for available updates without applying them (dry run) | Verificar actualizaciones disponibles sin aplicarlas (ejecución de prueba) |
| Fetch stable tags, pull updates, rebuild, and verify with mc-smoke | Obtener etiquetas estables, descargar actualizaciones, reconstruir y verificar con mc-smoke |
| Show update status and version info | Mostrar estado de actualización e información de versión |
| Rollback to the previous version | Revertir a la versión anterior |

### mc-vending-bench
| Inglés | Español |
|--------|---------|
| VendingBench 2 — benchmark MiniClaw on autonomous business operations | VendingBench 2 — evaluar MiniClaw en operaciones comerciales autónomas |
| Start a VendingBench 2 benchmark run | Iniciar una ejecución de benchmark VendingBench 2 |
| Model to use | Modelo a usar |
| Maximum messages | Máximo de mensajes |
| Validate setup without running | Validar configuración sin ejecutar |
| Install Python dependencies for VendingBench 2 | Instalar dependencias de Python para VendingBench 2 |
| Show past benchmark results | Mostrar resultados anteriores de benchmark |
| Check VendingBench 2 prerequisites | Verificar prerrequisitos de VendingBench 2 |

### mc-voice
| Inglés | Español |
|--------|---------|
| Local speech-to-text via whisper.cpp | Voz a texto local vía whisper.cpp |
| Transcribe an audio file to text using whisper.cpp | Transcribir un archivo de audio a texto usando whisper.cpp |
| Record audio from microphone (16kHz mono WAV) | Grabar audio desde el micrófono (WAV mono 16kHz) |
| Record from microphone then transcribe (press Ctrl+C to stop recording) | Grabar desde el micrófono y luego transcribir (presiona Ctrl+C para detener la grabación) |
| Download a whisper.cpp model | Descargar un modelo de whisper.cpp |
| Check whisper.cpp and model availability | Verificar disponibilidad de whisper.cpp y modelos |

### mc-vpn
| Inglés | Español |
|--------|---------|
| Mullvad VPN management | Gestión de Mullvad VPN |
| Connect to Mullvad VPN | Conectar a Mullvad VPN |
| Disconnect from Mullvad VPN | Desconectar de Mullvad VPN |
| Show VPN status | Mostrar estado del VPN |
| List available relay countries | Listar países de retransmisión disponibles |
| Diagnose Mullvad VPN issues: binary, daemon, account status | Diagnosticar problemas de Mullvad VPN: binario, daemon, estado de cuenta |

### mc-web-chat
| Inglés | Español |
|--------|---------|
| Check mc-web-chat server status | Verificar estado del servidor mc-web-chat |

### mc-x
| Inglés | Español |
|--------|---------|
| X/Twitter API v2 client | Cliente API v2 de X/Twitter |
| Post a tweet | Publicar un tweet |
| Read timeline | Leer línea de tiempo |
| Reply to a tweet | Responder a un tweet |

---

## Descripciones de opciones y argumentos CLI

### Opciones comunes
| Inglés | Español |
|--------|---------|
| Priority level: critical, high, medium, low | Nivel de prioridad: crítico, alto, medio, bajo |
| Comma-separated tags | Etiquetas separadas por comas |
| Link to a project by ID | Vincular a un proyecto por ID |
| Filter by column | Filtrar por columna |
| Filter by priority | Filtrar por prioridad |
| Filter by tag | Filtrar por etiqueta |
| Output as JSON | Salida en formato JSON |
| Number of results | Número de resultados |
| Force overwrite | Forzar sobrescritura |
| Dry run — show what would happen without making changes | Ejecución de prueba — mostrar qué sucedería sin hacer cambios |
| Verbose output | Salida detallada |
| Service name (e.g. github, aws, google) | Nombre del servicio (ej. github, aws, google) |
| Canvas name | Nombre del lienzo |
| Layer name | Nombre de la capa |
| Role: background or element | Rol: fondo o elemento |
| X position in pixels | Posición X en píxeles |
| Y position in pixels | Posición Y en píxeles |
| Width in pixels | Ancho en píxeles |
| Height in pixels | Alto en píxeles |
| Output file path | Ruta del archivo de salida |
| Reference image file(s) | Archivo(s) de imagen de referencia |

---

## Mensajes de error y validación

| Inglés | Español |
|--------|---------|
| No fields to update. Provide at least one option. | No hay campos para actualizar. Proporcione al menos una opción. |
| Appointment not found or not pending. | Cita no encontrada o no está pendiente. |
| Auth failed — invalid or missing API key. | Autenticación fallida — clave API inválida o faltante. |
| Canvas not found | Lienzo no encontrado |
| Layer not found | Capa no encontrada |
| Card not found | Tarjeta no encontrada |
| Invalid priority | Prioridad inválida |
| Title cannot be empty | El título no puede estar vacío |
| Empty API key returned from mc-vault | mc-vault devolvió una clave API vacía |
| Claude returned no output | Claude no devolvió salida |
| Claude returned no text content | Claude no devolvió contenido de texto |
| curl returned no output | curl no devolvió salida |
| Gemini returned no image data | Gemini no devolvió datos de imagen |
| Gemini inspect returned no text | La inspección de Gemini no devolvió texto |
| Gemini API key required. | Se requiere clave API de Gemini. |
| Get a free key at: https://aistudio.google.com/app/apikey | Obtén una clave gratuita en: https://aistudio.google.com/app/apikey |
| No key entered — aborting. | No se ingresó clave — abortando. |
| Run: openclaw mc-doctor — to diagnose configuration issues | Ejecutar: openclaw mc-doctor — para diagnosticar problemas de configuración |
| Bot token and user ID are both required | Se requieren tanto el token del bot como el ID de usuario |
| Both fields are required | Ambos campos son obligatorios |
| SMTP host is required for non-Gmail accounts | Se requiere host SMTP para cuentas que no son Gmail |
| Verification failed | Verificación fallida |
| Network error — are you connected? | Error de red — ¿estás conectado? |
| Check your fork remote. | Verifica tu remote del fork. |
| Make sure your remote is set up. | Asegúrate de que tu remote esté configurado. |
| Invalid type | Tipo inválido |
| Path traversal detected | Traversal de ruta detectado |
| Another update is already running. Try again later. | Otra actualización ya está en ejecución. Intenta más tarde. |
| No rollback refs available. No previous update to revert. | No hay referencias de reversión disponibles. No hay actualización anterior para revertir. |
| Cannot rollback: another update is running. | No se puede revertir: otra actualización está en ejecución. |
| At least one --ref <file> is required | Se requiere al menos un --ref <archivo> |
| Element layers require | Las capas de elementos requieren |
| No benchmark results yet. Run: mc-vending-bench run | Aún no hay resultados de benchmark. Ejecutar: mc-vending-bench run |
| Harness not found | Arnés de pruebas no encontrado |
| Benchmark failed | Benchmark falló |
| Failed to install dependencies | Error al instalar dependencias |
| python3 not found | python3 no encontrado |
| inspect-ai not installed (pip install inspect-ai) | inspect-ai no instalado (pip install inspect-ai) |
| multiagent-inspect not installed (pip install multiagent-inspect) | multiagent-inspect no instalado (pip install multiagent-inspect) |
| Not found at (tailscale binary path) | No encontrado en (ruta del binario de tailscale) |
| Could not determine version | No se pudo determinar la versión |
| Zombie processes running but socket missing | Procesos zombie ejecutándose pero falta el socket |
| Could not parse status | No se pudo analizar el estado |
| tailscale status failed | tailscale status falló |
| Homebrew — Funnel requires App Store or standalone install | Homebrew — Funnel requiere instalación desde App Store o independiente |
| Funnel requires the App Store or standalone install. | Funnel requiere instalación desde App Store o independiente. |
| claude binary not found — chat disabled | Binario de claude no encontrado — chat deshabilitado |
| Failed to connect to chat service. | Error al conectar con el servicio de chat. |
| Chat request timed out after 30 seconds. | La solicitud de chat expiró después de 30 segundos. |
| Chat not found | Chat no encontrado |
| Context window was full. Starting a fresh conversation. | La ventana de contexto estaba llena. Iniciando una conversación nueva. |

---

## Mensajes de éxito y estado

| Inglés | Español |
|--------|---------|
| Created card | Tarjeta creada |
| Auth complete | Autenticación completa |
| Connected! | ¡Conectado! |
| Saved | Guardado |
| Saving... | Guardando... |
| Verifying... | Verificando... |
| Loading... | Cargando... |
| Installing... | Instalando... |
| Installed! | ¡Instalado! |
| Redirecting... | Redirigiendo... |
| Checking for updates... | Buscando actualizaciones... |
| Everything is up to date. | Todo está actualizado. |
| Starting update... | Iniciando actualización... |
| Update completed successfully. | Actualización completada exitosamente. |
| Everything is already up to date. | Todo ya está actualizado. |
| Update failed verification — rolled back to previous version. | La actualización falló la verificación — se revirtió a la versión anterior. |
| Update failed. Check logs for details. | La actualización falló. Revisa los registros para más detalles. |
| Rollback complete. | Reversión completa. |
| Some repos failed to rollback. | Algunos repositorios fallaron al revertir. |
| Connecting to Mullvad VPN... | Conectando a Mullvad VPN... |
| Disconnecting from Mullvad VPN... | Desconectando de Mullvad VPN... |
| Disconnected! | ¡Desconectado! |
| Mullvad is healthy. | Mullvad está funcionando correctamente. |
| Key saved to vault | Clave guardada en la bóveda |
| Layer added to canvas | Capa agregada al lienzo |
| Layer updated | Capa actualizada |
| All checks passed | Todas las verificaciones pasaron |
| Some checks had issues. You can continue — these can be fixed later with mc-doctor. | Algunas verificaciones tuvieron problemas. Puedes continuar — estos se pueden corregir después con mc-doctor. |
| Test message sent — check your Telegram! | ¡Mensaje de prueba enviado — revisa tu Telegram! |
| Email verified — continuing... | Correo verificado — continuando... |
| VPN configured — auto-connect enabled | VPN configurado — conexión automática habilitada |
| Wiki updated successfully. | Wiki actualizado exitosamente. |
| All checks passed. Tailscale is healthy. | Todas las verificaciones pasaron. Tailscale está funcionando correctamente. |
| Serve stopped. | Serve detenido. |
| Serving port within tailnet. | Sirviendo puerto dentro del tailnet. |
| Funnel stopped. | Funnel detenido. |
| Funnel config reset. | Configuración de funnel restablecida. |
| Funneling port to the internet. | Exponiendo puerto a la internet vía funnel. |
| Applied | Aplicado |
| Dependencies installed. | Dependencias instaladas. |
| Installing VendingBench 2 dependencies... | Instalando dependencias de VendingBench 2... |
| mc-web-chat: not running | mc-web-chat: no está ejecutándose |
| Untitled chat | Chat sin título |

---

## Web UI — Asistente de configuración

### step-meet (Crear asistente)
| Inglés | Español |
|--------|---------|
| Create your assistant | Crea tu asistente |
| Choose a character | Elige un personaje |
| Upload your own | Sube el tuyo |
| Name | Nombre |
| e.g. Nova, Atlas, Luna... | ej. Nova, Atlas, Luna... |
| Nickname | Apodo |
| Only letters, numbers, dashes, and underscores | Solo letras, números, guiones y guiones bajos |
| Color | Color |
| Pronouns | Pronombres |
| she/her | ella |
| he/him | él |
| they/them | elle |
| Teal | Verde azulado |
| Pink | Rosa |
| Purple | Púrpura |
| Red | Rojo |
| Orange | Naranja |
| Blue | Azul |
| White | Blanco |
| Continue → | Continuar → |
| Found your previous OpenClaw install | Se encontró tu instalación anterior de OpenClaw |
| Don't worry — your original data has been copied to: | No te preocupes — tus datos originales se han copiado a: |

### step-anthropic (Configuración de Claude)
| Inglés | Español |
|--------|---------|
| How {name} thinks | Cómo piensa {name} |
| {name} needs a brain to work — that brain is Claude, made by a company called Anthropic... | {name} necesita un cerebro para funcionar — ese cerebro es Claude, hecho por una empresa llamada Anthropic... |
| Chatting | Chatear |
| Asking questions, getting advice, having a conversation | Hacer preguntas, obtener consejos, tener una conversación |
| Working in the background | Trabajar en segundo plano |
| Checking your email, organizing your tasks, running scheduled jobs — even while you sleep | Revisar tu correo, organizar tus tareas, ejecutar trabajos programados — incluso mientras duermes |
| Harder tasks use more | Las tareas más difíciles consumen más |
| A quick answer is cheap. Writing a long email or researching something takes more... | Una respuesta rápida es barata. Escribir un correo largo o investigar algo cuesta más... |
| Why a subscription? | ¿Por qué una suscripción? |
| A subscription is much cheaper than paying per use... | Una suscripción es mucho más barata que pagar por uso... |
| ← Back | ← Atrás |
| Choose a plan → | Elige un plan → |
| Pick your plan | Elige tu plan |
| Choose based on how much you expect {name} to do... | Elige según cuánto esperas que {name} haga... |
| Light | Ligero |
| Average | Promedio |
| Power | Intensivo |
| $20/mo | $20/mes |
| $100/mo | $100/mes |
| $200/mo | $200/mes |
| Check in a few times a day, ask quick questions | Consultar unas pocas veces al día, hacer preguntas rápidas |
| recommended | recomendado |
| Use throughout the day — email, tasks, and scheduling | Usar durante todo el día — correo, tareas y programación |
| All-day assistant — runs your business, handles everything | Asistente de todo el día — gestiona tu negocio, maneja todo |
| Sign up for Claude → | Regístrate en Claude → |
| I already have my Claude subscription | Ya tengo mi suscripción de Claude |
| Connect your Claude account | Conecta tu cuenta de Claude |
| Click the button below and sign in to your Claude account... | Haz clic en el botón de abajo e inicia sesión en tu cuenta de Claude... |
| Waiting for you to sign in... | Esperando que inicies sesión... |
| A browser window should have opened... | Debería haberse abierto una ventana del navegador... |
| Connected! | ¡Conectado! |
| If you received a code to paste, enter it here: | Si recibiste un código para pegar, ingrésalo aquí: |
| Paste code here... | Pega el código aquí... |
| Submit code | Enviar código |
| Sign in to Claude | Iniciar sesión en Claude |
| Waiting for sign-in... | Esperando inicio de sesión... |

### step-gemini (Configuración de Gemini)
| Inglés | Español |
|--------|---------|
| Gemini API key | Clave API de Gemini |
| Optional | Opcional |
| Enables image understanding and vision features. You can add this later in settings. | Habilita funciones de comprensión de imágenes y visión. Puedes agregarlo más tarde en configuración. |
| API key | Clave API |
| AIza... | AIza... |
| Get a free key at aistudio.google.com — stored encrypted on your device | Obtén una clave gratuita en aistudio.google.com — almacenada con cifrado en tu dispositivo |
| What Gemini unlocks | Lo que Gemini desbloquea |
| Image and attachment understanding in emails | Comprensión de imágenes y adjuntos en correos |
| Visual content generation | Generación de contenido visual |
| Document and photo analysis | Análisis de documentos y fotos |
| Skip | Omitir |
| Save & continue → | Guardar y continuar → |
| ✓ Saved | ✓ Guardado |

### step-github (Configuración de GitHub)
| Inglés | Español |
|--------|---------|
| GitHub | GitHub |
| Optional — but powerful. | Opcional — pero potente. |
| With GitHub access, {name} can: | Con acceso a GitHub, {name} puede: |
| Build software with you — clone repos, push branches, open PRs | Construir software contigo — clonar repos, enviar ramas, abrir PRs |
| Research and analyze — explore code, read issues, review PRs | Investigar y analizar — explorar código, leer issues, revisar PRs |
| Upgrade herself — write custom tools and plugins... | Mejorarse a sí misma — escribir herramientas y plugins personalizados... |
| She writes tools that only you and her can use... | Ella escribe herramientas que solo tú y ella pueden usar... |
| 1. If you don't have a GitHub account, sign up here (it's free). | 1. Si no tienes una cuenta de GitHub, regístrate aquí (es gratis). |
| 2. Create a personal access token: | 2. Crea un token de acceso personal: |
| a. Go to github.com/settings/tokens/new | a. Ve a github.com/settings/tokens/new |
| b. Note: {name} access | b. Nota: acceso de {name} |
| c. Expiration: No expiration | c. Expiración: Sin expiración |
| d. Scopes: check every top-level checkbox (repo, workflow, admin:org, etc.) | d. Alcances: marca cada casilla de nivel superior (repo, workflow, admin:org, etc.) |
| e. Click Generate token and copy it | e. Haz clic en Generar token y cópialo |
| 3. Paste your token here: | 3. Pega tu token aquí: |
| ghp_xxxxxxxxxxxxxxxxxxxx | ghp_xxxxxxxxxxxxxxxxxxxx |
| ✓ Connected as {username} | ✓ Conectado como {username} |
| Verify token → | Verificar token → |
| Skip for now → | Omitir por ahora → |

### step-telegram (Configuración de Telegram)
| Inglés | Español |
|--------|---------|
| Connect Telegram | Conectar Telegram |
| Telegram is the secure channel between you and {name}. | Telegram es el canal seguro entre tú y {name}. |
| 1. Open Telegram on your phone. Find @BotFather, send /newbot... | 1. Abre Telegram en tu teléfono. Encuentra a @BotFather, envía /newbot... |
| 2. BotFather gives you a bot token. Email it to yourself... | 2. BotFather te da un token de bot. Envíatelo por correo... |
| bot token | token del bot |
| 123456:ABC-DEF... | 123456:ABC-DEF... |
| 3. Send a Telegram message from your phone to {botName} so it can reply to you. | 3. Envía un mensaje de Telegram desde tu teléfono a {botName} para que pueda responderte. |
| 4. Find @userinfobot in Telegram, send it anything... | 4. Encuentra @userinfobot en Telegram, envíale cualquier cosa... |
| user ID | ID de usuario |
| 123456789 | 123456789 |
| Send test message → | Enviar mensaje de prueba → |
| Sending test... | Enviando prueba... |
| ✓ Test message sent — check your Telegram! | ✓ Mensaje de prueba enviado — ¡revisa tu Telegram! |

### step-email (Configuración de correo)
| Inglés | Español |
|--------|---------|
| Email | Correo electrónico |
| Optional — but this is how your AM works independently. | Opcional — pero así es como tu agente trabaja de forma independiente. |
| Email is the universal API. With an inbox, your AM can: | El correo electrónico es la API universal. Con una bandeja de entrada, tu agente puede: |
| Act as your agent — send emails, reply to messages, follow up on your behalf | Actuar como tu agente — enviar correos, responder mensajes, dar seguimiento en tu nombre |
| Triage your inbox — classify, prioritize, and surface what matters | Clasificar tu bandeja de entrada — categorizar, priorizar y destacar lo importante |
| Work autonomously — interact with services, receive confirmations, handle account workflows | Trabajar de forma autónoma — interactuar con servicios, recibir confirmaciones, manejar flujos de trabajo de cuentas |
| We recommend creating a dedicated Gmail address... | Recomendamos crear una dirección de Gmail dedicada... |
| Email address | Dirección de correo |
| you@example.com | tu@ejemplo.com |
| Gmail detected — using Google IMAP | Gmail detectado — usando Google IMAP |
| App password | Contraseña de aplicación |
| Password | Contraseña |
| How to create one? | ¿Cómo crear una? |
| Hide instructions | Ocultar instrucciones |
| xxxx xxxx xxxx xxxx | xxxx xxxx xxxx xxxx |
| Your email password | Tu contraseña de correo |
| SMTP host | Host SMTP |
| smtp.example.com | smtp.ejemplo.com |
| Port | Puerto |
| Creating a Google App Password: | Crear una contraseña de aplicación de Google: |
| Go to myaccount.google.com | Ve a myaccount.google.com |
| Select Security → 2-Step Verification | Selecciona Seguridad → Verificación en 2 pasos |
| Scroll down to App passwords | Desplázate hasta Contraseñas de aplicaciones |
| Create a new app password — name it "AM Assistant" | Crea una nueva contraseña de aplicación — nómbrala "AM Assistant" |
| Copy the 16-character code and paste it above | Copia el código de 16 caracteres y pégalo arriba |
| Note: 2-Step Verification must be enabled on your account first. | Nota: La verificación en 2 pasos debe estar habilitada primero en tu cuenta. |
| Verify & continue → | Verificar y continuar → |

### step-vpn (Configuración de VPN)
| Inglés | Español |
|--------|---------|
| VPN | VPN |
| Optional — but highly encouraged for social media and contact mining. | Opcional — pero muy recomendado para redes sociales y búsqueda de contactos. |
| A VPN protects {name} when: | Una VPN protege a {name} cuando: |
| Browsing social media — prevents IP-based rate limiting and tracking | Navegar por redes sociales — previene limitación por IP y rastreo |
| Contact mining — protects your identity when researching leads | Búsqueda de contactos — protege tu identidad al investigar prospectos |
| Web scraping — avoids IP bans from automated browsing | Scraping web — evita bloqueos de IP por navegación automatizada |
| MiniClaw uses Mullvad VPN — no account email, no logging, pay anonymously. | MiniClaw usa Mullvad VPN — sin correo de cuenta, sin registros, paga anónimamente. |
| Mullvad is not installed. Install it first... | Mullvad no está instalado. Instálalo primero... |
| Download Mullvad for macOS → | Descargar Mullvad para macOS → |
| Mullvad {version} detected... | Mullvad {version} detectado... |
| 1. Create a Mullvad account (no email required): | 1. Crea una cuenta de Mullvad (no se requiere correo): |
| 2. Add time to your account (from $5/month): | 2. Agrega tiempo a tu cuenta (desde $5/mes): |
| Fund your account → | Fondear tu cuenta → |
| 3. Paste your account number: | 3. Pega tu número de cuenta: |
| 1234 5678 9012 3456 | 1234 5678 9012 3456 |
| 16-digit number from your Mullvad account page... | Número de 16 dígitos de tu página de cuenta de Mullvad... |
| 4. Default relay country: | 4. País de retransmisión predeterminado: |
| United States | Estados Unidos |
| United Kingdom | Reino Unido |
| Canada | Canadá |
| Germany | Alemania |
| Netherlands | Países Bajos |
| Sweden | Suecia |
| Switzerland | Suiza |
| Japan | Japón |
| Australia | Australia |
| Singapore | Singapur |
| France | Francia |
| Finland | Finlandia |
| Norway | Noruega |
| Denmark | Dinamarca |
| Austria | Austria |
| Spain | España |
| Italy | Italia |
| Brazil | Brasil |
| {name} can switch countries on the fly... | {name} puede cambiar de país sobre la marcha... |
| ✓ VPN configured — auto-connect enabled | ✓ VPN configurado — conexión automática habilitada |
| Save & continue → | Guardar y continuar → |

### step-color (Selección de color)
| Inglés | Español |
|--------|---------|
| Choose her look | Elige su apariencia |
| Pick an accent color. You can change it later. | Elige un color de acento. Puedes cambiarlo después. |
| Online · Ready | En línea · Lista |

### step-install (Instalación)
| Inglés | Español |
|--------|---------|
| Install MiniClaw | Instalar MiniClaw |
| This will set up everything your AM needs to run. Enter your Mac password to begin. | Esto configurará todo lo que tu agente necesita para funcionar. Ingresa tu contraseña de Mac para comenzar. |
| Mac password | Contraseña de Mac |
| Your password is only used locally for installing system packages. It is never stored or sent anywhere. | Tu contraseña solo se usa localmente para instalar paquetes del sistema. Nunca se almacena ni se envía a ningún lugar. |
| Install → | Instalar → |
| Checking... | Verificando... |
| Installed! | ¡Instalado! |
| Install issue | Problema de instalación |
| Everything is set up. Moving on... | Todo está configurado. Continuando... |
| Something went wrong. Check the output below. | Algo salió mal. Revisa la salida de abajo. |
| This takes a few minutes. Sit tight. | Esto toma unos minutos. Ten paciencia. |
| ✓ Installation complete — continuing setup... | ✓ Instalación completa — continuando configuración... |
| ← Try again | ← Intentar de nuevo |
| Continue anyway → | Continuar de todos modos → |

### step-update-time (Hora de actualización)
| Inglés | Español |
|--------|---------|
| Nightly updates | Actualizaciones nocturnas |
| {name} can check for updates automatically each night... | {name} puede buscar actualizaciones automáticamente cada noche... |
| When should updates run? | ¿Cuándo deben ejecutarse las actualizaciones? |
| Pick a time when your Mac is on but you're not using it. Updates usually take under a minute. | Elige un horario cuando tu Mac esté encendida pero no la estés usando. Las actualizaciones suelen tomar menos de un minuto. |
| Safe & automatic | Seguro y automático |
| Before updating, {name} takes a backup. After updating, a health check runs... | Antes de actualizar, {name} crea una copia de seguridad. Después de actualizar, se ejecuta una verificación de salud... |

### step-installing (Instalando)
| Inglés | Español |
|--------|---------|
| Finishing up... | Finalizando... |
| Installing and configuring {name} | Instalando y configurando {name} |
| Saving your preferences | Guardando tus preferencias |
| Waiting for install to finish | Esperando que termine la instalación |
| Saving your credentials | Guardando tus credenciales |
| Configuring Telegram | Configurando Telegram |
| Connecting to gateway | Conectando al gateway |
| Hacking the matrix | Hackeando la matrix |
| Coming online | Conectándose |
| Preferences saved | Preferencias guardadas |
| Failed to save config | Error al guardar la configuración |
| Installed | Instalado |
| Install timed out | La instalación agotó el tiempo |
| Credentials secured | Credenciales aseguradas |
| secret(s) failed | secreto(s) fallaron |
| Could not save credentials | No se pudieron guardar las credenciales |
| Gateway running | Gateway en ejecución |
| Could not start gateway | No se pudo iniciar el gateway |
| Taking you to {name}... | Llevándote a {name}... |

### step-done (Listo)
| Inglés | Español |
|--------|---------|
| {name} is ready. | {name} está lista. |
| Taking you to the brain board now. | Llevándote al tablero cerebral ahora. |
| Redirecting to brain board... | Redirigiendo al tablero cerebral... |

---

## Web UI — Tablero y componentes

### Nombres de columnas del tablero
| Inglés | Español |
|--------|---------|
| Backlog | Pendientes |
| In Progress | En progreso |
| In Review | En revisión |
| Shipped | Enviado |

### Modal de tarjeta — Etiquetas de sección
| Inglés | Español |
|--------|---------|
| Work Description | Descripción del trabajo |
| Plan | Plan |
| Criteria | Criterios |
| Notes | Notas |
| Research | Investigación |
| Review | Revisión |

### Controles de clasificación
| Inglés | Español |
|--------|---------|
| Disable scheduler | Deshabilitar programador |
| Enable scheduler | Habilitar programador |
| on | activado |
| off | desactivado |
| Triage backlog cards | Clasificar tarjetas pendientes |
| No cards to triage | No hay tarjetas para clasificar |
| Triage | Clasificar |
| Work top {n} card(s) | Trabajar las {n} tarjeta(s) principales |
| No cards to work | No hay tarjetas para trabajar |
| Work | Trabajar |

### Intervalos de tiempo
| Inglés | Español |
|--------|---------|
| 1m | 1min |
| 5m | 5min |
| 10m | 10min |
| 15m | 15min |
| 30m | 30min |
| 60m | 60min |

### Opciones de concurrencia
| Inglés | Español |
|--------|---------|
| 1× | 1× |
| 3× | 3× |
| 5× | 5× |
| 10× | 10× |

### Navegación de la aplicación
| Inglés | Español |
|--------|---------|
| board | tablero |
| memory | memoria |
| rolodex | contactos |
| agents | agentes |
| settings | configuración |
| tokens | tokens |

### Pestaña de memoria
| Inglés | Español |
|--------|---------|
| Loading... | Cargando... |
| No entries | Sin entradas |

### Pestaña de tareas programadas
| Inglés | Español |
|--------|---------|
| Scheduling | Programación |
| Jobs | Trabajos |
| No jobs | Sin trabajos |
| Recent Runs | Ejecuciones recientes |
| No runs | Sin ejecuciones |
| OK | OK |
| ERROR | ERROR |

### Pestaña de contactos — Estados de confianza
| Inglés | Español |
|--------|---------|
| verified | verificado |
| pending | pendiente |
| untrusted | no confiable |
| unknown | desconocido |
| Click to copy | Clic para copiar |

### Modal de resumen
| Inglés | Español |
|--------|---------|
| Last Hour — Work Done | Última hora — Trabajo realizado |
| log entries across {n} cards | entradas de registro en {n} tarjetas |

### Iconos de notificaciones toast
| Inglés | Español |
|--------|---------|
| pickup | tomar |
| release | liberar |
| move | mover |
| ship | enviar |
| create | crear |
| edit | editar |

---

## Web UI — Página de configuración

### Elementos de navegación
| Inglés | Español |
|--------|---------|
| General | General |
| Telegram | Telegram |
| GitHub | GitHub |
| Email | Correo electrónico |
| Gemini | Gemini |
| Claude | Claude |
| VPN | VPN |

### Modal de confirmación de contraseña
| Inglés | Español |
|--------|---------|
| Confirm Password | Confirmar contraseña |
| Enter your current password to save changes to sensitive fields. | Ingresa tu contraseña actual para guardar cambios en campos sensibles. |
| Current Password | Contraseña actual |
| Enter password | Ingresar contraseña |
| Cancel | Cancelar |
| Confirm | Confirmar |

---

## Salida de scripts de shell

### ensure-card.sh
| Inglés | Español |
|--------|---------|
| ⚠️ Branch references #{issue_num} but no GitHub issue found | ⚠️ La rama referencia #{issue_num} pero no se encontró issue de GitHub |
| 📋 Creating board card for #{issue_num}: {title} | 📋 Creando tarjeta del tablero para #{issue_num}: {title} |
| ✓ Card created | ✓ Tarjeta creada |

### clean.sh
| Inglés | Español |
|--------|---------|
| Cleaning miniclaw/openclaw... | Limpiando miniclaw/openclaw... |
| Stopping services... | Deteniendo servicios... |
| Killing processes... | Terminando procesos... |
| Removing LaunchAgents... | Eliminando LaunchAgents... |
| Deleting ~/.openclaw... | Eliminando ~/.openclaw... |
| ~/.openclaw already gone | ~/.openclaw ya fue eliminado |
| ✓ Clean. Ready for fresh install. | ✓ Limpio. Listo para instalación nueva. |

### version.sh
| Inglés | Español |
|--------|---------|
| Error: MANIFEST.json not found at {path} | Error: MANIFEST.json no encontrado en {path} |
| Current version: {version} | Versión actual: {version} |

### watch-board.sh
| Inglés | Español |
|--------|---------|
| Watching board for {minutes} minutes | Observando tablero por {minutes} minutos |
| PICKUP | TOMAR |
| RELEASE | LIBERAR |
| STALE | INACTIVO |
| MOVE | MOVER |
| SHIP | ENVIAR |
| CREATE | CREAR |
| BOARD HEALTH REPORT | INFORME DE SALUD DEL TABLERO |
| Activity: | Actividad: |
| Pickups | Tomas |
| Releases | Liberaciones |
| Moves | Movimientos |
| Ships | Envíos |
| Stale (>3min no move) | Inactivo (>3min sin movimiento) |
| Throughput (projected/hr): | Rendimiento (proyectado/hr): |
| Column moves | Movimientos de columna |
| Tuning assessment: | Evaluación de ajuste: |
| NO ACTIVITY — workers not running or cron not firing | SIN ACTIVIDAD — workers no están ejecutándose o cron no está disparando |
| Workers picking up cards but NOT moving them — likely blocked on transitions | Workers están tomando tarjetas pero NO las mueven — probablemente bloqueados en transiciones |
| UNDER-TUNED — too many pickups with no progress | SUB-AJUSTADO — demasiadas tomas sin progreso |
| WELL-TUNED — workers picking up and making progress | BIEN AJUSTADO — workers tomando y progresando |
| SHIPPING — {count} card(s) shipped | ENVIANDO — {count} tarjeta(s) enviada(s) |
| ACTIVE — picking up and moving cards, some stalls expected | ACTIVO — tomando y moviendo tarjetas, algunos atascos son esperados |
| Low signal — run again for a longer window | Señal baja — ejecutar de nuevo por una ventana más larga |

### release.sh
| Inglés | Español |
|--------|---------|
| Releasing miniclaw-os {version} | Publicando miniclaw-os {version} |
| Building board web... | Construyendo web del tablero... |
| ✓ Build OK | ✓ Construcción exitosa |
| Pre-building plugins... | Pre-construyendo plugins... |
| Merging shared dependencies... | Fusionando dependencias compartidas... |
| shared dependencies | dependencias compartidas |
| Installing shared dependencies... | Instalando dependencias compartidas... |
| plugins pre-built (shared node_modules) | plugins pre-construidos (node_modules compartido) |
| Packaging installer... | Empaquetando instalador... |
| ✓ Workspace templates bundled ({count} files) | ✓ Plantillas de espacio de trabajo empaquetadas ({count} archivos) |
| workspace/ not found in repo — skipping template bundle | workspace/ no encontrado en el repo — omitiendo empaquetado de plantillas |
| Tagging {version}... | Etiquetando {version}... |
| Tagging stable... | Etiquetando estable... |
| ✓ Tags pushed | ✓ Etiquetas enviadas |
| Creating GitHub release... | Creando release de GitHub... |
| Done: miniclaw-os {version} | Listo: miniclaw-os {version} |

### push-wiki.sh
| Inglés | Español |
|--------|---------|
| Cloning wiki repo... | Clonando repositorio del wiki... |
| Copying wiki pages... | Copiando páginas del wiki... |
| Wiki updated successfully. | Wiki actualizado exitosamente. |

---

## Definiciones de herramientas — Nombres y descripciones

### mc-authenticator
| Inglés | Español |
|--------|---------|
| Auth Code | Código de autenticación |
| Get the current TOTP 2FA code for a service. Returns the 6-digit code and seconds until expiry. | Obtener el código TOTP 2FA actual para un servicio. Devuelve el código de 6 dígitos y los segundos hasta su expiración. |
| Auth List | Lista de autenticación |
| List all stored TOTP services with issuer and account info. | Listar todos los servicios TOTP almacenados con información de emisor y cuenta. |
| Auth Time Remaining | Tiempo restante de autenticación |
| Seconds until the current TOTP code expires. Useful to decide whether to use the current code or wait. | Segundos hasta que expire el código TOTP actual. Útil para decidir si usar el código actual o esperar. |

### mc-backup
| Inglés | Español |
|--------|---------|
| Create Backup | Crear copia de seguridad |
| Create a tgz backup of the entire openclaw state directory and prune old archives per the tiered retention policy. Returns the backup path and size. | Crear una copia de seguridad tgz de todo el directorio de estado de openclaw y eliminar archivos antiguos según la política de retención por niveles. Devuelve la ruta y tamaño del respaldo. |
| List Backups | Listar copias de seguridad |
| List all backup archives with dates and sizes. Use this to check backup health or find a specific restore point. | Listar todos los archivos de respaldo con fechas y tamaños. Usar para verificar la salud de los respaldos o encontrar un punto de restauración específico. |

### mc-blog
| Inglés | Español |
|--------|---------|
| Blog Voice Rules | Reglas de voz del blog |
| Get the writing voice rules for blog posts. Call this BEFORE writing any blog content to load the persona's tone, banned words, patterns to follow, and anti-patterns to avoid. | Obtener las reglas de voz de escritura para publicaciones del blog. Llamar ANTES de escribir cualquier contenido para cargar el tono del personaje, palabras prohibidas, patrones a seguir y antipatrones a evitar. |
| Blog Arc Context | Contexto de arco del blog |
| Get the current arc plan — weekly/seasonal themes, voice shifts, and seed ideas. | Obtener el plan de arco actual — temas semanales/estacionales, cambios de voz e ideas semilla. |

### mc-board
| Inglés | Español |
|--------|---------|
| Board Create | Crear en tablero |
| Create a card on the kanban board. | Crear una tarjeta en el tablero kanban. |
| Board Update | Actualizar tablero |
| Update fields on a board card. | Actualizar campos de una tarjeta del tablero. |
| Board Move | Mover en tablero |
| Move a card to a different column. | Mover una tarjeta a una columna diferente. |
| Board Show | Mostrar tablero |
| Show full details for a board card. | Mostrar detalles completos de una tarjeta del tablero. |
| Board List | Lista del tablero |
| List cards on the board, optionally filtered by column/priority/tag. | Listar tarjetas del tablero, opcionalmente filtradas por columna/prioridad/etiqueta. |

### mc-booking
| Inglés | Español |
|--------|---------|
| Booking Create | Crear reserva |
| Create a new booking request. | Crear una nueva solicitud de reserva. |
| Booking Approve | Aprobar reserva |
| Approve a pending booking request. | Aprobar una solicitud de reserva pendiente. |
| Booking Cancel | Cancelar reserva |
| Cancel an appointment. | Cancelar una cita. |
| Booking List | Lista de reservas |
| List all appointments. | Listar todas las citas. |

### mc-calendar
| Inglés | Español |
|--------|---------|
| Calendar List | Lista del calendario |
| List upcoming calendar events. | Listar próximos eventos del calendario. |
| Calendar Create | Crear evento |
| Create a new calendar event. | Crear un nuevo evento de calendario. |
| Calendar Update | Actualizar evento |
| Update an existing calendar event. | Actualizar un evento de calendario existente. |
| Calendar Delete | Eliminar evento |
| Delete a calendar event by UID. | Eliminar un evento de calendario por UID. |

### mc-designer
| Inglés | Español |
|--------|---------|
| Designer Generate | Diseñador generar |
| Generate an image from a text prompt and add it as a canvas layer. | Generar una imagen a partir de un indicador de texto y agregarla como capa del lienzo. |
| Designer Edit | Diseñador editar |
| Edit an existing canvas layer using AI instructions. | Editar una capa de lienzo existente usando instrucciones de IA. |
| Designer Composite | Diseñador componer |
| Flatten all layers in a canvas and export as PNG. | Aplanar todas las capas de un lienzo y exportar como PNG. |

### mc-email
| Inglés | Español |
|--------|---------|
| Email Read | Leer correo |
| Read inbox messages. | Leer mensajes de la bandeja de entrada. |
| Email Send | Enviar correo |
| Send an email. | Enviar un correo electrónico. |
| Email Triage | Clasificar correo |
| Auto-triage unread inbox messages. | Auto-clasificar mensajes no leídos de la bandeja de entrada. |
| Email Archive | Archivar correo |
| Archive a message. | Archivar un mensaje. |

### mc-github
| Inglés | Español |
|--------|---------|
| GitHub Issues | Issues de GitHub |
| List or show GitHub issues. | Listar o mostrar issues de GitHub. |
| GitHub PRs | PRs de GitHub |
| List or show GitHub pull requests. | Listar o mostrar solicitudes de extracción de GitHub. |

### mc-kb
| Inglés | Español |
|--------|---------|
| KB Add | Agregar a KB |
| Add a new entry to the knowledge base. | Agregar una nueva entrada a la base de conocimiento. |
| KB Search | Buscar en KB |
| Search knowledge base entries using hybrid vector+keyword search. | Buscar entradas en la base de conocimiento usando búsqueda híbrida vector+palabra clave. |
| KB Get | Obtener de KB |
| Get a knowledge base entry by ID. | Obtener una entrada de la base de conocimiento por ID. |

### mc-memory
| Inglés | Español |
|--------|---------|
| Memory Search | Búsqueda de memoria |
| Search across all memory stores (KB, memos, episodic). | Buscar en todos los almacenes de memoria (KB, memos, episódica). |
| Memory Store | Almacenar memoria |
| Store a new memory entry. | Almacenar una nueva entrada de memoria. |

### mc-research
| Inglés | Español |
|--------|---------|
| Deep Research | Investigación profunda |
| Run a deep research query via Perplexity. | Ejecutar una consulta de investigación profunda vía Perplexity. |
| SERP Check | Verificación SERP |
| Check search engine ranking for a keyword. | Verificar ranking en motores de búsqueda para una palabra clave. |

### mc-rolodex
| Inglés | Español |
|--------|---------|
| Contact Search | Búsqueda de contacto |
| Search contacts by name, email, phone, or tag. | Buscar contactos por nombre, correo, teléfono o etiqueta. |
| Contact Add | Agregar contacto |
| Add a new contact. | Agregar un nuevo contacto. |
| Contact Update | Actualizar contacto |
| Update an existing contact. | Actualizar un contacto existente. |
| Contact Show | Mostrar contacto |
| Show full details for a contact. | Mostrar detalles completos de un contacto. |

### mc-social
| Inglés | Español |
|--------|---------|
| Social Metrics | Métricas sociales |
| Show social engagement metrics. | Mostrar métricas de interacción social. |

### mc-tailscale
| Inglés | Español |
|--------|---------|
| Tailscale Doctor | Diagnóstico de Tailscale |
| Diagnose Tailscale issues — checks binary, daemon, socket, zombie processes, install method (Homebrew vs standalone), and connection state. | Diagnosticar problemas de Tailscale — verifica binario, daemon, socket, procesos zombie, método de instalación (Homebrew vs independiente) y estado de conexión. |
| Tailscale Status | Estado de Tailscale |
| Show current Tailscale state: connection status, hostname, IPs, peers, serve/funnel config, and certificate info. | Mostrar estado actual de Tailscale: estado de conexión, nombre de host, IPs, pares, configuración serve/funnel e información de certificados. |
| Tailscale Harden | Endurecimiento de Tailscale |
| Apply Tailscale hardening settings: shields-up, disable route acceptance, auto-updates, and Tailscale SSH. Use dry_run=true to preview commands. | Aplicar configuración de endurecimiento de Tailscale: shields-up, deshabilitar aceptación de rutas, actualizaciones automáticas y Tailscale SSH. Usa dry_run=true para previsualizar comandos. |
| Preview commands without applying | Previsualizar comandos sin aplicar |

### mc-web-chat
| Inglés | Español |
|--------|---------|
| chat-with-ai | chat-with-ai |
| Start a chat session with Mike O'Neal's AI assistant. Send a message and receive an AI-powered response about MiniClaw, consulting, projects, or general inquiries. | Iniciar una sesión de chat con el asistente de IA de Mike O'Neal. Enviar un mensaje y recibir una respuesta impulsada por IA sobre MiniClaw, consultoría, proyectos o consultas generales. |
| The message to send to the AI assistant | El mensaje a enviar al asistente de IA |

### mc-voice
| Inglés | Español |
|--------|---------|
| Transcribe | Transcribir |
| Transcribe an audio file using whisper.cpp. | Transcribir un archivo de audio usando whisper.cpp. |
| Voice Record | Grabación de voz |
| Record audio from the system microphone using sox. Returns the path to the recorded WAV file (16kHz mono). Requires a duration — the recording stops automatically after the specified seconds. | Grabar audio desde el micrófono del sistema usando sox. Devuelve la ruta al archivo WAV grabado (mono 16kHz). Requiere una duración — la grabación se detiene automáticamente después de los segundos especificados. |
| Recording duration in seconds (required) | Duración de la grabación en segundos (requerido) |

### mc-x
| Inglés | Español |
|--------|---------|
| Post Tweet | Publicar tweet |
| Post a tweet to X/Twitter. | Publicar un tweet en X/Twitter. |
| Read Timeline | Leer línea de tiempo |
| Read the X/Twitter timeline. | Leer la línea de tiempo de X/Twitter. |

---

## Mensajes internos de registro (para referencia)

| Inglés | Español |
|--------|---------|
| [mc-kb] sqlite-vec unavailable — vector search disabled (FTS5-only mode) | [mc-kb] sqlite-vec no disponible — búsqueda vectorial deshabilitada (modo solo FTS5) |
| [mc-kb/embedder] Model loaded OK — vector search enabled | [mc-kb/embedder] Modelo cargado OK — búsqueda vectorial habilitada |
| [mc-kb/embedder] Using embedding daemon via Unix socket | [mc-kb/embedder] Usando daemon de embeddings vía socket Unix |
| [mc-kb/embedder] Daemon socket exists but not responding — falling back to in-process | [mc-kb/embedder] Socket del daemon existe pero no responde — retrocediendo a proceso interno |
| [mc-kb/embedder] Daemon went away — falling back to in-process | [mc-kb/embedder] El daemon se desconectó — retrocediendo a proceso interno |
| [mc-kb/search] hybrid search | [mc-kb/search] búsqueda híbrida |
| [mc-kb/search] FTS+vec returned nothing — falling back to substring scan | [mc-kb/search] FTS+vec no devolvió resultados — retrocediendo a escaneo de subcadenas |
| [mc-web-chat] WebSocket server on ws://127.0.0.1:{port} | [mc-web-chat] Servidor WebSocket en ws://127.0.0.1:{port} |
| [mc-web-chat] spawning claude for session | [mc-web-chat] generando proceso claude para la sesión |
| [mc-web-chat] claude exited | [mc-web-chat] claude finalizó |
| [mc-web-chat] context pressure — scheduling restart | [mc-web-chat] presión de contexto — programando reinicio |
| [mc-web-chat] context full — killing session | [mc-web-chat] contexto lleno — terminando sesión |
| [mc-web-chat] workspace loaded files | [mc-web-chat] espacio de trabajo cargó archivos |
| [mc-web-chat] topic shift detected | [mc-web-chat] cambio de tema detectado |
| [mc-web-chat] cleaning up stale session | [mc-web-chat] limpiando sesión inactiva |
| [mc-web-chat] archived session | [mc-web-chat] sesión archivada |
| log rotated; previous archived | registro rotado; anterior archivado |
| log file size cap reached; suppressing writes | tamaño máximo del archivo de registro alcanzado; suprimiendo escrituras |

---

*Este archivo fue generado automáticamente por MiniClaw a partir del código fuente de miniclaw-os.*
*Fecha de extracción: 2026-03-22*
