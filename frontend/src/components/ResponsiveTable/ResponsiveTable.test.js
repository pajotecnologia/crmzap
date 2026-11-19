import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { TableBody, TableCell, TableHead, TableRow, IconButton } from "@material-ui/core";
import ResponsiveTable from "./index";

let container;
function mount(ui) {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(ui, container);
  });
  return container;
}

afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  document.body.innerHTML = "";
});

const cols = ["ID", "Nome", "Email", "Perfil", "Fila", "Criado em", "Status", "Ações"];

function Sample({ rows = 1, onRowClick }) {
  return (
    <ResponsiveTable>
      <TableHead>
        <TableRow>
          {cols.map((c) => (
            <TableCell key={c}>{c}</TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {rows === 0 ? (
          <TableRow>
            <TableCell colSpan={cols.length}>Nenhum registro</TableCell>
          </TableRow>
        ) : (
          Array.from({ length: rows }, (_, i) => (
            <TableRow key={i} onClick={onRowClick}>
              <TableCell>{i + 1}</TableCell>
              <TableCell>Maria {i}</TableCell>
              <TableCell>maria@x.com</TableCell>
              <TableCell>admin</TableCell>
              <TableCell>Vendas</TableCell>
              <TableCell>01/01/2026</TableCell>
              <TableCell>Ativo</TableCell>
              <TableCell>
                <IconButton aria-label="Editar">
                  <span />
                </IconButton>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </ResponsiveTable>
  );
}

describe("ResponsiveTable", () => {
  it("rotula as células com o cabeçalho e escolhe o nome como campo principal", () => {
    const view = mount(<Sample />);
    const cells = view.querySelectorAll("tbody tr td");
    expect(cells[0].getAttribute("data-label")).toBe("ID");
    expect(cells[1].getAttribute("data-vb-cell")).toBe("primary");
    expect(cells[1].hasAttribute("data-label")).toBe(false);
    expect(cells[2].getAttribute("data-label")).toBe("Email");
    expect(cells[7].getAttribute("data-vb-cell")).toBe("actions");
  });

  it("linha de estado que ocupa a tabela inteira não recebe rótulo", () => {
    const view = mount(<Sample rows={0} />);
    const cell = view.querySelector("tbody tr td");
    expect(cell.getAttribute("data-vb-cell")).toBe("span");
    expect(cell.hasAttribute("data-label")).toBe(false);
  });

  it("registros com muitos campos ganham 'Ver todos os campos' sem disparar o clique da linha", () => {
    const onRowClick = jest.fn();
    const view = mount(<Sample onRowClick={onRowClick} />);
    const row = view.querySelector("tbody tr");
    expect(row.hasAttribute("data-vb-collapsible")).toBe(true);
    expect(row.querySelectorAll("[data-vb-extra]").length).toBeGreaterThan(0);
    const more = row.querySelector("[data-vb-more]");
    expect(more.textContent).toMatch(/Ver todos os campos/);
    act(() => {
      more.click();
    });
    expect(row.hasAttribute("data-vb-open")).toBe(true);
    expect(more.textContent).toBe("Mostrar menos");
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("mobileCards={false} mantém a tabela sem decoração", () => {
    const view = mount(
      <ResponsiveTable mobileCards={false}>
        <TableBody>
          <TableRow>
            <TableCell>x</TableCell>
          </TableRow>
        </TableBody>
      </ResponsiveTable>
    );
    expect(view.querySelector("table").classList.contains("vb-rtable--cards")).toBe(false);
    expect(view.querySelector("td").hasAttribute("data-vb-cell")).toBe(false);
  });
});
