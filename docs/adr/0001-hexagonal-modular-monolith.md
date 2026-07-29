# Enforce a hexagonal modular monolith in both workspace languages

ZentraOS will remain one Nx workspace and one deployable backend through the early product stages, while domain, application, adapters, and composition roots remain separate projects. TypeScript boundaries are enforced by Nx ESLint constraints and Python boundaries by Import Linter because neither code review nor one language's tooling can protect both dependency graphs.
