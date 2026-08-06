import { TRACE_LINES } from '../constants';

export const OperationsTrace = () => (
  <div className="operations-trace" role="region" aria-label="Example Nexus execution trace">
    <div className="operations-trace__header">
      <span>
        <span className="trace-live" aria-hidden="true" /> analysis-run / 0184
      </span>
      <span>production · eu-west</span>
    </div>
    <div className="operations-trace__summary">
      <span>
        status <strong>completed</strong>
      </span>
      <span>
        models <strong>3</strong>
      </span>
      <span>
        cost <strong>$0.084</strong>
      </span>
      <span>
        evidence <strong>4 refs</strong>
      </span>
    </div>
    <ol className="operations-trace__lines">
      {TRACE_LINES.map(([time, event, detail]) => (
        <li key={event}>
          <time>{time}</time>
          <code>{event}</code>
          <span>{detail}</span>
        </li>
      ))}
    </ol>
    <div className="operations-trace__footer">
      <span>replay://analysis-run/0184</span>
      <span>raw rows excluded</span>
    </div>
  </div>
);
