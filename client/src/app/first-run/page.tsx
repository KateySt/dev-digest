/* First-run setup route — /first-run. Thin wrapper; the wizard lives in
   _components/FirstRunWizard. The app sends users here while keys are missing
   (see useSetupGuard in components/app-shell). */
"use client";

import { FirstRunWizard } from "./_components/FirstRunWizard";

export default function FirstRunSetupPage() {
  return <FirstRunWizard />;
}
