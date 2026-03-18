import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../contexts/AuthContext';
import kmelotLogo from '../assets/kmelot.png';
import fondoImg from '../assets/fondo.png';

export function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setError('');
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden">
      {/* Background image with blur to compensate low resolution */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-110"
        style={{ backgroundImage: `url(${fondoImg})`, filter: 'blur(2px)' }}
      />
      {/* Light overlay for contrast */}
      <div className="absolute inset-0 bg-white/40" />

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={kmelotLogo} alt="Kmelot" className="w-36 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-zinc-900">DNIT Comprobantes</h1>
          <p className="text-sm text-zinc-500 mt-1">Ingresá tus credenciales para continuar</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
              <p className="text-xs text-rose-600 font-medium">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">Usuario</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition-colors"
              placeholder="tu_usuario"
              autoComplete="username"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">Contraseña</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 pr-10 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition-colors"
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !username.trim() || !password.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading && <Spinner size="xs" />}
            Iniciar sesión
          </button>
        </form>

        <p className="text-center text-[11px] text-zinc-900 mt-6">
          Automatización de comprobantes fiscales DNIT Paraguay
        </p>
      </div>
    </div>
  );
}
