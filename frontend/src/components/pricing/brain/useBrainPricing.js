import { useCallback, useState } from "react";
import { toast } from "react-toastify";
import { BRAIN_BILLING_CYCLES, BRAIN_DEFAULT_SUBTITLE } from "./constants";

export default function useBrainPricing({ onChoose, subtitle }) {
  const [cycle, setCycle] = useState(BRAIN_BILLING_CYCLES[0]);

  const resolvedSubtitle = subtitle || BRAIN_DEFAULT_SUBTITLE;

  const handleSelectPlan = useCallback(
    (tier) => {
      if (typeof onChoose === "function") {
        onChoose(cycle, tier);
        return;
      }
      toast.info("Entre em contato com o administrador para contratar este plano.");
    },
    [cycle, onChoose]
  );

  return {
    cycle,
    setCycle,
    resolvedSubtitle,
    handleSelectPlan,
    checkingOut: null
  };
}
