# Project Overview

This project, `open-router`, is a modern TypeScript monorepo built with Better-T-Stack. It combines React, TanStack Start, and Convex to provide a full-stack application development experience.

## Key Technologies

*   **TypeScript:** Ensures type safety and enhances developer experience.
*   **TanStack Start:** An SSR (Server-Side Rendering) framework integrated with TanStack Router for the frontend web application.
*   **TailwindCSS:** A utility-first CSS framework for rapid UI development.
*   **shadcn/ui:** Provides a collection of reusable UI components.
*   **Convex:** A reactive backend-as-a-service platform, used for the backend logic and data storage.
*   **Turborepo:** An optimized build system for managing the monorepo structure.

## Architecture

The project is structured as a monorepo with the following main packages:

*   `apps/web/`: Contains the frontend application, developed with React and TanStack Start.
*   `packages/backend/`: Houses the Convex backend functions, schemas, and related configurations.

## Getting Started

To set up and run the project locally, ensure you have `bun` installed.

1.  **Install dependencies:**
    ```bash
    bun install
    ```
2.  **Start the development server (all applications):**
    ```bash
    bun run dev
    ```
    This will typically make the web application available at `http://localhost:3001`.

## Available Scripts

The following `bun run` scripts are available from the root directory:

*   `bun run dev`: Starts all applications (web and backend) in development mode using Turborepo.
*   `bun run build`: Builds all applications for production.
*   `bun run check-types`: Runs TypeScript type checking across all packages.
*   `bun run dev:web`: Starts only the web frontend application in development mode.
*   `bun run dev:server`: Starts only the Convex backend server in development mode.
*   `bun run dev:setup`: Sets up and configures the Convex project.

## Development Conventions

*   **TypeScript:** All code is written in TypeScript for strong typing.
*   **Monorepo Management:** Turborepo is used for efficient management and building of different applications/packages within the monorepo.
