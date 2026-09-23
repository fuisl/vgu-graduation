# Web

Next.js public site for the GRAD ’26 landing teaser, invitation preview, and future guest flows.

The root route serves the November teaser. `/guest/prototype` previews a draggable 3D guest badge using the landing background. It uses React Three Fiber, Rapier joints, MeshLine, and a rendered card texture; reduced motion and unavailable WebGL show a static badge. It has no guest data or sign-in behavior. `/invite/demo` remains a separate route. `/docs` and its child paths are rewritten to the docs app. Set `DOCS_ORIGIN` to the docs deployment origin when building the web app for production; local development defaults to `http://localhost:3001`. For a local production build, use `DOCS_ORIGIN=http://localhost:3001 pnpm build` from the repository root while the docs app runs on port 3001.
