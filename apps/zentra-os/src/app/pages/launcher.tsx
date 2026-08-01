import { Button } from '@open-zentra/foundation-design-system';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';

import { requestJson, type TokenSource } from '../api';
import type { IdentityContext, Investigation, Scenario } from '../types';

interface LauncherProps {
  readonly getToken: TokenSource;
  readonly identity: IdentityContext;
}

/**
 * The governed questions this tenant may ask, and the only way to start one.
 */
export const Launcher = ({ getToken, identity }: LauncherProps) => {
  const navigate = useNavigate();
  // The catalogue comes from the API rather than living here. The question text
  // used to be written out in this file and again in the service; a second
  // scenario would have made that three copies to keep in step.
  const scenarios = useQuery({
    queryKey: ['scenarios'],
    queryFn: () => requestJson<Scenario[]>('/v1/scenarios', getToken),
    enabled: true,
  });
  const mutation = useMutation({
    mutationFn: (scenarioKey: string) =>
      requestJson<Investigation>('/v1/investigations', getToken, {
        method: 'POST',
        body: JSON.stringify({ scenario_key: scenarioKey }),
      }),
    onSuccess: (investigation) =>
      navigate(`/investigations/${investigation.investigation_id}`, {
        state: { investigation },
      }),
  });

  const isViewer = identity.role === 'viewer';

  return (
    <section className="px-8 py-10">
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em]">
        <span className="text-foreground-muted">Evidence inquiries</span>
        <span className="text-primary">Governed synthetic scenarios</span>
      </div>

      <ul className="mt-10 flex list-none flex-col gap-14 p-0">
        {(scenarios.data ?? []).map((scenario, index) => (
          <li className="max-w-4xl" key={scenario.key}>
            <span
              className="font-mono text-xs tracking-[0.2em] text-foreground-muted"
              aria-hidden="true"
            >
              {String(index + 1).padStart(2, '0')}
            </span>
            <motion.h1
              className="mt-3 font-serif text-[clamp(2rem,4.4vw,3.5rem)] font-normal leading-[1.02] tracking-[-0.035em]"
              // Only the card being launched carries the shared-element id:
              // two elements with one layoutId at the same time cannot animate.
              layoutId={
                mutation.variables === scenario.key ? 'investigation-question' : undefined
              }
            >
              {scenario.question}
            </motion.h1>

            <div
              className="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground-muted"
              aria-label="Scenario constraints"
            >
              {[...scenario.facts, 'Governed metrics only'].map((fact) => (
                <span className="flex items-center gap-2" key={fact}>
                  <i className="h-1 w-1 rounded-full bg-primary" aria-hidden="true" />
                  {fact}
                </span>
              ))}
            </div>

            <Button
              className="mt-7"
              size="lg"
              loading={mutation.isPending && mutation.variables === scenario.key}
              disabled={isViewer || mutation.isPending}
              onClick={() => mutation.mutate(scenario.key)}
            >
              {isViewer ? 'Viewer access · read only' : 'Begin evidence trace'}
            </Button>
          </li>
        ))}
      </ul>

      {scenarios.error ? (
        <p className="mt-8 text-sm text-danger" role="alert">
          {scenarios.error.message}
        </p>
      ) : null}
      {mutation.error ? (
        <p className="mt-8 text-sm text-danger" role="alert">
          {mutation.error.message}
        </p>
      ) : null}

      <div className="mt-16 flex items-center gap-4 border-t border-border pt-5">
        <span className="h-1 w-1 rounded-full bg-primary" aria-hidden="true" />
        <strong className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground-muted">
          Every claim rechecked before you see it
        </strong>
      </div>
    </section>
  );
};
