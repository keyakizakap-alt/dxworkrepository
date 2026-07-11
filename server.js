// server.js
// DX Copilot エントリポイント。`node server.js` で起動(依存ゼロ)。

import { createServer } from './src/router.js';
import { getMode } from './src/llm.js';

const PORT = Number(process.env.PORT) || 3000;

const server = createServer();

server.listen(PORT, () => {
  getMode()
    .then((mode) => {
      console.log(`DX Copilot server listening on http://localhost:${PORT} (mode: ${mode})`);
    })
    .catch((err) => {
      console.error('failed to determine llm mode:', err);
      console.log(`DX Copilot server listening on http://localhost:${PORT}`);
    });
});

server.on('error', (err) => {
  console.error('server error:', err);
  process.exit(1);
});
