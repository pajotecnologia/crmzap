import React from "react";
import { Redirect, Switch, Route, useRouteMatch } from "react-router-dom";
import ConnectionsHub from "./ConnectionsHub";
import ConnectionsTypePage from "./ConnectionsTypePage";
import ConnectionsChannelSetupPage from "./ConnectionsChannelSetupPage";
import GoogleOAuthCallbackPage from "./GoogleOAuthCallbackPage";
import GithubOAuthCallbackPage from "./GithubOAuthCallbackPage";
import GithubOAuthConnectPage from "./GithubOAuthConnectPage";

/**
 * Hub → administrar (lista) direto; criar/editar WhatsApp em sub-rota.
 */
export default function Connections() {
  const { path } = useRouteMatch();

  return (
    <Switch>
      <Route exact path={path} component={ConnectionsHub} />
      <Route
        path={`${path}/google-oauth/callback`}
        component={GoogleOAuthCallbackPage}
      />
      <Route
        path={`${path}/github-oauth/callback`}
        component={GithubOAuthCallbackPage}
      />
      <Route
        path={`${path}/github/oauth/start`}
        component={GithubOAuthConnectPage}
      />
      <Route
        path={`${path}/:integrationKey/new`}
        component={ConnectionsChannelSetupPage}
      />
      <Route
        path={`${path}/:integrationKey/edit/:whatsAppId`}
        component={ConnectionsChannelSetupPage}
      />
      <Route
        path={`${path}/:integrationKey/manage`}
        component={ConnectionsTypePage}
      />
      <Route
        path={`${path}/:integrationKey`}
        render={({ match }) => (
          <Redirect to={`${path}/${match.params.integrationKey}/manage`} />
        )}
      />
    </Switch>
  );
}
