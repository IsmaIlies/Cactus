import { CheckCircle2, Circle } from "lucide-react";
import React from "react";

type Step = {
  title: string;
  description: string;
};

type StepperProps = {
  steps: Step[];
  currentStep: number;
  completed: number[];
};

const Stepper: React.FC<StepperProps> = ({ steps, currentStep, completed }) => {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-white mb-6">Progression</h2>
      <ol className="space-y-5">
        {steps.map((step, index) => {
          const isActive = index === currentStep;
          const isCompleted = completed.includes(index);
          return (
            <li key={step.title} className="flex gap-4">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                  isCompleted
                    ? "border-green-400 bg-green-500/20 text-green-200"
                    : isActive
                    ? "border-white text-white"
                    : "border-white/30 text-white/40"
                }`}
              >
                {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
              </div>
              <div className="flex-1">
                <p
                  className={`text-sm font-semibold uppercase tracking-wide ${
                    isActive ? "text-white" : "text-white/70"
                  }`}
                >
                  Étape {index + 1}
                </p>
                <h3 className={`text-lg font-medium ${isActive ? "text-white" : "text-white/80"}`}>
                  {step.title}
                </h3>
                <p className="text-sm text-white/60">{step.description}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default Stepper;
