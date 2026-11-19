import React from "react";
import { useIsDarkMode } from "../../hooks/useMediaQueryBrain";
import { SiGithub, SiGooglesheets } from "react-icons/si";
import { getBrainMcpById } from "../../config/brainMcpCatalog";
import {
  FigmaBrandIcon,
  GoogleDriveBrandIcon,
  GoogleCalendarBrandIcon,
} from "./BrainMcpBrandIcons";

const MONO_ICONS = {
  google_sheets: SiGooglesheets,
  github: SiGithub,
};

function resolveIconColor(id, item, isDark) {
  if (!item) return undefined;
  if (isDark && id === "github") {
    return "#ffffff";
  }
  return item.accent;
}

export default function BrainMcpIcon({ id, size = 18, className, style }) {
  const isDark = useIsDarkMode();
  const item = getBrainMcpById(id);

  if (id === "google_drive") {
    return (
      <GoogleDriveBrandIcon
        size={size}
        className={className}
        style={{ flexShrink: 0, ...style }}
      />
    );
  }

  if (id === "google_calendar") {
    return (
      <GoogleCalendarBrandIcon
        size={size}
        className={className}
        style={{ flexShrink: 0, ...style }}
      />
    );
  }

  if (id === "figma") {
    return (
      <FigmaBrandIcon
        size={size}
        className={className}
        style={{ flexShrink: 0, ...style }}
      />
    );
  }

  const Icon = MONO_ICONS[id];
  if (!Icon) return null;

  return (
    <Icon
      size={size}
      className={className}
      style={{ color: resolveIconColor(id, item, isDark), flexShrink: 0, ...style }}
      aria-hidden
    />
  );
}
