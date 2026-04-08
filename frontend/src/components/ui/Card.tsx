import React from 'react';

interface CardProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
  onClick?: () => void;
}

const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  children,
  className = '',
  footer,
  onClick,
}) => {
  return (
    <div className={`card ${className}`} onClick={onClick}>
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h3 className="text-lg font-semibold text-gray-900">{title}</h3>}
          {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
        </div>
      )}
      <div className="mb-4">{children}</div>
      {footer && (
        <div className="border-t border-gray-100 pt-4 mt-4">
          {footer}
        </div>
      )}
    </div>
  );
};

export default Card;
