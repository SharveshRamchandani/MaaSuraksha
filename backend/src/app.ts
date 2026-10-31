import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import routes from './routes';
import { notFound } from './middleware/notFound';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

const app = express();

const isProduction = process.env.NODE_ENV === 'production';

// Behind Render's proxy every request arrives from the proxy's address, so
// without this the rate limiters would treat all users as one client.
// TRUST_PROXY = number of proxy hops (default 1 in production, off locally).
const trustProxy = Number(process.env.TRUST_PROXY ?? (isProduction ? 1 : 0));
if (trustProxy > 0) app.set('trust proxy', trustProxy);

if (isProduction && !process.env.FRONTEND_URL) {
  throw new Error('FRONTEND_URL must be set in production (exact origin of the deployed frontend).');
}

// FRONTEND_URL may hold several comma-separated origins (e.g. the LAN address
// and localhost during development). Only exact matches are allowed.
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

// Security headers. CORP is relaxed to cross-origin because the frontend runs on
// a different origin and loads API responses (e.g. report downloads) from it;
// CORS below still decides which origins may read them.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      try {
        const hostname = new URL(origin).hostname;
        const isAllowed =
          allowedOrigins.includes(origin) ||
          hostname.endsWith('.vercel.app') ||
          hostname === 'localhost' ||
          hostname === '127.0.0.1';
        if (isAllowed) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
      } catch {
        callback(new Error('Invalid Origin header'));
      }
    },
    credentials: true,
  })
);
app.use(express.json());

// Root & direct /health endpoints to ensure Render/uptime health checks succeed
// regardless of whether the health check path is configured as /, /health, or /api/health.
app.get(['/', '/health'], (_req, res) => {
  res.status(200).json({ success: true, message: 'MaaSuraksha API is running' });
});

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

export default app;
