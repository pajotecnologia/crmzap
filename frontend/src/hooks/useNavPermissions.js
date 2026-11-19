import { useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/Auth/AuthContext";
import usePlans from "./usePlans";
import useHelps from "./useHelps";
import { isFreeTrialUser } from "../helpers/trialIntegrationFilter";

export const INTERNAL_AUTOMATION_EMAIL = "admin@admin.com";

export function isInternalAutomationUser(user) {
  return String(user?.email || "").trim().toLowerCase() === INTERNAL_AUTOMATION_EMAIL;
}

const EMPTY_PLAN = {
  useCampaigns: false,
  useKanban: false,
  useOpenAi: false,
  useIntegrations: false,
  useSchedules: false,
  useInternalChat: false,
  useExternalApi: false,
};

/**
 * Mesmas regras de visibilidade do menu lateral (MainListItems), reunidas
 * para a navegação mobile. O backend continua sendo a fonte de verdade.
 */
export default function useNavPermissions() {
  const { user } = useContext(AuthContext);
  const { getPlanCompany } = usePlans();
  const { list: listHelps } = useHelps();
  const [plan, setPlan] = useState(EMPTY_PLAN);
  const [hasHelps, setHasHelps] = useState(false);

  const companyId = user?.companyId;

  useEffect(() => {
    let cancelled = false;
    if (!companyId) return undefined;
    (async () => {
      try {
        const data = await getPlanCompany(undefined, companyId);
        if (cancelled || !data?.plan) return;
        setPlan({
          useCampaigns: Boolean(data.plan.useCampaigns),
          useKanban: Boolean(data.plan.useKanban),
          useOpenAi: Boolean(data.plan.useOpenAi),
          useIntegrations: Boolean(data.plan.useIntegrations),
          useSchedules: Boolean(data.plan.useSchedules),
          useInternalChat: Boolean(data.plan.useInternalChat),
          useExternalApi: Boolean(data.plan.useExternalApi),
        });
      } catch {
        /* mantém tudo desligado */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return undefined;
    (async () => {
      try {
        const helps = await listHelps();
        if (!cancelled) setHasHelps(Array.isArray(helps) && helps.length > 0);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const freeTrial = isFreeTrialUser(user);

  return {
    plan,
    hasHelps,
    isFreeTrial: freeTrial,
    isInternalAutomationAdmin: isInternalAutomationUser(user),
    showContacts: user?.showContacts === "enabled",
    showFlow: user?.showFlow === "enabled",
    showAgents: Boolean(plan.useOpenAi || (user?.profile && user.profile !== "user")),
    showSchedules: plan.useSchedules,
    showCampaigns: plan.useCampaigns,
    showPlatformApi: !freeTrial,
    showMessagesApi: freeTrial && plan.useExternalApi,
  };
}
