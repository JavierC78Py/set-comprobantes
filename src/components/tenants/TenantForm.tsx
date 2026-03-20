import { useState } from 'react';
import { Eye, EyeOff, HelpCircle } from 'lucide-react';
import { Spinner } from '../ui/Spinner';
import { cn } from '../../lib/utils';
import type { TenantWithConfig, AuthType } from '../../types';

interface TenantFormProps {
  initialData?: TenantWithConfig;
  onSubmit: (data: TenantFormData) => Promise<void>;
  loading?: boolean;
}

export interface TenantFormData {
  nombre_fantasia: string;
  ruc: string;
  email_contacto: string;
  config: {
    ruc_login: string;
    usuario_marangatu: string;
    clave_marangatu: string;
    enviar_a_ords_automaticamente: boolean;
    frecuencia_sincronizacion_minutos: number;
    marangatu_base_url: string;
    ords_base_url: string;
    ords_endpoint_facturas: string;
    ords_tipo_autenticacion: AuthType;
    ords_usuario: string;
    ords_password: string;
    ords_token: string;
    ords_client_id: string;
    ords_client_secret: string;
    ords_token_endpoint: string;
  };
}

interface FieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

function Field({ label, required, hint, error, children }: FieldProps) {
  return (
    <div>
      <label className="label">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
        {hint && (
          <span className="ml-1 inline-flex" title={hint}>
            <HelpCircle className="w-3 h-3 text-zinc-300 inline" />
          </span>
        )}
      </label>
      {children}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  placeholder,
  name,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  name?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || '••••••••'}
        name={name}
        className="input pr-9"
        autoComplete="new-password"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
      >
        {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

const TABS = ['general', 'marangatu', 'ords', 'avanzado'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  general: 'General',
  marangatu: 'Marangatu',
  ords: 'Oracle ORDS',
  avanzado: 'Avanzado',
};

export function TenantForm({ initialData, onSubmit, loading }: TenantFormProps) {
  const [tab, setTab] = useState<Tab>('general');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState<TenantFormData>({
    nombre_fantasia: initialData?.nombre_fantasia || '',
    ruc: initialData?.ruc || '',
    email_contacto: initialData?.email_contacto || '',
    config: {
      ruc_login: initialData?.config?.ruc_login || '',
      usuario_marangatu: initialData?.config?.usuario_marangatu || '',
      clave_marangatu: '',
      enviar_a_ords_automaticamente:
        initialData?.config?.enviar_a_ords_automaticamente ?? false,
      frecuencia_sincronizacion_minutos:
        initialData?.config?.frecuencia_sincronizacion_minutos ?? 60,
      marangatu_base_url:
        initialData?.config?.marangatu_base_url || 'https://marangatu.set.gov.py',
      ords_base_url: initialData?.config?.ords_base_url || '',
      ords_endpoint_facturas: initialData?.config?.ords_endpoint_facturas || '',
      ords_tipo_autenticacion: initialData?.config?.ords_tipo_autenticacion || 'NONE',
      ords_usuario: initialData?.config?.ords_usuario || '',
      ords_password: '',
      ords_token: '',
      ords_client_id: initialData?.config?.ords_client_id || '',
      ords_client_secret: '',
      ords_token_endpoint: initialData?.config?.ords_token_endpoint || '',
    },
  });

  const set = (key: keyof TenantFormData, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  };

  const setConfig = (key: keyof TenantFormData['config'], value: unknown) => {
    setForm((prev) => ({ ...prev, config: { ...prev.config, [key]: value } }));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.nombre_fantasia.trim()) newErrors.nombre_fantasia = 'Requerido';
    if (!form.ruc.trim()) newErrors.ruc = 'Requerido';
    if (!form.config.ruc_login.trim()) newErrors.ruc_login = 'Requerido';
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      if (newErrors.nombre_fantasia || newErrors.ruc) setTab('general');
      else if (newErrors.ruc_login) setTab('marangatu');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex gap-0 border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden mb-6">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 py-2 text-xs font-medium transition-colors duration-100',
              t === tab
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                : 'bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700'
            )}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {tab === 'general' && (
          <>
            <Field label="Nombre / Razón social" required error={errors.nombre_fantasia}>
              <input
                className="input"
                value={form.nombre_fantasia}
                onChange={(e) => set('nombre_fantasia', e.target.value)}
                placeholder="Farmacia Central S.A."
              />
            </Field>
            <Field label="RUC" required error={errors.ruc} hint="Ej: 80012345-6">
              <input
                className="input font-mono"
                value={form.ruc}
                onChange={(e) => set('ruc', e.target.value)}
                placeholder="80012345-6"
              />
            </Field>
            <Field label="Email de contacto">
              <input
                className="input"
                type="email"
                value={form.email_contacto}
                onChange={(e) => set('email_contacto', e.target.value)}
                placeholder="admin@empresa.com.py"
              />
            </Field>
          </>
        )}

        {tab === 'marangatu' && (
          <>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
              Credenciales para acceso al portal Marangatu SET Paraguay. Las contraseñas se
              cifran con AES-256 antes de almacenarse.
            </div>
            {!form.config.usuario_marangatu && !form.config.clave_marangatu && (
              <div className="text-xs text-amber-600 dark:text-amber-400 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                Sin credenciales Marangatu, la empresa no participará en las sincronizaciones automáticas.
                Pueden completarse después.
              </div>
            )}
            <Field label="RUC de login" required error={errors.ruc_login}>
              <input
                className="input font-mono"
                value={form.config.ruc_login}
                onChange={(e) => setConfig('ruc_login', e.target.value)}
                placeholder="80012345-6"
              />
            </Field>
            <Field label="Usuario Marangatu" hint="Puede completarse después">
              <input
                className="input"
                value={form.config.usuario_marangatu}
                onChange={(e) => setConfig('usuario_marangatu', e.target.value)}
                placeholder="mi_usuario_set"
              />
            </Field>
            <Field
              label={initialData ? 'Clave Marangatu (dejar vacío para no cambiar)' : 'Clave Marangatu'}
              hint="Puede completarse después"
            >
              <PasswordInput
                value={form.config.clave_marangatu}
                onChange={(v) => setConfig('clave_marangatu', v)}
                placeholder={initialData ? '(sin cambios)' : '••••••••'}
              />
            </Field>
            <Field label="URL base Marangatu">
              <input
                className="input font-mono text-xs"
                value={form.config.marangatu_base_url}
                onChange={(e) => setConfig('marangatu_base_url', e.target.value)}
              />
            </Field>
          </>
        )}

        {tab === 'ords' && (
          <>
            <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
              <div>
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Enviar a ORDS automáticamente</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Encola envío ORDS después de cada sync
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setConfig(
                    'enviar_a_ords_automaticamente',
                    !form.config.enviar_a_ords_automaticamente
                  )
                }
                className={cn(
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                  form.config.enviar_a_ords_automaticamente ? 'bg-zinc-900 dark:bg-zinc-100' : 'bg-zinc-300 dark:bg-zinc-600'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
                    form.config.enviar_a_ords_automaticamente ? 'translate-x-4' : 'translate-x-0.5'
                  )}
                />
              </button>
            </div>

            <Field label="URL base ORDS">
              <input
                className="input font-mono text-xs"
                value={form.config.ords_base_url}
                onChange={(e) => setConfig('ords_base_url', e.target.value)}
                placeholder="https://oracle.empresa.com/ords"
              />
            </Field>
            <Field label="Endpoint facturas">
              <input
                className="input font-mono text-xs"
                value={form.config.ords_endpoint_facturas}
                onChange={(e) => setConfig('ords_endpoint_facturas', e.target.value)}
                placeholder="/api/v1/facturas"
              />
            </Field>

            <Field label="Tipo de autenticación">
              <select
                className="input"
                value={form.config.ords_tipo_autenticacion}
                onChange={(e) =>
                  setConfig('ords_tipo_autenticacion', e.target.value as AuthType)
                }
              >
                <option value="NONE">Sin autenticación</option>
                <option value="BASIC">Basic Auth</option>
                <option value="BEARER">Bearer Token</option>
                <option value="CLIENT_CREDENTIALS">OAuth2 Client Credentials</option>
              </select>
            </Field>

            {form.config.ords_tipo_autenticacion === 'BASIC' && (
              <>
                <Field label="Usuario ORDS">
                  <input
                    className="input"
                    value={form.config.ords_usuario}
                    onChange={(e) => setConfig('ords_usuario', e.target.value)}
                    placeholder="oracle_user"
                  />
                </Field>
                <Field label={initialData ? 'Contraseña ORDS (dejar vacío para no cambiar)' : 'Contraseña ORDS'}>
                  <PasswordInput
                    value={form.config.ords_password}
                    onChange={(v) => setConfig('ords_password', v)}
                    placeholder={initialData ? '(sin cambios)' : '••••••••'}
                  />
                </Field>
              </>
            )}

            {form.config.ords_tipo_autenticacion === 'BEARER' && (
              <Field label={initialData ? 'Token ORDS (dejar vacío para no cambiar)' : 'Bearer Token'}>
                <PasswordInput
                  value={form.config.ords_token}
                  onChange={(v) => setConfig('ords_token', v)}
                  placeholder={initialData ? '(sin cambios)' : 'eyJhbGci...'}
                />
              </Field>
            )}

            {form.config.ords_tipo_autenticacion === 'CLIENT_CREDENTIALS' && (
              <>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                  OAuth2 Client Credentials: la app obtiene y renueva el token automáticamente
                  usando el client_id y client_secret configurados en Oracle ORDS.
                </div>
                <Field label="Token Endpoint URL" hint="URL donde se solicita el access_token (ej: .../oauth/token)">
                  <input
                    className="input font-mono text-xs"
                    value={form.config.ords_token_endpoint}
                    onChange={(e) => setConfig('ords_token_endpoint', e.target.value)}
                    placeholder="https://abc123.adb.us-ashburn-1.oraclecloudapps.com/ords/schema/oauth/token"
                  />
                </Field>
                <Field label="Client ID">
                  <input
                    className="input font-mono text-xs"
                    value={form.config.ords_client_id}
                    onChange={(e) => setConfig('ords_client_id', e.target.value)}
                    placeholder="AbCdEf123..."
                  />
                </Field>
                <Field label={initialData ? 'Client Secret (dejar vacío para no cambiar)' : 'Client Secret'}>
                  <PasswordInput
                    value={form.config.ords_client_secret}
                    onChange={(v) => setConfig('ords_client_secret', v)}
                    placeholder={initialData ? '(sin cambios)' : '••••••••'}
                  />
                </Field>
              </>
            )}
          </>
        )}

        {tab === 'avanzado' && (
          <>
            <Field
              label="Frecuencia de sincronización (minutos)"
              hint="Con qué frecuencia el scheduler encola un nuevo sync automático"
            >
              <input
                type="number"
                className="input"
                value={form.config.frecuencia_sincronizacion_minutos}
                onChange={(e) =>
                  setConfig('frecuencia_sincronizacion_minutos', Number(e.target.value))
                }
                min={5}
                max={1440}
              />
              <p className="text-xs text-zinc-400 mt-1">Mínimo 5 minutos. Default: 60</p>
            </Field>
          </>
        )}
      </div>

      <div className="pt-5 mt-5 border-t border-zinc-100 dark:border-zinc-700 flex justify-end gap-3">
        <button type="submit" disabled={loading} className="btn-lg btn-primary">
          {loading && <Spinner size="xs" />}
          {initialData ? 'Guardar cambios' : 'Crear empresa'}
        </button>
      </div>
    </form>
  );
}
