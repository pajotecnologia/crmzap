import React from "react";
import { makeStyles } from "@material-ui/core/styles";

const useStyles = makeStyles((theme) => ({
  MainHeaderButtonsWrapper: {
    flex: "0 1 auto",
    minWidth: 0,
    maxWidth: "100%",
    marginLeft: "auto",
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    alignItems: "center",
    "& > *": {
      margin: theme.spacing(0.5),
    },
  },
}));

/** Agrupa botões do cabeçalho da página (ajuda fica na navbar interna ou na topbar global). */
const MainHeaderButtonsWrapper = ({ children }) => {
  const classes = useStyles();
  return <div className={classes.MainHeaderButtonsWrapper}>{children}</div>;
};

export default MainHeaderButtonsWrapper;
