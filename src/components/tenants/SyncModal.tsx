import { Modal } from '../ui/Modal';
import { Spinner } from '../ui/Spinner';

interface SyncModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (mes?: number, anio?: number) => Promise<void>;
  tenantName: string;
  loading?: boolean;
}

export function SyncModal({ open, onClose, onSubmit, tenantName, loading }: SyncModalProps) {
  const handleSubmit = async () => {
    await onSubmit();
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
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        Se sincronizarán los comprobantes del mes actual desde
        "Gestión de Comprobantes Informativos" de Marangatu.
      </p>
      <p className="text-xs text-zinc-400 mt-3">
        Se encolará un job <span className="font-mono font-medium">SYNC_COMPROBANTES</span> que
        el worker procesará en el próximo ciclo de polling.
      </p>
    </Modal>
  );
}
