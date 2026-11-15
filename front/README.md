# Quasar App (quasar-project)

A Quasar Project

## Install the dependencies
```bash
yarn
# or
npm install
```

### Start the app in development mode (hot-code reloading, error reporting, etc.)
```bash
quasar dev
```


### Lint the files
```bash
yarn lint
# or
npm run lint
```


### Format the files
```bash
yarn format
# or
npm run format
```


### Build the app for production
```bash
quasar build
```

### Customize the configuration
See [Configuring quasar.config.js](https://v2.quasar.dev/quasar-cli-vite/quasar-config-js).

## Usar com o back-end real

1. Suba o back-end (veja `saveall-backend/README.md`) e o banco no pgAdmin.
2. Copie `.env.example` para `.env` (no front) — já vem com `USE_MOCK_API=false` e `API_URL=http://localhost:3001/v1`.
3. `npm install` e `npm run dev` (abre em http://localhost:9000).

Sem o arquivo `.env` (ou com `USE_MOCK_API=true`) o front funciona sozinho, com a API simulada no navegador.
