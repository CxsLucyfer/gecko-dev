/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  FX_OAUTH_CLIENT_ID,
  SCOPE_PROFILE,
  SCOPE_PROFILE_WRITE,
  SCOPE_OLD_SYNC,
} from "resource://gre/modules/FxAccountsCommon.sys.mjs";

const VALID_SCOPES = [SCOPE_PROFILE, SCOPE_PROFILE_WRITE, SCOPE_OLD_SYNC];

/**
 * Handles all logic and state related to initializing, and completing OAuth flows
 * with FxA
 * It's possible to start multiple OAuth flow, but only one can be completed, and once one flow is completed
 * all the other in-flight flows will be concluded, and attempting to complete those flows will result in errors.
 */
export class FxAccountsOAuth {
  #flow;
  constructor() {
    this.#flow = {};
  }

  /**
   * Stores a flow in-memory
   * @param { string } state: A base-64 URL-safe string represnting a random value created at the start of the flow
   * @param { Object } value: The data needed to complete a flow, once the oauth code is available.
   * in practice, `value` is:
   *  - `verifier`: A base=64 URL-safe string representing the PKCE code verifier
   *  - `key`: The private key need to decrypt the JWE we recieve from the auth server
   *  - `requestedScopes`: The scopes the caller requested, meant to be compared against the scopes the server authorized
   */
  addFlow(state, value) {
    this.#flow[state] = value;
  }

  /**
   * Clears all started flows
   */
  clearAllFlows() {
    this.#flow = {};
  }

  /*
   * Gets a stored flow
   * @param { string } state: The base-64 URL-safe state string that was created at the start of the flow
   * @returns { Object }: The values initially stored when startign th eoauth flow
   * in practice, the return value is:
   *  - `verifier`: A base=64 URL-safe string representing the PKCE code verifier
   *  - `key`: The private key need to decrypt the JWE we recieve from the auth server
   *  - ``requestedScopes`: The scopes the caller requested, meant to be compared against the scopes the server authorized
   */
  getFlow(state) {
    return this.#flow[state];
  }

  /**
   * Begins an OAuth flow, to be completed with a an OAuth code and state.
   *
   * This function stores needed information to complete the flow. You must call `completeOAuthFlow`
   * on the same instance of `FxAccountsOAuth`, otherwise the completing of the oauth flow will fail.
   *
   * @param { string[] } scopes: The OAuth scopes the client should request from FxA
   *
   * @returns { Object }: Returns an object representing the query parameters that should be
   *     added to the FxA authorization URL to initialize an oAuth flow.
   *     In practice, the query parameters are:
   *       - `client_id`: The OAuth client ID for Firefox Desktop
   *       - `scope`: The scopes given by the caller, space seperated
   *       - `action`: This will always be `email`
   *       - `response_type`: This will always be `code`
   *       - `access_type`: This will always be `offline`
   *       - `state`: A URL-safe base-64 string randomly generated
   *       - `code_challenge`: A URL-safe base-64 string representing the PKCE challenge
   *       - `code_challenge_method`: This will always be `S256`
   *          For more informatio about PKCE, read https://datatracker.ietf.org/doc/html/rfc7636
   *       - `keys_jwk`: A URL-safe base-64 representing a JWK to be used as a public key by the server
   *          to generate a JWE
   */
  async beginOAuthFlow(scopes) {
    if (
      !Array.isArray(scopes) &&
      scopes.some(scope => !VALID_SCOPES.contains(scope))
    ) {
      throw new Error("Invalid scopes");
    }
    const queryParams = {
      client_id: FX_OAUTH_CLIENT_ID,
      action: "email",
      response_type: "code",
      access_type: "offline",
      scope: scopes.join(" "),
    };

    // Generate a random, 16 byte value to represent a state that we verify
    // once we complete the oauth flow, to ensure that we only conclude
    // an oauth flow that we started
    const state = new Uint8Array(16);
    crypto.getRandomValues(state);
    const stateB64 = ChromeUtils.base64URLEncode(state, { pad: false });
    queryParams.state = stateB64;

    // Generate a 43 byte code verifier for PKCE, in accordance with
    // https://datatracker.ietf.org/doc/html/rfc7636#section-7.1 which recommends a
    // 43-octet URL safe string
    const codeVerifier = new Uint8Array(43);
    crypto.getRandomValues(codeVerifier);
    const codeVerifierB64 = ChromeUtils.base64URLEncode(codeVerifier, {
      pad: false,
    });
    const challenge = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(codeVerifierB64)
    );
    const challengeB64 = ChromeUtils.base64URLEncode(challenge, { pad: false });
    queryParams.code_challenge = challengeB64;
    queryParams.code_challenge_method = "S256";

    // Generate a public, private key pair to be used during the oauth flow
    // to encrypt scoped-keys as they roundtrip through the auth server
    const ECDH_KEY = { name: "ECDH", namedCurve: "P-256" };
    const key = await crypto.subtle.generateKey(ECDH_KEY, true, ["deriveKey"]);
    const publicKey = await crypto.subtle.exportKey("jwk", key.publicKey);
    const privateKey = key.privateKey;

    // We encode the public key as URL-safe base64 to be included in the query parameters
    const encodedPublicKey = ChromeUtils.base64URLEncode(
      new TextEncoder().encode(JSON.stringify(publicKey)),
      { pad: false }
    );
    queryParams.keys_jwk = encodedPublicKey;

    // We store the state in-memory, to verify once the oauth flow is completed
    this.addFlow(stateB64, {
      key: privateKey,
      verifier: codeVerifierB64,
      requestedScopes: scopes,
    });
    return queryParams;
  }
}
