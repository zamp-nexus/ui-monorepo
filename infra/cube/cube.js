const jwt = require('jsonwebtoken');

// Phase 1: auth machinery only. Every token still mints the same appId
// ("system") until Phase 2 wires per-tenant/per-Data-Connection claims and
// the Connector-backed dynamic cube generator, so this is a behavior-neutral
// change for the existing demo warehouse scenarios.
module.exports = {
  scheduledRefreshTimer: false,

  checkAuth: async (req, authorization) => {
    // Raising here returns HTTP 500 on self-hosted Cube Core (403 is a Cube
    // Cloud-only behavior) — verified in the Phase 0 spike. No workaround:
    // that would mean re-implementing Cube's own auth-rejection response
    // shape. An auth rejection and an internal Cube error are therefore
    // indistinguishable by status code alone; callers must not assume 500
    // always means "Cube crashed".
    const claims = jwt.verify(authorization, process.env.CUBEJS_API_SECRET, {
      algorithms: ['HS256'],
    });
    req.securityContext = claims;
  },

  contextToAppId: ({ securityContext }) =>
    securityContext && securityContext.dataConnectionId
      ? `CUBE_APP_${securityContext.tenantId}_${securityContext.dataConnectionId}_${securityContext.relationFingerprint}`
      : 'CUBE_APP_system',

  driverFactory: ({ dataSource }) => {
    if (dataSource === 'connector') {
      // Phase 2 wires this to a per-Data-Connection ClickHouse config
      // resolved via the internal model endpoint. Not reachable in Phase 1:
      // no cube declares `dataSource: 'connector'` yet.
      throw new Error('connector dataSource is not implemented until Phase 2');
    }
    return {
      type: 'postgres',
      database: process.env.CUBEJS_DB_NAME,
      host: process.env.CUBEJS_DB_HOST,
      port: process.env.CUBEJS_DB_PORT,
      user: process.env.CUBEJS_DB_USER,
      password: process.env.CUBEJS_DB_PASS,
    };
  },
};
