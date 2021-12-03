import { initAuth0 as origInitAuth0 } from "@auth0/nextjs-auth0";
import { auth0Wrapper, auth0WrapperJson } from "./wrappers";
import type {
  Request as SvelteRequest,
  RequestHandler,
  Load,
  LoadInput,
  LoadOutput,
} from "@sveltejs/kit";

export function initAuth0(config: { [key: string]: any }): any {
  const auth0 = origInitAuth0(config);
  const getSession = auth0WrapperJson((req, res) => auth0.getSession(req, res));
  const loginUrl = config?.routes?.login || "/api/auth/login";
  return {
    getSession: getSession,
    getAccessToken: auth0WrapperJson((req, res, auth0FnOptions) =>
      auth0.getAccessToken(req, res, auth0FnOptions)
    ),
    handleLogin: auth0Wrapper((req, res, auth0FnOptions) =>
      auth0.handleLogin(req, res, auth0FnOptions)
    ),
    handleLogout: auth0Wrapper((req, res, auth0FnOptions) =>
      auth0.handleLogout(req, res, auth0FnOptions)
    ),
    handleCallback: auth0Wrapper((req, res, auth0FnOptions) =>
      auth0.handleCallback(req, res, auth0FnOptions)
    ),
    handleProfile: auth0Wrapper((req, res, auth0FnOptions) =>
      auth0.handleProfile(req, res, auth0FnOptions)
    ),

    handleAuth(svelteReq: SvelteRequest) {
      const param = svelteReq.params.auth0;
      const route = Array.isArray(param) ? param[0] : param;
      switch (route) {
        case "login":
          return this.handleLogin(svelteReq);
        case "logout":
          return this.handleLogout(svelteReq);
        case "callback":
          return this.handleCallback(svelteReq);
        case "me":
          return this.handleProfile(svelteReq);
        default:
          return; // Fall through to other handlers
      }
    },

    withPageAuthRequired(opts?: { load?: Load; returnTo?: string }) {
      return (loadParams: LoadInput) => {
        const isAuthenticated = loadParams.session?.isAuthenticated;
        if (isAuthenticated) {
          const user = loadParams.session?.user;
          if (opts?.load && typeof opts?.load === "function") {
            const loadResult = opts?.load(loadParams);
            // Handle either promises or non-promises without making this function async
            if (loadResult && typeof (loadResult as any).then === "function") {
              // Async load() function
              return (loadResult as Promise<LoadOutput>).then((loadResult) => {
                if (loadResult) {
                  return {
                    ...loadResult,
                    props: { ...loadResult.props, user, isAuthenticated },
                  };
                } else {
                  // If user's load() function returned nothing, they intend to fall through, so we shouldn't populate user props
                  return loadResult;
                }
              });
            } else if (loadResult) {
              // Synchronous load()
              return {
                ...loadResult,
                props: {
                  ...(loadResult as LoadOutput).props,
                  user,
                  isAuthenticated,
                },
              };
            } else {
              // If user's load() function returned nothing, they intend to fall through, so we shouldn't populate user props
              return loadResult;
            }
          } else {
            // No load function passed, so just populate user prop
            return { props: { user, isAuthenticated } };
          }
        } else {
          const queryStr = loadParams.page.query.toString();
          const returnUrl =
            opts?.returnTo ||
            `${loadParams.page.path}${queryStr ? "?" + queryStr : ""}`;
          return {
            status: 307,
            redirect: `${loginUrl}?returnTo=${returnUrl}`,
          };
        }
      };
    },

    withApiAuthRequired: (
      route: RequestHandler,
      opts: {
        unauthHandler?: RequestHandler;
        unauthJson?: { [key: string]: any };
      } = {}
    ): RequestHandler => {
      return (svelteReq) => {
        if (
          svelteReq.locals.isAuthenticated &&
          svelteReq.locals.user &&
          svelteReq.locals.auth0Session
        ) {
          // Already populated in hooks.ts handle() function, so we don't need to do any work here
          return route(svelteReq);
        }
        const session = getSession(svelteReq);
        if (session && session.user) {
          svelteReq.locals.auth0Session = session;
          svelteReq.locals.user = {
            ...svelteReq.locals.user,
            ...session.user,
          };
          svelteReq.locals.isAuthenticated = true;
          return route(svelteReq);
        } else if (
          opts.unauthHandler &&
          typeof opts.unauthHandler === "function"
        ) {
          return opts.unauthHandler(svelteReq);
        } else {
          return {
            status: 401,
            body: opts.unauthJson || {
              error: "not_authenticated",
              description:
                "The user does not have an active session or is not authenticated",
            },
          };
        }
      };
    },
  };
}
