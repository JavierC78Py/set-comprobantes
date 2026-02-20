import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Spinner } from '../ui/Spinner';

interface SyncModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (mes?: number, anio?: number) => Promise<void>;
  tenantName: string;
  loading?: boolean;
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export function SyncModal({ open, onClose, onSubmit, tenantName, loading }: SyncModalProps) {
  const now = new Date();
  const [usePeriodo, setUsePeriodo] = useState(false);
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  const handleSubmit = async () => {
    await onSubmit(usePeriodo ? mes : undefined, usePeriodo ? anio : undefined);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sincronizar comprobantes"
      description={tenantName}
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-md btn-secondary" disabled={loading}>
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={loading} className="btn-md btn-primary">
            {loading && <Spinner size="xs" />}
            Encolar sync
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-lg border border-zinc-200">
          <button
            type="button"
            onClick={() => setUsePeriodo(!usePeriodo)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              usePeriodo ? 'bg-zinc-900' : 'bg-zinc-300'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                usePeriodo ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
          <div>
            <p className="text-xs font-medium text-zinc-700">Período específico</p>
            <p className="text-xs text-zinc-400">Por defecto sincroniza el mes actual</p>
          </div>
        </div>

        {usePeriodo && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Mes</label>
              <select
                className="input"
                value={mes}
                onChange={(e) => setMes(Number(e.target.value))}
              >
                {MONTHS.map((m, i) => (
                  <option key={i + 1} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Año</label>
              <select
                className="input"
                value={anio}
                onChange={(e) => setAnio(Number(e.target.value))}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <p className="text-xs text-zinc-400">
          Se encolará un job <span className="font-mono font-medium">SYNC_COMPROBANTES</span> que
          el worker procesará en el próximo ciclo de polling.
        </p>
      </div>
    </Modal>
  );
}
