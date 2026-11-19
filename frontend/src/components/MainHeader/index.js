import React from "react";

import { makeStyles } from "@material-ui/core/styles";
import SidebarToggleButton from "../../layout/SidebarToggleButton";

const useStyles = makeStyles(theme => ({
	contactsHeader: {
		display: "flex",
		alignItems: "center",
		flexWrap: "wrap",
		gap: 8,
		minWidth: 0,
		padding: "0px 6px 6px 6px",
		"& > .MuiTypography-h5": {
			marginBottom: 0,
		},
	},
}));

const MainHeader = ({ children }) => {
	const classes = useStyles();

	return (
		<div className={classes.contactsHeader}>
			<SidebarToggleButton />
			{children}
		</div>
	);
};

export default MainHeader;
