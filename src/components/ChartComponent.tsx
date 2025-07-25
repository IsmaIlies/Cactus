import React from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line, Bar, Pie } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface ChartProps {
  type: "line" | "bar" | "pie";
  data: any;
  options?: any;
  height?: number;
}

const ChartComponent: React.FC<ChartProps> = ({
  type,
  data,
  options = {},
  height,
}) => {
  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom" as const,
      },
    },
  };

  const mergedOptions = { ...defaultOptions, ...options };

  const containerStyle = {
    position: "relative" as const,
    height: height || "300px",
    width: "100%",
  };

  const renderChart = () => {
    switch (type) {
      case "line":
        return <Line data={data} options={mergedOptions} />;
      case "bar":
        return <Bar data={data} options={mergedOptions} />;
      case "pie":
        return <Pie data={data} options={mergedOptions} />;
      default:
        return <Line data={data} options={mergedOptions} />;
    }
  };

  return <div style={containerStyle}>{renderChart()}</div>;
};

export default ChartComponent;
