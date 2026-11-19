import React, { useState, useMemo, useCallback } from "react";
import { Box, Button } from "@material-ui/core";
import EventNoteOutlinedIcon from "@material-ui/icons/EventNoteOutlined";
import LeadCreateWizardForm from "./LeadCreateWizardForm";
import LeadDetailSummary from "./LeadDetailSummary";
import CreateActivityModal from "../CreateActivityModal";

const defaultFormatMoney = (v) =>
  `R$ ${(Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

const EMPTY_ARRAY = [];

export default function LeadDetailPanel(props) {
  const {
    classes,
    lead,
    form,
    selectedContact,
    activeStep,
    setActivityModalOpen: setActivityModalOpenProp,
    activityModalOpen: activityModalOpenProp,
    ticket
  } = props;

  const [activityModalOpenLocal, setActivityModalOpenLocal] = useState(false);
  const activityModalOpen = activityModalOpenProp ?? activityModalOpenLocal;
  const setActivityModalOpen =
    setActivityModalOpenProp ?? setActivityModalOpenLocal;

  // Painel de detalhes do lead precisa ser editável (Salvar no footer).
  // Antes forçava viewOnly e bloqueava produto/origem/campos até clicar em lápis.
  const wizardProps = useMemo(
    () => ({ ...props, compact: false, viewOnly: false }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      props.activeStep,
      props.form,
      props.phone,
      props.email,
      props.cartLines,
      props.cartTotal,
      props.currency,
      props.stageOptions,
      props.users,
      props.selectedContact,
      props.inventoryItems,
      props.originChannel,
      props.pipelines,
      props.selectedPipelineId,
      props.priority,
      props.tagInput
    ]
  );

  const activityData = useMemo(
    () => ({
      title: form.name ? `Follow-up: ${form.name}` : "",
      contactId: form.contactId || selectedContact?.id || lead?.contactId,
      leadId: lead?.id
    }),
    [form.name, form.contactId, selectedContact?.id, lead?.contactId, lead?.id]
  );

  const handleOpenActivity = useCallback(
    () => setActivityModalOpen(true),
    [setActivityModalOpen]
  );
  const handleCloseActivity = useCallback(
    () => setActivityModalOpen(false),
    [setActivityModalOpen]
  );

  const cartLines = props.cartLines || EMPTY_ARRAY;
  const stageOptions = props.stageOptions || EMPTY_ARRAY;
  const formatMoney = props.formatMoney || defaultFormatMoney;

  const showAll = activeStep === null || activeStep === "";

  return (
    <div className={classes.detailPanelRoot}>
      {showAll && (
        <LeadDetailSummary
          classes={classes}
          form={form}
          users={props.users}
          cartLines={cartLines}
          formatMoney={formatMoney}
          cartTotal={props.cartTotal || 0}
          pipelineTimeLabel={props.pipelineTimeLabel || "—"}
          productService={props.productService}
          stageOptions={stageOptions}
          setForm={props.setForm}
          viewOnly={false}
        />
      )}

      <Box className={classes.detailWizardCompact}>
        <LeadCreateWizardForm {...wizardProps} detailMode />
      </Box>

      <Box className={classes.detailPanelFooterActions}>
        <Button
          size="small"
          variant="text"
          className={classes.linkActionBtn}
          startIcon={<EventNoteOutlinedIcon />}
          onClick={handleOpenActivity}
        >
          Criar atividade
        </Button>
      </Box>

      {activityModalOpen && (
        <CreateActivityModal
          open={activityModalOpen}
          onClose={handleCloseActivity}
          activity={activityData}
          onSave={handleCloseActivity}
        />
      )}
    </div>
  );
}
