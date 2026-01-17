# Project Overview – AGENTS

This repository hosts the **MilleGrilles Private Apps** – a React‑based front‑end that connects to the MilleGrilles ecosystem.  
The code is split into a set of logical modules, each responsible for a distinct feature set. Below is a quick reference to the main modules and their purpose.

## Core Application

- **`src/App.tsx`** – Root component that sets up routing, theming and global providers.
- **`src/connectionStore.ts`** – Zustand store that manages the WebSocket / REST connection to the MilleGrilles backend, authentication state and certificate handling.
- **`src/workers`** – Web workers that perform heavy or blocking tasks (e.g., file synchronization, cryptographic operations) without blocking the UI.
- **`src/serviceWorker.ts`** – Service worker for offline support and caching via Workbox.

## Feature Modules

| Module | Path | Description |
|--------|------|-------------|
| **AI Chat** | `src/aichat` | Provides a chat UI that interacts with an AI backend. Handles user authentication, conversation persistence (IndexedDB), and message synchronization. |
| **Collections 2** | `src/collections2` | File & data explorer for the user’s personal collections. Includes browsing, sharing, file upload/download, and media conversion utilities. |
| **Notepad** | `src/notepad` | Rich text editor for notes, with group management, persistence, and synchronization. |
| **Passive Sensors** | `src/senseurspassifs` | Dashboard for Bluetooth and other passive sensors. Includes device discovery, configuration, and real‑time data visualization. Note: this module is **DEPRECATED** |
| **Resources** | `src/resources` | Shared assets such as icons, MIME type definitions, and timezone data. |

## Utilities & Helpers

- **`src/MillegrillesIdb.ts`** – IndexedDB helper for storing collections, notes, and chat history.
- **`src/VersionInfo.tsx`** – Displays current app version and build information.
- **`src/AGENTS.md`** – (This file) high‑level overview of the project’s modules.

## Development Notes

- Run `npm install` to fetch dependencies.  
- `npm start` launches the dev server.  
- `npm run build` creates a production build under `build/`.  
- Tests are located in `src/**/__tests__` and run with `npm test`.
- When creating a `e.preventDefault()` call in a javascript event handler, also add `e.stopPropagation()`.

## Nomenclature

- collections2 is a file manager application for MilleGrilles.
- `fuuid` is a unique physical file unique identifier, the file is always encrypted.
- `tuuid` is a filesystem unique identifier, it can represent a file or a directory in MilleGrilles.
- `cle_id` is a decryption key identifier.

Feel free to explore the source tree to understand how each module interacts with the others. Happy hacking!
