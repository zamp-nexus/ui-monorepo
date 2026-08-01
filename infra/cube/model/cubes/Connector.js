// Dynamic, per-tenant cubes generated from a Data Connection's confirmed
// Join Graph. This is ADR-0014's governance intent ("only permitted joins
// are queryable") reimplemented as compiled-schema absence rather than a
// bespoke runtime gate: the internal endpoint below only ever emits
// confirmed Relations, so an unconfirmed join structurally cannot appear
// here — there is nothing to enforce at query time because there is
// nothing to query.
//
// Absent on the demo-warehouse path on purpose: COMPILE_CONTEXT carries no
// dataConnectionId there, and this module returns immediately rather than
// making a wasted (or failing) callback for every non-connector query.
// Duplicated in cube.js's driverFactory rather than shared: this file runs
// inside Cube's own schema-compiler sandbox, which does not support
// requiring a plain CommonJS helper module the way cube.js (a plain Node
// config module) does — verified empirically. Both call sites are ~15
// lines; the duplication is the accepted cost of that boundary.
async function fetchConnectorModel(securityContext) {
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
      `Connector model fetch failed with ${response.status} for data connection ${securityContext.dataConnectionId}`
    );
  }
  return response.json();
}

asyncModule(async () => {
  const { securityContext } = COMPILE_CONTEXT;
  if (!securityContext || !securityContext.dataConnectionId) {
    return;
  }

  const model = await fetchConnectorModel(securityContext);

  const joinsByTable = {};
  for (const join of model.joins) {
    (joinsByTable[join.fromTable] ??= []).push(join);
  }

  for (const table of model.tables) {
    const dimensions = {};
    const measures = {
      count: { type: 'count' },
    };
    for (const field of table.fields) {
      if (field.cubeType === 'number') {
        measures[field.name] = { sql: field.name, type: 'sum' };
      }
      dimensions[field.name] = { sql: field.name, type: field.cubeType };
    }

    const joins = {};
    for (const join of joinsByTable[table.name] ?? []) {
      joins[join.toTable] = {
        relationship: join.relationship,
        sql: `\${CUBE}.${join.fromField} = \${${join.toTable}}.${join.toField}`,
      };
    }

    cube(table.name, {
      sql: `SELECT * FROM ${table.sqlTable}`,
      dataSource: 'connector',
      measures,
      dimensions,
      joins,
    });
  }
});
