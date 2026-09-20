# Flo status

Whether Flo is answering, checked every five minutes from GitHub, away from the hosting Flo itself runs on. The page is at [status.flo.now](https://status.flo.now).

`scripts/probe.mjs` asks each public surface for its health and writes `status.json`, keeping ninety days of history. The workflow commits the result and publishes the page.

To add a service, add it to the list at the top of `scripts/probe.mjs`. Nothing here holds a secret: every address it checks is public.
