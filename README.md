# Unofficial Auth0 client for Svelte-Kit

A thin wrapper around the [auth0/nextjs-auth0 SDK](https://github.com/auth0/nextjs-auth0/), to adapt it to use with [Svelte-Kit](https://kit.svelte.dev/).

**CAUTION:** Svelte-Kit is still in beta. It's possible things might break if Svelte-Kit's API changes drastically in the future.

## Installing

At the moment, this package does not specify any dependencies in its `package.json`. **You must include a dependency on `nextjs-auth0` yourself**, as well as the two dependencies (`nextjs` and `react`) that `nextjs-auth0` depends on. E.g.,

```plaintext
yarn add -D @auth0/nextjs-auth0 next react
```

The `next` and `react` dependencies are required by nextjs-auth0; you will need to ensure that they are copied server-side, as currently (2021-01-22) the `@sveltejs/adapter-node` adapter does not copy `node_modules` into the build folder. This will make your server-side code large, but nothing from next.js or react will be visible client-side so your client bundle size will still be small.

## Usage

Once you've installed `sveltekit-auth0-unofficial`, start by setting up your Auth0 config. The recommended way to do this is to use environment variables; a complete list of environment variables available is at [https://auth0.github.io/nextjs-auth0/modules/config.html](https://auth0.github.io/nextjs-auth0/modules/config.html). Alternately, you could keep your config secrets in a file that you don't check in to git. For example, you could add `secrets.js` to your `.gitignore` file and then write something like this:

```ts
// src/lib/auth0.ts
import { initAuth0 } from '@auth0/nextjs-auth0';
import { AUTH0_SECRET, AUTH0_CLIENT_SECRET } from './secrets';

// In addition to environment variables, can also put Auth0 settings here
const myAuth0Config = {
    // Required settings (must specify either here or in environment variables)
    secret: AUTH0_SECRET,  // Should be a randomly-generated string of at *least* 32 characters.
    clientId: 'my_auth0_client_id',
    clientSecret: AUTH0_CLIENT_SECRET
    // In this example, AUTH0_BASE_URL is passed in via an environment variable and not specified here
    issuerBaseUrl: 'https://example.us.auth0.com',

    // Optional settings
    enableTelemetry: false  // Don't send Auth0 the library version and Node version you're running
    routes: {
        postLogoutRedirect: '/goodbye',
        // Can also specify login and callback routes here; default is /api/auth/login and /api/auth/callback
    }
}

// Environment variables and custom config will be merged in initAuth0, and its result should be your module's default export
export default initAuth0(myAuth0Config);
```

Then either follow the quick-start instructions below, or the manual setup instructions further down.

### Quick-start

Simply create a file named `src/routes/api/auth/[auth0].ts` and use the `handleAuth()` function to handle authentication for you:

```ts
// src/routes/api/auth/[auth0].ts
import auth0 from '$lib/auth0';

export function get(req) {
    return auth0.handleAuth(req);
}
```

Note that the name of the route parameter `must` be "auth0". The `handleAuth()` function will automatically handle routes named `login`, `logout`, `callback`, and `me`. If you want to use other names for those routes, follow the manual setup instructions instead.

You'll also want to put the following into `src/hooks.ts`:

```ts
import type { Handle } from '@sveltejs/kit';
import auth0 from '$lib/auth0';

export const handle: Handle = async ({ request, resolve }) => {
  const auth0Session = auth0.getSession(request);
  request.locals.auth0Session = auth0Session;

  const response = await resolve(request);
  // You could modify the response here, e.g. by adding custom headers
  return response;
};

export function getSession(request) {
  const { auth0Session } = request.locals;
  const isAuthenticated = !!auth0Session?.user;
  const user = auth0Session?.user || {};
  return { user, isAuthenticated }
}
```

Now you'll have access to the `user` object and `isAuthenticated` boolean in the `export load({ session })` functions on your pages.

### Manual setup

Instead of letting `handleAuth` define the routes for you, you can use individual functions for each route. For example, let's say you wanted your auth routes to be at the URLs `/login`, `/logout`, `/api/callback`, and `/api/me.json`. You'd first need to define those routes in your Auth0 config:

```ts
// src/lib/auth0.ts
import { initAuth0 } from '@auth0/nextjs-auth0';

const myAuth0Config = {
  routes: {
      // Must specify login and callback routes if they differ from the default
      login: '/login',
      callback: '/api/callback',
      // Don't need to specify logout and profile routes
  }
}

// Environment variables and custom config will be merged in initAuth0, and its result should be your module's default export
export default initAuth0(myAuth0Config);
```

And then you could write your routes as follows:

```ts
// src/routes/login.ts
import auth0 from '$lib/auth0';

export function get(req) {
  return auth0.handleLogin(req);
}
```

```ts
// src/routes/logout.ts
import auth0 from '$lib/auth0';

export function get(req) {
  return auth0.handleLogout(req);
}
```

```ts
// src/routes/api/callback.js
import auth0 from '$lib/auth0';

export function get(req) {
  return auth0.handleCallback(req);
}
```

```ts
// src/routes/api/me.json.js
import auth0 from '$lib/auth0';

export function get(req) {
  return auth0.handleProfile(req);
}
```

The Auth0 functions from `nextjs-auth0` all take the same optional parameters documented in https://auth0.github.io/nextjs-auth0/. For example, to force a user profile refresh, call `auth0.handleProfile(req, { refetch: true });`. Or if you want to add custom data to the Auth0 session cookie, or remove data you don't want stored in the cookie, you can specify an `afterCallback` function in the callback handler, like so:

```ts
// src/routes/api/auth/callback.js
import auth0 from '$lib/auth0';

const afterCallback = (req, res, session, state) => {
  session.user.customProperty = 'foo';
  delete session.refreshToken;
  return session;
};

export function get(req) {
  return auth0.handleCallback(req, { afterCallback });
}
```

**NOTE:** The `req` and `res` objects your `afterCallback` function will receive are not real request and response objects. The https://auth0.github.io/nextjs-auth0/ documentation will list their type as NextApiRequest and NextApiResponse, but in fact they are minimal wrapper classes created by the `sveltekit-auth0-unofficial` library. These classes wrap around the request data that Svelte-Kit provides to your server-side route code, and simulate the NextApiRequest and NextApiResponse API just enough for `nextjs-auth0` to do its work. Do not be surprised if some basic functionality is missing from the `req` and `res` objects that your `afterCallback` function receives. This applies to all the callbacks you might pass to a `nextjs-auth0` function: the `req` and `res` objects your callback receives will have minimal functionality.

To return to a specific page after logging in, you can use a `returnTo` parameter.

```ts
// src/routes/login.js
import auth0 from '../auth0';

export function get(svelteReq) {
    const returnTo = svelteReq.query.get('returnTo');
    return auth0.handleLogin(svelteReq, { returnTo });
}
```

## Helper functions

TODO: Document `withApiAuthRequired` and `withPageAuthRequired`. Example of the latter below:

```html
<script context="module">
	import { browser, dev } from '$app/env';
    import auth0 from '$lib/auth0';

    export const load = auth0.withPageAuthRequired({ load: async function load(params) {
        return { props: { innerLoadTest: "Yep, inner load got called" }};
    }});
</script>

<script lang="ts">
    export let innerLoadTest: string = "Nope, inner load was NOT called";
    export let user: any;
</script>

<svelte:head>
	<title>Profile</title>
</svelte:head>

<div class="content">
	<h1>Your profile</h1>

    <p>
        Hello, {user.given_name} {user.family_name}. <br/>
        Here's the profile picture you chose:
    </p>

    <p>
        <!-- svelte-ignore a11y-img-redundant-alt -->
        <img src={user.picture} alt='Profile image'>
    </p>

<!-- 
	<p>
		Here's what we know about you:
	</p>

	<pre>{JSON.stringify(user || 'nothing, zip, nada — your profile was not loaded')}</pre>
-->

	<p>
		You can <a href="/api/auth/logout">log out</a> if you want.
	</p>

    <p>
		{innerLoadTest}
	</p>
</div>
```