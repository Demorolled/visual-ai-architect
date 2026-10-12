import { useToast } from '../utils/toast';
import './ToastHost.css';

/** Renders whatever the global toast store currently holds (nothing when idle). */
export default function ToastHost() {
  const message = useToast((s) => s.message);
  const tone = useToast((s) => s.tone);
  const dismiss = useToast((s) => s.dismiss);

  if (!message) return null;

  return (
    <div className={`app-toast app-toast-${tone}`} role="status" aria-live="polite">
      <span className="app-toast-message">{message}</span>
      <button className="app-toast-close" onClick={dismiss} title="Dismiss">✕</button>
    </div>
  );
}
