import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Spinner } from '../ui/Spinner';

interface ConsultaModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (fechaDesde: string, fechaHasta: string) => Promise<void>;
  tenantName: string;
  loading?: boolean;
}

function formatDateToInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function ConsultaModal({ open, onClose, onSubmit, tenantName, loading }: ConsultaModalProps) {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const [fechaDesde, setFechaDesde] = useState(formatDateToInput(firstDay));
  const [fechaHasta, setFechaHasta] = useState(formatDateToInput(now));

  const handleSubmit = async () => {
    if (!fechaDesde || !fechaHasta) return;
    await onSubmit(fechaDesde, fechaHasta);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Consultar comprobantes registrados"
      description={tenantName}
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-md btn-secondary" disabled={loading}>
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !fechaDesde || !fechaHasta}
            className="btn-md btn-primary"
          >
            {loading && <Spinner size="xs" />}
            Consultar
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Fecha desde</label>
            <input
              type="date"
              className="input"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Fecha hasta</label>
            <input
              type="date"
              className="input"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
            />
          </div>
        </div>

        <p className="text-xs text-zinc-400">
          Se encolará un job <span className="font-mono font-medium">CONSULTA_COMPROBANTES</span> que
          buscará en "Consulta de Comprobantes Registrados" de Marangatu. Solo se insertarán comprobantes
          nuevos (los existentes se saltan).
        </p>
      </div>
    </Modal>
  );
}
