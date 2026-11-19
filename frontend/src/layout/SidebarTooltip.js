import { withStyles } from "@material-ui/core/styles";
import Tooltip from "@material-ui/core/Tooltip";
import { getSidebarTokens } from "./sidebarTokens";

const SidebarTooltip = withStyles((theme) => {
  const t = getSidebarTokens(theme);
  return {
    tooltip: {
      backgroundColor: t.tooltipBg,
      color: t.tooltipText,
      fontSize: 12,
      fontWeight: 500,
      letterSpacing: "-0.005em",
      padding: "5px 9px",
      borderRadius: 7,
      boxShadow: "0 6px 16px -6px rgba(15, 23, 42, 0.35)",
    },
    tooltipPlacementRight: {
      margin: "0 10px",
    },
  };
})(Tooltip);

SidebarTooltip.defaultProps = {
  enterDelay: 120,
  arrow: false,
};

export default SidebarTooltip;
