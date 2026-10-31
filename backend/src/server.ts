import 'dotenv/config';
import app from './app';
import { logger } from './utils/logger';

const PORT = Number(process.env.PORT) || 5000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  logger.info(`MaaSuraksha API listening on ${HOST}:${PORT}`);
});
