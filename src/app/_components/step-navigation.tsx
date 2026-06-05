"use client"

export type StepItem = {
  readonly eyebrow: string
  readonly id: string
  readonly label: string
}

type StepNavigationProps = {
  readonly activeStepId: string
  readonly onStepChange?: (stepId: string) => void
  readonly steps: readonly StepItem[]
}

export function StepNavigation({
  activeStepId,
  onStepChange,
  steps,
}: StepNavigationProps) {
  return (
    <nav aria-label="앱 단계" className="gx-step-nav">
      {steps.map((step) => (
        <button
          aria-current={step.id === activeStepId ? "step" : undefined}
          className="gx-step-button"
          key={step.id}
          onClick={() => onStepChange?.(step.id)}
          type="button"
        >
          <span className="text-sm font-black">{step.label}</span>
          <span className="text-xs font-semibold text-white/55">
            {step.eyebrow}
          </span>
        </button>
      ))}
    </nav>
  )
}
