import { createApp } from './bootstrap.js';
import { AppConfig } from './config/config.js';

const config = AppConfig.fromEnv();
const app = await createApp({ config });
// The kernel caps this (net.core.somaxconn / kern.ipc.somaxconn); raise both for big bursts.
await app.listen({ port: config.env.PORT, host: config.env.HOST, backlog: 2048 });
