import React from 'react';
import { FiCheckCircle, FiAlertCircle, FiInfo, FiX } from 'react-icons/fi';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  onClose: () => void;
  duration?: number;
}

const Toast: React.FC<ToastProps> = ({
  message,
  type = 'info',
  onClose,
  duration = 5000,
}) => {
  React.useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const typeClasses = {
    success: 'bg-success text-white',
    error: 'bg-error text-white',
    info: 'bg-primary text-white',
    warning: 'bg-secondary text-white',
  };

  const icons = {
    success: <FiCheckCircle size={20} />,
    error: <FiAlertCircle size={20} />,
    info: <FiInfo size={20} />,
    warning: <FiAlertCircle size={20} />,
  };

  return (
    <div className={`${typeClasses[type]} rounded-card shadow-card p-4 flex items-center gap-3 animate-slide-in`}>
      {icons[type]}
      <span className="flex-1">{message}</span>
      <button
        onClick={onClose}
        className="hover:opacity-80 transition-opacity"
      >
        <FiX size={20} />
      </button>
    </div>
  );
};

export default Toast;
