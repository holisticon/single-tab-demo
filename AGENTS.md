# Project boundaries

- Keep file reads, writes, searches, and tool working directories inside this project.
- Do not inspect other checkouts or user/global package caches.
- Use published npm packages. Do not substitute local package archives or packages from another checkout.
- Keep the npm cache inside the project at `.npm-cache/`.
- Put no more than one shell command on each line.
