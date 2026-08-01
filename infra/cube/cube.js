const jwt = require('jsonwebtoken');

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

  // Keyed on the relation fingerprint, not just tenant/Data Connection: a
  // Relation confirm/reject/revoke mutates its state under the same
  // CatalogVersion id, so the version id alone would not invalidate a
  // stale compiled schema. The fingerprint is minted into the JWT by
  // apps/api at query time, computed fresh from the Connector's current
  // Join Graph — see connector_model.relation_fingerprint.
  contextToAppId: ({ securityContext }) =>
    securityContext && securityContext.dataConnectionId
      ? `CUBE_APP_${securityContext.tenantId}_${securityContext.dataConnectionId}_${securityContext.relationFingerprint}`
      : 'CUBE_APP_system',

  driverFactory: async ({ securityContext, dataSource }) => {
    if (dataSource !== 'connector') {
      return {
        type: 'postgres',
        database: process.env.CUBEJS_DB_NAME,
        host: process.env.CUBEJS_DB_HOST,
        port: process.env.CUBEJS_DB_PORT,
        user: process.env.CUBEJS_DB_USER,
        password: process.env.CUBEJS_DB_PASS,
      };
    }
    if (!securityContext || !securityContext.dataConnectionId) {
      throw new Error('connector dataSource requires a Data Connection in securityContext');
    }
    const response = await fetch(
      `${process.env.INTERNAL_API_URL}/internal/v1/cube/model/${securityContext.tenantId}/${securityContext.dataConnectionId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.CUBE_INTERNAL_API_SECRET}`,
        },
      }
    );
    if (!response.ok) {
      throw new Error(
        `Connector driver config fetch failed with ${response.status} for data connection ${securityContext.dataConnectionId}`
      );
    }
    const model = await response.json();
    return {
      type: 'clickhouse',
      host: model.clickhouse.host,
      port: model.clickhouse.port,
      database: model.clickhouse.database,
      username: model.clickhouse.username,
      password: model.clickhouse.password,
      ssl: model.clickhouse.secure,
    };
  },
};
