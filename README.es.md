[English](README.md) | [中文](README.zh-CN.md)

# MiniClaw

Un ecosistema de plugins para construir agentes de IA autónomos sobre [OpenClaw](https://github.com/openclaw).

MiniClaw le da a tu agente memoria persistente, gestión de tareas, contactos, correo electrónico y una base de conocimientos — todo como plugins modulares que puedes combinar a tu gusto.

## Plugins

| Plugin | Descripción |
|--------|-------------|
| **mc-board** | Tablero kanban con máquina de estados obligatoria (pendiente → en progreso → en revisión → completado). Le da al agente una corteza prefrontal — planificación persistente y seguimiento entre sesiones. |
| **mc-kb** | Base de conocimientos con búsqueda de texto completo. Almacena y recupera información estructurada. |
| **mc-email** | Integración de correo electrónico — enviar, recibir, clasificar. |
| **mc-rolodex** | Gestión de contactos — agregar, buscar, listar, actualizar, eliminar contactos. |
| **shared/webmcp** | Biblioteca de integración WebMCP para exponer herramientas del agente a Chrome 146+ mediante el Web Model Context Protocol. |

## Inicio Rápido

### 1. Clonar el repositorio

```bash
git clone https://github.com/anthropic/miniclaw-os.git
cd miniclaw-os
```

### 2. Elegir un perfil de configuración

Hay perfiles preconfigurados disponibles en `examples/`:

| Perfil | Plugins | Caso de uso |
|--------|---------|-------------|
| **Minimal (Mínimo)** | 6 básicos | Asistente personal local |
| **Developer (Desarrollador)** | 12 | Flujos de trabajo de ingeniería de software |
| **Content Creator (Creador de contenido)** | 14 | Escritura y publicación |
| **Headless (Sin interfaz)** | Todos | Instalación completa con todas las credenciales |

```bash
cp examples/minimal.example.json my-config.json
# Completa tus credenciales
```

### 3. Instalar

```bash
./install.sh --config my-config.json
```

## Comandos

Cada plugin registra comandos CLI a través de `openclaw`:

```bash
# Tablero de tareas
openclaw mc-board create --title "Corregir error de autenticación" --priority high
openclaw mc-board board              # vista completa del kanban
openclaw mc-board next               # ¿qué debo hacer ahora?

# Base de conocimientos
openclaw mc-kb search "pasos de despliegue"
openclaw mc-kb add --title "Claves API" --content "..."

# Correo electrónico
openclaw mc-email inbox
openclaw mc-email send --to usuario@ejemplo.com --subject "Hola"

# Contactos
openclaw mc-rolodex search "Alice"
openclaw mc-rolodex add --name "Alice" --email "alice@ejemplo.com"
```

## Estructura del Proyecto

```
miniclaw-os/
├── mc-board/          # Plugin de tablero de tareas + panel web
│   ├── docs/          # Documentación
│   ├── web/           # Interfaz web Next.js
│   └── src/           # Lógica principal
├── mc-kb/             # Plugin de base de conocimientos
├── plugins/
│   ├── mc-email/      # Plugin de correo electrónico
│   ├── mc-rolodex/    # Plugin de contactos
│   └── shared/
│       └── webmcp/    # Biblioteca de integración WebMCP
└── examples/          # Perfiles de configuración
```

## Documentación

- [Documentación de mc-board](mc-board/docs/README.md) — arquitectura y configuración del tablero de tareas
- [Configuraciones de ejemplo](examples/README.md) — perfiles de configuración preconfigurados
- [Patrones WebMCP](plugins/shared/webmcp/WEBMCP-PATTERNS.md) — referencia de integración web

## Licencia

MIT
