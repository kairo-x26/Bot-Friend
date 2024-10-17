import { AppConfig } from '../config/config.js';
import { openDatabase } from '../db/database.js';

const config = AppConfig.fromEnv({ ...process.env, RUN_MIGRATIONS: 'true' });
const handle = await openDatabase(config);
await handle.close();
console.log('Migrations applied');
