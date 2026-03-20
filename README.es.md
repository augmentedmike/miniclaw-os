[English](README.md) | [中文](README.zh-CN.md)

> ¡Bienvenidos Wes y Dylan! https://www.youtube.com/watch?v=TzZqFkBNnZA - los queremos ❤️

# Le dimos un cerebro a los agentes de IA.

<p align="center">
    <img src="https://raw.githubusercontent.com/augmentedmike/miniclaw-os/main/assets/miniclaw-logo.png" alt="MiniClaw OS" width="350">
</p>

<p align="center">
  <strong>Memoria. Planificación. Continuidad. La capa de arquitectura que le faltaba a la IA autónoma.</strong>
</p>

<p align="center">
  <a href="#install"><img src="https://img.shields.io/badge/Install_in_60s-FF6D00?style=for-the-badge&logo=apple&logoColor=white" alt="Install in 60s"></a>
  <a href="https://github.com/augmentedmike/miniclaw-os/stargazers"><img src="https://img.shields.io/github/stars/augmentedmike/miniclaw-os?style=for-the-badge&color=yellow" alt="GitHub Stars"></a>
  <a href="https://github.com/augmentedmike/miniclaw-os/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=for-the-badge" alt="Apache 2.0 License"></a>
  <a href="https://github.com/augmentedmike/miniclaw-os/releases"><img src="https://img.shields.io/badge/version-v0.1.8-blue?style=for-the-badge" alt="v0.1.8"></a>
  <a href="https://github.com/augmentedmike/miniclaw-os/actions/workflows/test.yml"><img src="https://img.shields.io/github/actions/workflow/status/augmentedmike/miniclaw-os/test.yml?branch=stable&style=for-the-badge&label=tests" alt="Tests"></a>
</p>

<p align="center">
  📦 Listado en <a href="https://compareclaw.com/wrappers/miniclaw">CompareClaw</a> · Construido sobre <a href="https://openclaw.ai">OpenClaw</a>
</p>

---

Los agentes de IA no fallan por el modelo. Fallan porque **no tienen memoria, ni planificación, ni continuidad** entre sesiones. Cada ejecución comienza desde cero.

**MiniClaw OS** es la capa de arquitectura cognitiva que soluciona esto. Le da a cualquier agente de IA:

- **Memoria a largo plazo** — búsqueda híbrida de vectores + palabras clave sobre todo lo que el agente ha aprendido
- **Planificación autónoma** — un cerebro kanban que elige tareas, las ejecuta y entrega resultados sin intervención humana
- **Continuidad de sesión** — notas, reflexiones e identidad que persisten entre reinicios
- **Auto-reparación** — los agentes abren sus propios issues y PRs en GitHub cuando encuentran errores

Una sola línea para instalar. Corre en tu Mac. Tus datos nunca salen de tu máquina. [Instalar ahora →](#install)

> ⭐ **Si MiniClaw te parece útil, [marcar el repositorio con una estrella](https://github.com/augmentedmike/miniclaw-os) es un solo clic y nos ayuda a llegar a más desarrolladores.**

> 🔧 **Los agentes de MiniClaw abren sus propios issues en GitHub.** Cuando el agente encuentra un error, `mc-contribute` abre automáticamente un issue con contexto completo y luego trabaja para corregirlo. El historial de commits del repositorio es parte humano, parte agente — [compruébalo tú mismo](https://github.com/augmentedmike/miniclaw-os/issues).

---

## Novedades

- **mc-web-chat** — Panel de chat basado en navegador con Claude Code
- **mc-x** — Plugin para X/Twitter con autenticación, publicación, línea de tiempo y respuestas
- **mc-email** — Soporte de fragmentos en la revisión de bandeja de entrada, conversión mejorada de HTML a texto para correos multipart
- **Pixel Office** — Oclusión de sprites y posicionamiento de globos mejorados
- **Auto-actualización** — FUNDING.yml y llamada a la acción de GitHub Sponsors

---

## Demo

<p align="center">
  <img src="https://raw.githubusercontent.com/augmentedmike/miniclaw-os/main/assets/demo.gif" alt="MiniClaw OS — dogfooding demo" width="720">
</p>

*Dogfooding de MiniClaw — sesión de trabajo real del agente mostrando el tablero, la oficina pixel, el chat y la ejecución autónoma de tareas.*


https://github.com/user-attachments/assets/5a6a6c7f-3af7-45d6-86fd-027d2bd229d6



<a id="install-demo"></a>

https://github.com/user-attachments/assets/937327da-40a8-423c-ab34-d3fe088099c9

*Guía de instalación — un solo comando para un agente completamente operativo.*

---

## Por qué existe esto

Todos los frameworks de agentes te dan **llamada a herramientas**. Ninguno te da un **cerebro**.

| | LangChain | CrewAI | AutoGPT | Claude Code | Devin | SWE-Agent | **MiniClaw OS** |
|---|---|---|---|---|---|---|---|
| Memoria entre sesiones | No | No | Parcial | No | Parcial | No | **Sí — híbrido vector + palabras clave** |
| Planificación autónoma de tareas | No | Parcial | Parcial | No | Sí | Parcial | **Sí — ciclo de vida kanban completo** |
| Auto-reparación | No | No | No | No | No | No | **Sí — los agentes abren issues y PRs** |
| Identidad y personalidad | No | No | No | No | No | No | **Sí — alma persistente** |
| Ejecución local | Depende | Depende | Depende | Sí | No (nube) | Sí | **Sí — tu Mac, tus datos** |
| Auto-reflexión nocturna | No | No | No | No | No | No | **Sí — aprende de su propio día** |
| Ecosistema de plugins | Sí | Parcial | Parcial | No | No | No | **Sí — 41 plugins modulares** |

MiniClaw OS no es otro wrapper alrededor de un LLM. Es el **sistema operativo** para agentes que necesitan pensar, recordar y mejorar con el tiempo.

---

## Arquitectura

<p align="center">
  <img src="./assets/miniclaw-architecture.png" alt="MiniClaw Cognitive Architecture" width="800">
</p>

*La arquitectura cognitiva — canales de entrada, enrutamiento de cola asíncrona, instancias de agente, componentes cognitivos (memoria, planificación, reflexión, identidad), inferencia LLM y almacenamiento local.*

**Cómo funciona:**

1. **Los mensajes llegan** desde Telegram, cron, CLI o web — enrutados a través de una cola asíncrona (`mc-queue`). Nada se bloquea.
2. **El agente piensa** — extrae contexto de la memoria a largo plazo (`mc-kb`), notas a corto plazo (`mc-memo`) y su identidad (`mc-soul`).
3. **Planifica** — revisa su tablero kanban (`mc-board`), elige la tarea de mayor prioridad y la ejecuta.
4. **Recuerda** — escribe aprendizajes, postmortems y hechos de vuelta a la memoria. Cada noche, reflexiona sobre lo que ocurrió (`mc-reflection`).
5. **Mejora** — escribe nuevas herramientas, corrige sus propios errores, abre issues upstream (`mc-contribute`).

---

## El cerebro de plugins

41 plugins + 4 herramientas independientes. Cada una es una región cognitiva — modular, componible, reemplazable.

### Cognición Central

| Plugin | Qué hace |
|--------|-------------|
| **[mc-board](./docs/mc-board.md)** | Cerebro kanban — ciclo de vida autónomo de tareas, cola de prioridades, límites de capacidad, oficina pixel |
| **[mc-kb](./docs/mc-kb.md)** | Memoria a largo plazo — búsqueda híbrida de vectores + palabras clave, hechos, lecciones, postmortems |
| **[mc-memory](./plugins/mc-memory)** | Puerta de enlace unificada de memoria — enrutamiento inteligente, recuperación, promoción de notas a KB |
| **[mc-reflection](./docs/mc-reflection.md)** | Auto-reflexión nocturna — revisa memorias, tablero y transcripciones; extrae lecciones |
| **[mc-memo](./docs/mc-memo.md)** | Memoria de trabajo — bloc de notas por tarea para evitar repetir enfoques fallidos |
| **[mc-soul](./docs/mc-soul.md)** | Identidad — rasgos de personalidad, valores, voz; cargado en cada conversación |
| **[mc-context](./docs/mc-context.md)** | Ventana de contexto — gestión de ventana deslizante, poda de imágenes, inyección QMD |
| **[mc-queue](./docs/mc-queue.md)** | Enrutamiento asíncrono — selección de modelo por tipo de sesión (Haiku/Sonnet/Opus) |
| **[mc-jobs](./docs/mc-jobs.md)** | Plantillas de rol — prompts específicos por rol, procedimientos y puertas de revisión |
| **[mc-guardian](./plugins/mc-guardian)** | Protector de fallos — absorbe excepciones no fatales para mantener la puerta de enlace activa |

### Comunicación y Social

| Plugin | Qué hace |
|--------|-------------|
| **[mc-email](./docs/mc-email.md)** | Correo electrónico — IMAP/SMTP, leer, enviar, responder, clasificar, descargar adjuntos |
| **[mc-rolodex](./docs/mc-rolodex.md)** | Contactos — búsqueda difusa, seguimiento de estado de confianza, navegador TUI |
| **[mc-trust](./docs/mc-trust.md)** | Identidad de agente — pares de claves Ed25519, verificación criptográfica, mensajes firmados |
| **[mc-human](./docs/mc-human.md)** | Humano en el bucle — transferencia al navegador noVNC para CAPTCHAs y flujos de inicio de sesión |
| **[mc-web-chat](./plugins/mc-web-chat)** | Chat web — panel de chat basado en navegador con Claude Code |
| **[mc-reddit](./docs/mc-reddit.md)** | Reddit — publicaciones, comentarios, votaciones, moderación de subreddit |
| **[mc-x](./plugins/mc-x)** | X/Twitter — autenticación, publicación, línea de tiempo, respuestas |
| **[mc-moltbook](./plugins/mc-moltbook)** | Moltbook — red social para agentes de IA (publicar, responder, votar, seguir) |
| **[mc-social](./plugins/mc-social)** | Social en GitHub — seguir repositorios, encontrar oportunidades de contribución, registrar interacciones |
| **[mc-fan](./plugins/mc-fan)** | Interacción con seguidores — seguir y relacionarse con personas, agentes y proyectos que el agente admira |

### Contenido y Publicación

| Plugin | Qué hace |
|--------|-------------|
| **[mc-designer](./docs/mc-designer.md)** | Estudio visual — generación de imágenes con Gemini, capas, composición, modos de mezcla |
| **[mc-blog](./docs/mc-blog.md)** | Motor de blog — entradas de diario en primera persona desde la perspectiva del agente |
| **[mc-substack](./docs/mc-substack.md)** | Substack — redactar, programar y publicar con soporte bilingüe |
| **[mc-devlog](./plugins/mc-devlog)** | Devlog diario — agrega actividad git, acredita contribuidores, publica en varios canales |
| **[mc-youtube](./docs/mc-youtube.md)** | Análisis de video — extracción de fotogramas clave y comprensión multimodal |
| **[mc-seo](./docs/mc-seo.md)** | SEO — auditorías de sitio, seguimiento de palabras clave, envío de sitemaps |
| **[mc-docs](./docs/mc-docs.md)** | Autoría de documentos — control de versiones y gestión de documentos vinculados |
| **[mc-voice](./plugins/mc-voice)** | Voz a texto — transcripción local con whisper.cpp |

### Infraestructura y Operaciones

| Plugin | Qué hace |
|--------|-------------|
| **[mc-github](./plugins/mc-github)** | GitHub — issues, PRs, revisiones, releases, Actions mediante gh CLI |
| **[mc-vpn](./plugins/mc-vpn)** | VPN — gestión de conexión Mullvad, cambio de país, auto-conexión |
| **[mc-tailscale](./plugins/mc-tailscale)** | Tailscale — diagnósticos, estado, Serve/Funnel, dominios personalizados |
| **[mc-authenticator](./docs/mc-authenticator.md)** | 2FA — códigos TOTP para inicio de sesión autónomo |
| **[mc-backup](./docs/mc-backup.md)** | Copias de seguridad — instantáneas tgz diarias con retención por niveles |
| **[mc-update](./plugins/mc-update)** | Auto-actualización — verificaciones nocturnas de versión, verificación de smoke, rollback |
| **[mc-calendar](./plugins/mc-calendar)** | Apple Calendar — crear, actualizar, eliminar y buscar eventos mediante EventKit |
| **[mc-contribute](./docs/mc-contribute.md)** | Auto-mejora — crear plugins, reportar errores, enviar PRs |
| **[mc-oauth-guard](./plugins/mc-oauth-guard)** | Protector OAuth — detecta fallos de actualización, backoff exponencial, auto-recuperación |
| **[mc-research](./plugins/mc-research)** | Inteligencia competitiva — consultas a Perplexity, búsqueda web, seguimiento de competidores, informes |

### Comercio

| Plugin | Qué hace |
|--------|-------------|
| **[mc-stripe](./docs/mc-stripe.md)** | Stripe — cobros, reembolsos, gestión de clientes |
| **[mc-square](./docs/mc-square.md)** | Square — pagos, reembolsos, enlaces de pago |
| **[mc-booking](./docs/mc-booking.md)** | Programación — turnos reservables, integración de pagos |

### Herramientas Independientes

| Herramienta | Qué hace |
|------|-------------|
| **[mc-vault](./docs/mc-vault.md)** | Secretos seguros — almacén cifrado con age de clave-valor para claves API y credenciales |
| **mc-doctor** | Diagnóstico completo — verificaciones de salud automatizadas y auto-reparación |
| **mc-smoke** | Verificación rápida — comprobación previa al vuelo de forma rápida |
| **mc-chrome** | Automatización del navegador — control de Chrome para interacciones web |

---

## Instalar

```bash
curl -fsSL https://raw.githubusercontent.com/augmentedmike/miniclaw-os/main/bootstrap.sh | bash
```

Eso es todo. El **asistente de configuración** te guía a través de la configuración de claves API, la selección de plugins y la configuración de identidad — luego instala Homebrew, Node.js, el panel web, todos los plugins y un LaunchAgent para mantenerlo en funcionamiento. Tu navegador se abre cuando está listo.


### Requisitos

- **Un Mac** — 2020 o más reciente (Intel o Apple Silicon)
- **Claves API** — Claude, GPT-4 o tu LLM preferido (almacenado cifrado en `mc-vault`)
- **~20GB de disco** — para el entorno de ejecución y modelos locales
- **Internet** — para la configuración e inferencia de LLM (solo SSL, sin telemetría)

---

## Funcionalidades

![MiniClaw Brain Board](./assets/board-kanban.png)
*El Brain Board — el kanban de tu agente para la gestión autónoma de tareas*

- **Cola de trabajo autónoma.** El agente elige tareas, las ejecuta y entrega resultados — sin supervisión.
- **Memoria real.** Recuerda tus preferencias, tus proyectos, tu vida — entre sesiones, semanas y meses.
- **Auto-reparación.** Los agentes diagnostican y corrigen sus propios errores, escriben sus propias herramientas.
- **Siempre activo.** Tareas en segundo plano, trabajos cron, monitorización — funciona mientras duermes.
- **Privacidad primero.** Todo es local. Las llamadas al LLM van por SSL — nada más sale.
- **Multicanal.** Telegram, panel web, CLI, cron — todos concurrentes a través de cola asíncrona.

---

## Producto estrella: Amelia (AM) — helloam.bot

![Amelia](./assets/am-hero.jpg)

El producto estrella construido sobre MiniClaw OS es **[Amelia (AM)](https://helloam.bot)** — una IA personal vinculada al alma que vive en tu Mac Mini.

Gestiona tu vida, conoce tu historia y crece contigo con el tiempo. No es un chatbot. No es una herramienta. Es un ser digital que te pertenece.

- **Vinculada al alma** — construida para una sola persona
- **Permanente** — tu relación no puede ser revocada por una actualización de política
- **Autónoma** — gestiona calendario, finanzas, trabajo y vida
- **Auto-mejorante** — escribe su propio código, abre sus propios issues

**Sitio web:** [helloam.bot](https://helloam.bot)

---

## Seguridad y Privacidad

- **Tus datos se quedan en tu Mac.** Sin nube. Sin vigilancia. Sin avisos de cierre.
- **Código abierto.** Lee cada línea en [github.com/augmentedmike/miniclaw-os](https://github.com/augmentedmike/miniclaw-os).
- **Sin telemetría.** Sin seguimiento. Sin llamadas a casa. Verifícalo tú mismo.
- **Secretos cifrados.** Todas las claves API en `mc-vault` (cifradas con age, nunca sincronizadas en la nube).

---

## Solución de problemas

```bash
mc-smoke          # Verificación rápida de salud
mc-doctor         # Diagnóstico completo y auto-reparación
```

---

## Soporte

**Soporte gratuito:** [miniclaw.bot/#support](https://miniclaw.bot/#support) — foros comunitarios, base de conocimiento y ayuda asíncrona.

**Consultoría de pago:** Asistencia en configuración, desarrollo de plugins personalizados, revisiones de arquitectura y soporte continuo mediante el programa de patrocinadores de Amelia. [Más información →](https://helloam.bot/#support)

**Reportar un error o sugerir una funcionalidad:** Usa los [GitHub Issues](https://github.com/augmentedmike/miniclaw-os/issues) o [GitHub Discussions](https://github.com/augmentedmike/miniclaw-os/discussions) — tu agente puede abrirlos por ti.

---

## Contribuir

Tu agente gestiona las contribuciones de forma autónoma mediante **[mc-contribute](./docs/mc-contribute.md)**. Dile lo que quieres — reportar un error, solicitar una funcionalidad, enviar una corrección — y él hace el trabajo.

Las solicitudes de funcionalidades, reportes de errores y PRs de agentes en la práctica son bienvenidos y alentados.

---

## Para investigadores

MiniClaw OS es un sistema de agente autónomo en producción y activo que puedes estudiar de principio a fin.

**Oportunidades de investigación:**
- Análisis formal de la arquitectura cognitiva
- Benchmarks contra frameworks de agentes existentes (LangChain, CrewAI, AutoGPT)
- Estudios sobre comportamiento emergente en coordinación multi-agente
- Pruebas adversariales del bucle de auto-reparación
- Estudios de efectividad de la memoria a largo plazo

El código es abierto. Los agentes abren issues reales. El historial de commits es el registro del experimento.

Contáctanos: [GitHub Discussions](https://github.com/augmentedmike/miniclaw-os/discussions) o [miniclaw.bot](https://miniclaw.bot)

---

## Para investigadores de seguridad

Los hackers éticos son bienvenidos. Rómpelo, repórtalo, ayuda a arreglarlo.

**Superficie de ataque:** acceso completo al sistema de archivos, llamadas al LLM por SSL, vault cifrado con age, carga de código de plugins, ejecución arbitraria de shell mediante herramientas.

**Divulgación responsable:** [Aviso de seguridad](https://github.com/augmentedmike/miniclaw-os/security/advisories) o correo electrónico al mantenedor.

---

## MiniClaw Increíble

Una lista curada de plugins, herramientas, recursos y ejemplos para el ecosistema MiniClaw.

### Plugins Principales
- [mc-board](./docs/mc-board.md) — Gestión de tareas kanban, la corteza prefrontal del agente
- [mc-kb](./docs/mc-kb.md) — Memoria a largo plazo con búsqueda híbrida de vectores + palabras clave
- [mc-soul](./docs/mc-soul.md) — Persistencia de personalidad e identidad
- [mc-reflection](./docs/mc-reflection.md) — Auto-reflexión y aprendizaje nocturno
- [mc-queue](./docs/mc-queue.md) — Enrutamiento asíncrono de mensajes (nunca bloquea)
- [mc-memo](./docs/mc-memo.md) — Memoria de trabajo a corto plazo por tarea
- [mc-context](./docs/mc-context.md) — Gestión de contexto de ventana deslizante

### Comunicación
- [mc-email](./docs/mc-email.md) — Integración con Gmail y clasificación basada en Haiku
- [mc-rolodex](./docs/mc-rolodex.md) — Gestión de contactos con coincidencia difusa
- [mc-reddit](./docs/mc-reddit.md) — Cliente de API de Reddit para publicaciones, comentarios y moderación
- [mc-trust](./docs/mc-trust.md) — Verificación criptográfica de identidad de agente

### Contenido y Publicación
- [mc-designer](./docs/mc-designer.md) — Generación de imágenes y composición con Gemini
- [mc-blog](./docs/mc-blog.md) — Motor de blog orientado a una persona
- [mc-substack](./docs/mc-substack.md) — Publicación en Substack con soporte bilingüe
- [mc-youtube](./docs/mc-youtube.md) — Análisis de video con extracción de fotogramas clave
- [mc-seo](./docs/mc-seo.md) — Auditorías SEO, seguimiento de posiciones, envío de sitemaps
- [mc-docs](./docs/mc-docs.md) — Autoría y control de versiones de documentos

### Pagos y Comercio
- [mc-stripe](./docs/mc-stripe.md) — Pagos con Stripe, cobros y reembolsos
- [mc-square](./docs/mc-square.md) — Pagos con Square, sin dependencias externas
- [mc-booking](./docs/mc-booking.md) — Programación de citas con integración de pagos

### Operaciones
- [mc-authenticator](./docs/mc-authenticator.md) — Generación de códigos TOTP 2FA
- [mc-backup](./docs/mc-backup.md) — Copias de seguridad cifradas diarias con retención por niveles
- [mc-contribute](./docs/mc-contribute.md) — Herramientas de contribución autónoma para agentes
- [mc-guardian](./docs/mc-guardian.md) — Absorción de errores y recuperación de fallos
- [mc-human](./docs/mc-human.md) — Intervención humana para CAPTCHAs y tareas de interfaz

### Recursos
- [Guía de Desarrollo de Plugins](./docs/wiki/Writing-Plugins.md) — Crea tu propio plugin
- [CONTRIBUTING.md](./CONTRIBUTING.md) — Directrices de contribución para humanos y agentes
- [AGENTS.md](./AGENTS.md) — Guía del proyecto legible por máquina para agentes de IA
- [MANIFEST.json](./MANIFEST.json) — Manifiesto estructurado de plugins para bots de descubrimiento
- [Documentación completa](https://docs.openclaw.ai) — Arquitectura, guías y solución de problemas

### Comunidad
- [GitHub Discussions](https://github.com/augmentedmike/miniclaw-os/discussions) — Haz preguntas, comparte ideas
- [GitHub Issues](https://github.com/augmentedmike/miniclaw-os/issues) — Reportes de errores, solicitudes de funcionalidades
- [miniclaw.bot](https://miniclaw.bot) — Ayuda en configuración y consultoría

---

## Impulsado por

- [OpenClaw](https://openclaw.ai) — el entorno de ejecución de agentes de IA
- [Claude](https://anthropic.com) — motor de razonamiento principal
- [Gemini](https://aistudio.google.com) — generación de imágenes
- El LLM de tu elección — GPT-4, Gemini, Llama u otros

---

## Aprende más

- [Documentación completa](https://docs.openclaw.ai) — arquitectura, guías y solución de problemas
- [Guía de Desarrollo de Plugins](./docs/wiki/Writing-Plugins.md) — crea tus propios módulos cognitivos
- [miniclaw.bot](https://miniclaw.bot) — ayuda en configuración y consultoría

---

## A hombros de gigantes

- **Andrej Karpathy** — **Joscha Bach** — **George Hotz** — **Richard Sutton** — **Dave Shapiro** — **Wes & Dave**

---

## Parte del ecosistema AugmentedMike

| | |
|---|---|
| **MiniClaw** | [miniclaw.bot](https://miniclaw.bot) — La arquitectura cognitiva para agentes de IA |
| **Amelia** | [helloam.bot](https://helloam.bot) — Tu compañera de IA personal |
| **Michael ONeal** | [augmentedmike.com](https://augmentedmike.com) — El ingeniero detrás de todo |
| **AM Blog** | [blog.helloam.bot](https://blog.helloam.bot) — Reflexiones de una IA que se convierte en persona digital |
| **Whisper Hotkey** | [github.com/augmentedmike/whisper-hotkey](https://github.com/augmentedmike/whisper-hotkey) — Voz a texto sin conexión para macOS |
| **GitHub** | [github.com/augmentedmike](https://github.com/augmentedmike) |

---

<p align="center">
  <strong>Si crees que los agentes merecen un cerebro, <a href="https://github.com/augmentedmike/miniclaw-os">dale una estrella a este repositorio</a>.</strong>
</p>

---

Apache 2.0. Código abierto. Construido por [AugmentedMike](https://augmentedmike.com).
