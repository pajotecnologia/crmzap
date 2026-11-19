import React, { forwardRef, useCallback, useLayoutEffect, useRef } from "react";
import clsx from "clsx";
import Table from "@material-ui/core/Table";
import { useTheme } from "@material-ui/core/styles";
import { getUiTokens } from "../../styles/uiTokens";
import "./responsiveTable.css";

const ACTIONS_HEADER = /^(a[çc][õo]es|actions?|op[çc][õo]es|options?|gerenciar|editar)$/i;
const PRIMARY_HEADER = /^(nome|name|t[íi]tulo|title|lead|assunto|usu[áa]rio|descri[çc][ãa]o)\b/i;
const SKIP_HEADER = /^(id|#|c[óo]d\.?|c[óo]digo|foto|avatar|imagem|status|ativo|selecionar)$/i;
const MORE_LABEL = (n) => `Ver todos os campos (${n})`;
const LESS_LABEL = "Mostrar menos";

const cellText = (el) => (el.textContent || "").replace(/\s+/g, " ").trim();

const hasControls = (el) =>
  Boolean(el.querySelector("button, a[href], [role='button'], .MuiIconButton-root, .MuiSwitch-root"));

const isCheckboxCell = (el) =>
  el.classList.contains("MuiTableCell-paddingCheckbox") ||
  (Boolean(el.querySelector("input[type='checkbox']")) && !cellText(el));

function readHeaderLabels(table) {
  const head = table.tHead;
  if (!head || !head.rows.length) return [];
  const row = head.rows[head.rows.length - 1];
  const labels = [];
  Array.from(row.cells).forEach((cell) => {
    const span = Math.max(1, cell.colSpan || 1);
    const label = cellText(cell);
    for (let i = 0; i < span; i += 1) labels.push(label);
  });
  return labels;
}

/** Campo de destaque do card: coluna de nome/título; senão a primeira coluna descritiva. */
function pickPrimaryIndex(labels, preferred) {
  if (typeof preferred === "number") return preferred;
  const candidates = labels
    .map((label, index) => ({ label, index }))
    .filter(({ label }) => label && !SKIP_HEADER.test(label) && !ACTIONS_HEADER.test(label));
  const byName = candidates.find(({ label }) => PRIMARY_HEADER.test(label));
  if (byName) return byName.index;
  return candidates.length ? candidates[0].index : -1;
}

/** Rotula as células do corpo com o cabeçalho da coluna para o layout em cards no celular. */
function decorateTable(table, { primaryColumn, collapseAfter }) {
  const labels = readHeaderLabels(table);
  const columns = labels.length;
  const primaryIndex = pickPrimaryIndex(labels, primaryColumn);

  Array.from(table.tBodies).forEach((body) => {
    Array.from(body.rows).forEach((row) => {
      if (row.hasAttribute("data-vb-skip")) return;
      let col = 0;
      let fieldCount = 0;
      const fields = [];
      let primarySet = false;
      const isSkeleton = Boolean(row.querySelector(".MuiSkeleton-root")) && !cellText(row);
      row.toggleAttribute("data-vb-skeleton", isSkeleton);

      Array.from(row.cells).forEach((cell) => {
        if (cell.hasAttribute("data-vb-more-cell")) return;
        const span = Math.max(1, cell.colSpan || 1);
        const label = labels[col] || "";
        const spansAll = (columns > 1 && span >= columns) || (row.cells.length === 1 && span > 1);
        cell.removeAttribute("data-vb-extra");

        let kind = "field";
        if (spansAll) kind = "span";
        else if (isCheckboxCell(cell)) kind = "check";
        else if ((ACTIONS_HEADER.test(label) || !label) && hasControls(cell) && cellText(cell).length < 3) kind = "actions";
        else if (!cellText(cell) && !cell.querySelector("img, svg, input, .MuiChip-root, .MuiAvatar-root")) kind = "empty";

        if (kind === "field" && !primarySet && (col === primaryIndex || (primaryIndex < 0 && fieldCount === 0))) {
          kind = "primary";
          primarySet = true;
        }

        cell.setAttribute("data-vb-cell", kind);
        if (label && kind === "field") cell.setAttribute("data-label", label);
        else cell.removeAttribute("data-label");

        if (kind === "field") {
          fieldCount += 1;
          fields.push(cell);
        }
        col += span;
      });

      const limit = Math.max(1, collapseAfter);
      const extra = fields.length > limit ? fields.slice(limit) : [];
      extra.forEach((cell) => cell.setAttribute("data-vb-extra", ""));
      let moreCell = row.querySelector("[data-vb-more-cell]");
      if (extra.length) {
        row.setAttribute("data-vb-collapsible", "");
        if (!moreCell) {
          moreCell = document.createElement("td");
          moreCell.setAttribute("data-vb-more-cell", "");
          moreCell.className = "MuiTableCell-root MuiTableCell-body";
          const btn = document.createElement("button");
          btn.type = "button";
          btn.setAttribute("data-vb-more", "");
          moreCell.appendChild(btn);
          row.appendChild(moreCell);
        }
        const btn = moreCell.firstChild;
        const open = row.hasAttribute("data-vb-open");
        const text = open ? LESS_LABEL : MORE_LABEL(fields.length + 1);
        if (btn.textContent !== text) btn.textContent = text;
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      } else {
        row.removeAttribute("data-vb-collapsible");
        row.removeAttribute("data-vb-open");
        if (moreCell) moreCell.remove();
      }
    });
  });
}

/**
 * Substituto direto do Table do MUI: mesma API no desktop; no celular (< 600px)
 * cada linha vira um card com rótulos vindos do cabeçalho, ações sempre visíveis
 * e "Ver todos os campos" quando o registro tem muitas colunas.
 * Use mobileCards={false} para manter a tabela (com rolagem horizontal interna).
 */
const ResponsiveTable = forwardRef(function ResponsiveTable(
  { className, style, mobileCards = true, primaryColumn, collapseAfter = 5, children, ...props },
  ref
) {
  const theme = useTheme();
  const dark = theme.palette.type === "dark";
  const ui = getUiTokens(theme);
  const cardVars = {
    "--vb-ui-border": ui.border,
    "--vb-ui-divider": ui.divider,
    "--vb-ui-hover-bg": ui.hoverBg,
    "--vb-ui-selected-bg": ui.selectedBg,
    "--vb-list-surface": theme.palette.background.paper,
    "--vb-list-text": theme.palette.text.primary,
    "--vb-list-muted": dark ? "rgba(255, 255, 255, 0.58)" : "#71717a",
    "--vb-list-accent": dark ? theme.palette.primary.light : theme.palette.primary.main,
    "--vb-list-selected-border": dark ? "rgba(147, 197, 253, 0.5)" : "rgba(37, 99, 235, 0.45)",
  };
  const innerRef = useRef(null);
  const optsRef = useRef({ primaryColumn, collapseAfter });
  optsRef.current = { primaryColumn, collapseAfter };

  const setRefs = useCallback(
    (node) => {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref]
  );

  useLayoutEffect(() => {
    const table = innerRef.current;
    if (!table || !mobileCards) return undefined;
    let frame = null;
    const run = () => {
      frame = null;
      decorateTable(table, optsRef.current);
    };
    run();
    const observer = new MutationObserver(() => {
      if (frame == null) frame = window.requestAnimationFrame(run);
    });
    observer.observe(table, { childList: true, subtree: true, characterData: true });

    const onClick = (event) => {
      const btn = event.target.closest && event.target.closest("[data-vb-more]");
      if (!btn || !table.contains(btn)) return;
      event.stopPropagation();
      event.preventDefault();
      const row = btn.closest("tr");
      if (!row) return;
      row.toggleAttribute("data-vb-open");
      decorateTable(table, optsRef.current);
    };
    table.addEventListener("click", onClick, true);

    return () => {
      observer.disconnect();
      table.removeEventListener("click", onClick, true);
      if (frame != null) window.cancelAnimationFrame(frame);
      table.querySelectorAll("[data-vb-more-cell]").forEach((el) => el.remove());
    };
  }, [mobileCards]);

  return (
    <Table
      ref={setRefs}
      className={clsx("vb-rtable", mobileCards && "vb-rtable--cards", className)}
      style={{ ...cardVars, ...style }}
      {...props}
    >
      {children}
    </Table>
  );
});

export default ResponsiveTable;
