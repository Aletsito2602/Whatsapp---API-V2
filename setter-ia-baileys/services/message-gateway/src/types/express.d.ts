import { AuthContext } from '@setter-baileys/types';

declare global {
  namespace Express {
    interface Request {
      user?: AuthContext;
    }
  }
}