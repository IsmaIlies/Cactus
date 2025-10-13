import React from 'react';

interface QuickActionProps {
  icon: React.ReactNode;
  title: string;
  bgColor?: string;
  onClick?: () => void;
}

const QuickAction: React.FC<QuickActionProps> = ({
  icon,
  title,
  bgColor = 'bg-cactus-100',
  onClick,
}) => {
  return (
    <div 
      className="flex flex-col items-center p-3 cursor-pointer transition-transform duration-200 hover:scale-105"
      onClick={onClick}
    >
      <div className={`${bgColor} p-3 rounded-lg mb-2`}>
        {icon}
      </div>
      <span className="text-sm font-medium text-center text-black">{title}</span>
    </div>
  );
};

export default QuickAction;