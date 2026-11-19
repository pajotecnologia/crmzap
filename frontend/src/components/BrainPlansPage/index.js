import React from "react";
import useBrainCredits from "../../hooks/useBrainCredits";
import { useIsDarkMode } from "../../hooks/useMediaQueryBrain";
import BrainPricingSection from "../pricing/brain";
import BrainPlansLayout from "../pricing/brain/BrainPlansLayout";

export default function BrainPlansPage({ refreshKey = 0 }) {
  const isDark = useIsDarkMode();
  const mode = isDark ? "dark" : "light";

  const { status, loading } = useBrainCredits(refreshKey);

  return (
    <BrainPlansLayout>
      <BrainPricingSection
        themeMode={mode}
        creditsStatus={status}
        creditsLoading={loading}
      />
    </BrainPlansLayout>
  );
}
