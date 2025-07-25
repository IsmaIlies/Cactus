import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  bgColor?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  bgColor = 'bg-white',
  trend,
  trendValue,
}) => {
  const getTrendColor = () => {
    switch (trend) {
      case 'up':
        return 'text-green-600';
      case 'down':
        return 'text-red-600';
      default:
        return 'text-gray-500';
    }
  };

  const getTrendIcon = () => {
    switch (trend) {
      case 'up':
        return '↑';
      case 'down':
        return '↓';
      default:
        return '•';
    }
  };

  return (
    <div className={`${bgColor} rounded-lg shadow-sm p-4 border border-gray-100`}>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-500">{title}</h3>
          <div className="mt-1 flex items-baseline">
            <p className="text-2xl font-semibold text-gray-900">{value}</p>
            {subtitle && <p className="ml-2 text-sm text-gray-500">{subtitle}</p>}
          </div>
          {trend && (
            <div className={`mt-2 flex items-center text-sm ${getTrendColor()}`}>
              <span>{getTrendIcon()}</span>
              <span className="ml-1">{trendValue}</span>
            </div>
          )}
        </div>
        {icon && <div className="p-2 bg-cactus-100 rounded-lg">{icon}</div>}
      </div>
    </div>
  );
};

export default StatCard;