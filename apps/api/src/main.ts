import { createApp } from './bootstrap.js';
import { AppConfig } from './config/config.js';

const config = AppConfig.fromEnv();
const app = await createApp({ config });
await app.listen({ port: config.env.PORT, host: config.env.HOST });
