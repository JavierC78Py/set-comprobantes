import { Solver } from 'solvecaptcha-javascript';
import { logger } from '../config/logger';

export interface SolveCaptchaOptions {
  apiKey: string;
  siteKey: string;
  pageUrl: string;
  timeoutMs?: number;
}

/**
 * Resuelve un reCAPTCHA v2 usando el SDK oficial de solvecaptcha-javascript.
 * Retorna el g-recaptcha-response token listo para inyectar en el formulario.
 */
export async function resolverCaptcha(opts: SolveCaptchaOptions): Promise<string> {
  logger.debug('Enviando reCAPTCHA a SolveCaptcha', {
    pageUrl: opts.pageUrl,
  });

  const solver = new Solver(opts.apiKey);

  const res = await solver.recaptcha({
    pageurl: opts.pageUrl,
    googlekey: opts.siteKey,
  });

  const token = res.data;

  if (!token || token.length < 20) {
    throw new Error(`SolveCaptcha: token inválido recibido: ${String(token)}`);
  }

  logger.debug('Captcha resuelto por SolveCaptcha SDK', {
    token_prefix: token.substring(0, 20) + '...',
    captcha_id: res.id,
  });

  return token;
}
