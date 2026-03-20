import type { Metadata } from "next";
import { WizardProvider } from "../wizard-context";
import SetupWizard from "../setup-wizard";

export const metadata: Metadata = {
  title: "Installation and Setup",
};

export const dynamic = "force-dynamic";

export default function StepPage() {
  return (
    <WizardProvider>
      <SetupWizard />
    </WizardProvider>
  );
}
